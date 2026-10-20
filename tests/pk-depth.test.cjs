const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
require("../static/published-lines.js");
require("../static/penalty-kill.js");
const table = fs
  .readFileSync("lib/espn-teams.js", "utf8")
  .replace("export default", "const teams =");
const source = fs
  .readFileSync("functions/api/pk-depth.js", "utf8")
  .replace(/import teams from [^;]+;/, table);
const handler = import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const raw = () => ({
  depthchart: [
    {
      name: "Penalty Kill",
      positions: {
        c: { athletes: [{ displayName: "Joshua Mahura" }] },
        d: {
          athletes: [
            { displayName: "Elias N. Pettersson" },
            { displayName: "Unmatched Player" },
          ],
        },
      },
    },
  ],
});
test("PK depth remains a participant list, retains missing names, and resolves verified identities", () => {
  const data = {
    team: "VAN",
    source: "ESPN",
    forwards: ["Forward One"],
    defense: ["Elias N. Pettersson", "Unmatched Player"],
    sourceUrl: "https://www.espn.com/nhl/team/depth/_/id/22",
  };
  const roster = [
    { id: 1234567, name: "Forward One", group: "F" },
    { id: 8480012, name: "Elias Pettersson", group: "F" },
    { id: 8483678, name: "Elias Pettersson", group: "D" },
  ];
  const result = PenaltyKill.parseDepth(data, roster, "VAN");
  assert.deepEqual(result.units, []);
  assert.deepEqual(result.depth.defense, [8483678]);
  assert.deepEqual(result.unmatched.defense, ["Unmatched Player"]);
  assert.deepEqual(result.depth.forwards, [1234567]);
  assert.throws(() =>
    PenaltyKill.parseDepth(
      { ...data, sourceUrl: "javascript:alert(1)" },
      roster,
      "VAN",
    ),
  );
  assert.throws(() => PenaltyKill.parseDepth(data, roster, "ANA"));
});
test("ESPN PK proxy covers exactly 32 mapped teams and rejects untrusted input or malformed charts", async () => {
  const { onRequestGet } = await handler;
  const original = global.fetch;
  let count = 0;
  try {
    global.fetch = async (url, options) => {
      count++;
      assert.equal(options.redirect, "manual");
      assert.match(
        url,
        /^https:\/\/site.api.espn.com\/apis\/site\/v2\/sports\/hockey\/nhl\/teams\/\d+\/depthcharts$/,
      );
      return Response.json(raw());
    };
    const codes = [
      ...fs
        .readFileSync("lib/espn-teams.js", "utf8")
        .matchAll(/^  ([A-Z]{3}):/gm),
    ].map((m) => m[1]);
    assert.equal(codes.length, 32);
    for (const team of codes) {
      const response = await onRequestGet({
        request: new Request("https://test/api/pk-depth?team=" + team),
      });
      assert.equal(response.status, 200, team);
      const data = await response.json();
      assert.equal(data.team, team);
      assert.equal(data.source, "ESPN");
      assert.deepEqual(data.defense, [
        "Elias N. Pettersson",
        "Unmatched Player",
      ]);
      assert.ok(!("units" in data));
    }
    assert.equal(count, 32);
    assert.equal(
      (
        await onRequestGet({
          request: new Request("https://test/api/pk-depth?team=EVIL"),
        })
      ).status,
      400,
    );
    assert.equal(count, 32);
    global.fetch = async () => Response.json({ depthchart: [] });
    const bad = await onRequestGet({
      request: new Request("https://test/api/pk-depth?team=ANA"),
    });
    assert.equal(bad.status, 502);
    assert.equal(bad.headers.get("Cache-Control"), "no-store");
  } finally {
    global.fetch = original;
  }
});
