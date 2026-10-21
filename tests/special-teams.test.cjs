const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
require("../static/published-lines.js");
require("../static/penalty-kill.js");
const table = fs
  .readFileSync("lib/espn-teams.js", "utf8")
  .replace("export default", "const teams =");
const library = fs
  .readFileSync("lib/special-teams.js", "utf8")
  .replace("export function", "function");
const handlerSource = fs
  .readFileSync("functions/api/special-teams.js", "utf8")
  .replace(/import teams from [^;]+;/, table)
  .replace(/import \{ rankedSpecialTeams \} from [^;]+;/, library);
const handler = import(
  "data:text/javascript;base64," + Buffer.from(handlerSource).toString("base64")
);
const ranked = Function(library + ";return rankedSpecialTeams")();
const athlete = (displayName, rank) => ({ displayName, rank });
const raw = () => ({
  depthchart: [
    {
      name: "Power Play",
      positions: Object.fromEntries(
        ["lw", "c", "rw", "ld", "rd"].map((p) => [
          p,
          { athletes: [athlete(p + " Two", 2), athlete(p + " One", 1)] },
        ]),
      ),
    },
    {
      name: "Penalty Kill",
      positions: {
        c: {
          athletes: [
            athlete("Forward Three", 2),
            athlete("Forward One", 1),
            athlete("Forward Two", 1),
          ],
        },
        lw: { athletes: [athlete("Forward Four", 2)] },
        d: {
          athletes: [
            athlete("Defense Three", 2),
            athlete("Defense One", 1),
            athlete("Defense Four", 2),
            athlete("Defense Two", 1),
          ],
        },
      },
    },
  ],
});
test("PP and PK use explicit source ranks, preserve two forwards/two defensemen and never guess missing ranks", () => {
  const units = ranked(raw());
  assert.deepEqual(
    units.pp.map((r) => r.length),
    [5, 5],
  );
  assert.deepEqual(
    units.pk.map((r) => r.map((p) => p.group)),
    [
      ["F", "F", "D", "D"],
      ["F", "F", "D", "D"],
    ],
  );
  assert.deepEqual(
    units.pk[0].map((p) => p.name),
    ["Forward One", "Forward Two", "Defense One", "Defense Two"],
  );
  const missing = raw();
  delete missing.depthchart[1].positions.d.athletes[1].rank;
  assert.deepEqual(ranked(missing).pk[0], [], "No invented fourth member");
  const noRanks = raw();
  noRanks.depthchart
    .flatMap((c) => Object.values(c.positions))
    .forEach((p) => p.athletes.forEach((a) => delete a.rank));
  assert.deepEqual(ranked(noRanks), { pp: [[], []], pk: [[], []] });
  assert.throws(() => ranked({ depthchart: [] }));
});
test("unit identities resolve verified names and retain unknown participants without invented NHL IDs", () => {
  const data = {
    team: "ANA",
    source: "ESPN",
    sourceUrl: "https://www.espn.com/nhl/team/depth/_/id/25",
    ...ranked(raw()),
  };
  const roster = [{ id: 8480001, name: "Forward One", group: "F" }];
  let parsed = PenaltyKill.parseSpecial(data, roster, "ANA");
  assert.equal(parsed.pk[0][0], 8480001);
  assert.ok(parsed.pk[0][1].startsWith("dfo:"));
  assert.ok(
    parsed.extra.every((p) => p.unmatched && p.specialOnly && !p.image),
  );
  parsed = PenaltyKill.parseSpecial(
    data,
    [...roster, { id: 8480002, name: "Forward Two", group: "F" }],
    "ANA",
  );
  assert.equal(parsed.pk[0][1], 8480002);
  assert.throws(() =>
    PenaltyKill.parseSpecial(
      { ...data, sourceUrl: "https://evil.test/" },
      roster,
      "ANA",
    ),
  );
  const wrong = structuredClone(data);
  wrong.pk[0][0].group = "D";
  assert.throws(() => PenaltyKill.parseSpecial(wrong, roster, "ANA"));
});
test("special-teams API covers 32 fixed teams, shares cold requests, caches success and exposes failures honestly", async () => {
  const { onRequestGet } = await handler;
  const fetch = global.fetch,
    caches = global.caches;
  let calls = 0;
  const stored = new Map();
  global.caches = {
    default: {
      match: async (r) => stored.get(r.url)?.clone(),
      put: async (r, v) => stored.set(r.url, v.clone()),
    },
  };
  global.fetch = async (url, options) => {
    calls++;
    assert.match(
      url,
      /^https:\/\/site.api.espn.com\/apis\/site\/v2\/sports\/hockey\/nhl\/teams\/\d+\/depthcharts$/,
    );
    assert.equal(options.redirect, "manual");
    return Response.json(raw());
  };
  const get = (team) =>
    onRequestGet({
      request: new Request("https://test/api/special-teams?team=" + team),
    });
  try {
    await Promise.all(Array.from({ length: 5 }, () => get("ANA")));
    assert.equal(calls, 1);
    await get("ANA");
    assert.equal(calls, 1);
    const teams = [...table.matchAll(/^  ([A-Z]{3}):/gm)].map((m) => m[1]);
    assert.equal(teams.length, 32);
    for (const team of teams) {
      const res = await get(team);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.team, team);
      assert.deepEqual(
        data.pp.map((r) => r.length),
        [5, 5],
      );
      assert.deepEqual(
        data.pk.map((r) => r.length),
        [4, 4],
      );
    }
    assert.equal(calls, 32);
    assert.equal((await get("../bad")).status, 400);
    assert.equal(calls, 32);
    stored.clear();
    global.fetch = async () => new Response("Denied", { status: 403 });
    const bad = await get("ANA");
    assert.equal(bad.status, 502);
    assert.equal(bad.headers.get("Cache-Control"), "no-store");
    assert.equal(stored.size, 0);
  } finally {
    global.fetch = fetch;
    global.caches = caches;
  }
});
