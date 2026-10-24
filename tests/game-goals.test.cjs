const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// Exercise the exact adapter and its browser-shared normalizer without changing
// this CommonJS repository into an ES-module project for the test runner.
const shared = fs.existsSync("static/game-goal-data.js")
  ? fs.readFileSync("static/game-goal-data.js", "utf8")
  : "";
const library = fs
  .readFileSync("lib/game-goals.js", "utf8")
  .replace(/^import\s[^;]+;\s*/gm, "")
  .replace(/\bexport\s+/g, "");
const source = fs
  .readFileSync("functions/api/game-goals.js", "utf8")
  .replace(/^import\s[^;]+;\s*/gm, "");
const handler = import(
  "data:text/javascript;base64," +
    Buffer.from(shared + "\n" + library + "\n" + source).toString("base64")
);
const gameId = 2026020166;
const request = (id = gameId) => ({
  request: new Request("https://test/api/game-goals?game=" + id),
});
const key = `https://test/api/game-goals?game=${gameId}`;
const savedKey = `https://test/api/game-goals-last-good?game=${gameId}`;
function goal(eventId, playerId, first, last, team, awayScore, homeScore) {
  return {
    eventId,
    playerId,
    firstName: { default: first },
    lastName: { default: last },
    name: { default: first[0] + ". " + last },
    teamAbbrev: { default: team },
    awayScore,
    homeScore,
    timeInPeriod: "03:20",
  };
}
const period = (number, goals) => ({
  periodDescriptor: { number, periodType: "REG" },
  goals,
});
const landing = () => ({
  id: gameId,
  gameDate: "2026-10-23",
  startTimeUTC: "2026-10-24T00:00:00Z",
  gameState: "OFF",
  periodDescriptor: { number: 3, periodType: "REG" },
  awayTeam: { abbrev: "MTL", score: 4 },
  homeTeam: { abbrev: "CHI", score: 1 },
  summary: {
    scoring: [
      period(1, [
        goal(100, 8484144, "Connor", "Bedard", "CHI", 0, 1),
        goal(200, 8478133, "Jake", "Evans", "MTL", 1, 1),
      ]),
      period(2, [
        goal(300, 8478133, "Jake", "Evans", "MTL", 2, 1),
        goal(400, 8482087, "Kaiden", "Guhle", "MTL", 3, 1),
      ]),
      period(3, [goal(500, 8476875, "Mike", "Matheson", "MTL", 4, 1)]),
    ],
  },
});
async function environment(run) {
  const original = {
    fetch: global.fetch,
    caches: global.caches,
    now: Date.now,
  };
  const records = new Map();
  let now = Date.parse("2026-10-24T10:00:00Z");
  global.caches = {
    default: {
      match: async (r) => records.get(r.url)?.clone(),
      put: async (r, value) => records.set(r.url, value.clone()),
    },
  };
  Date.now = () => now;
  try {
    await run({
      records,
      now: () => now,
      advance: (milliseconds) => (now += milliseconds),
      get: (await handler).onRequestGet,
    });
  } finally {
    global.fetch = original.fetch;
    global.caches = original.caches;
    Date.now = original.now;
  }
}

test("game-goal adapter validates game IDs before touching the fixed official source", async () => {
  await environment(async ({ get }) => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json(landing());
    };
    for (const id of [
      "",
      "202602016",
      "20260201666",
      "1999020166",
      "../2026020166",
      "https://evil.test",
    ])
      assert.equal((await get(request(id))).status, 400);
    assert.equal(calls, 0);
  });
});

test("one coalesced official landing yields exact per-game scorers and a six-hour final cache", async () => {
  await environment(async ({ get, records, now }) => {
    let calls = 0,
      release;
    const ready = new Promise((resolve) => (release = resolve));
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(
        url,
        `https://api-web.nhle.com/v1/gamecenter/${gameId}/landing`,
      );
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal);
      await ready;
      return Response.json(landing());
    };
    const pending = Array.from({ length: 5 }, () => get(request()));
    await new Promise(setImmediate);
    assert.equal(calls, 1);
    release();
    const responses = await Promise.all(pending);
    const result = responses[0];
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("X-Data-State"), "fresh");
    assert.equal(result.headers.get("X-Data-Source"), "NHL");
    assert.equal(
      result.headers.get("X-NHL-Checked-At"),
      new Date(now()).toISOString(),
    );
    assert.match(result.headers.get("Cache-Control"), /s-maxage=21600/);
    const data = await result.json();
    assert.equal(data.gameId, gameId);
    assert.equal(data.state, "OFF");
    assert.equal(data.away.code, "MTL");
    assert.equal(data.away.score, 4);
    assert.equal(data.away.complete, true);
    assert.equal(data.home.complete, true);
    assert.deepEqual(data.away.scorers, [
      { playerId: 8478133, name: "Jake Evans", goals: 2 },
      { playerId: 8482087, name: "Kaiden Guhle", goals: 1 },
      { playerId: 8476875, name: "Mike Matheson", goals: 1 },
    ]);
    assert.deepEqual(data.home.scorers, [
      { playerId: 8484144, name: "Connor Bedard", goals: 1 },
    ]);
    assert.equal(records.size, 2);
    assert.equal(
      records.get(savedKey).headers.get("Cache-Control"),
      "public, max-age=86400",
    );
    assert.equal((await get(request())).status, 200);
    assert.equal(
      calls,
      1,
      "A valid edge response avoids another official request",
    );
  });
});

test("live and incomplete final details refresh quickly while missing data never becomes invented zero goals", async () => {
  await environment(async ({ get, records }) => {
    for (const kind of ["live", "missing", "partial"]) {
      records.clear();
      const raw = landing();
      if (kind === "live") raw.gameState = "LIVE";
      if (kind === "missing") delete raw.summary;
      if (kind === "partial") raw.summary.scoring[2].goals = [];
      global.fetch = async () => Response.json(raw);
      const result = await get(request());
      assert.equal(result.status, 200);
      assert.match(result.headers.get("Cache-Control"), /s-maxage=60(?:\D|$)/);
      const data = await result.json();
      assert.equal(data.away.score, 4);
      assert.equal(data.home.score, 1);
      if (kind === "missing") {
        assert.equal(data.away.complete, false);
        assert.equal(data.home.complete, false);
        assert.deepEqual(data.away.scorers, []);
        assert.deepEqual(data.home.scorers, []);
      }
      if (kind === "partial") {
        assert.equal(data.away.complete, false);
        assert.equal(data.home.complete, true);
      }
      assert.equal(
        records.has(savedKey),
        kind === "live",
        "Only complete verified details become last-good data",
      );
    }
  });
});

test("an explicitly verified shutout has no goal scorers, distinct from missing goal details", async () => {
  await environment(async ({ get }) => {
    const raw = landing();
    raw.awayTeam.score = 1;
    raw.homeTeam.score = 0;
    raw.summary.scoring = [
      period(1, [goal(1, 8478133, "Jake", "Evans", "MTL", 1, 0)]),
    ];
    global.fetch = async () => Response.json(raw);
    const data = await (await get(request())).json();
    assert.equal(data.home.score, 0);
    assert.equal(data.home.complete, true);
    assert.deepEqual(data.home.scorers, []);
  });
});

test("wrong game identities, corrupt source data and rejected redirects never create successful caches", async () => {
  await environment(async ({ get, records }) => {
    const wrongId = landing();
    wrongId.id++;
    const wrongTeams = landing();
    wrongTeams.homeTeam.abbrev = "MTL";
    const wrongState = landing();
    wrongState.gameState = "UNKNOWN";
    for (const raw of [wrongId, wrongTeams, wrongState]) {
      global.fetch = async () => Response.json(raw);
      const result = await get(request());
      assert.equal(result.status, 502);
      assert.equal(result.headers.get("Cache-Control"), "no-store");
      assert.equal(records.size, 0);
    }
    global.fetch = async () =>
      new Response("{invalid", {
        headers: { "Content-Type": "application/json" },
      });
    assert.equal((await get(request())).status, 502);
    global.fetch = async () =>
      new Response(null, {
        status: 307,
        headers: { Location: "https://evil.test/goals" },
      });
    assert.equal((await get(request())).status, 502);
    assert.equal(records.size, 0);
  });
});

test("transient source failures use only same-game last-good details and preserve their original age", async () => {
  await environment(async ({ get, records, advance, now }) => {
    global.fetch = async () => Response.json(landing());
    const first = await get(request());
    const checked = first.headers.get("X-NHL-Checked-At");
    const expected = await first.json();
    const sourceTime = now();
    records.delete(key);
    advance(300000);
    for (const failure of ["connection", "503"]) {
      global.fetch = async () => {
        if (failure === "connection") throw Error("Offline");
        return new Response(null, { status: 503 });
      };
      const result = await get(request());
      assert.equal(result.status, 200);
      assert.equal(result.headers.get("X-Data-State"), "stale");
      assert.equal(result.headers.get("X-NHL-Checked-At"), checked);
      assert.equal(result.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await result.json(), expected);
      assert.equal(
        records.get(savedKey).headers.get("X-NHL-Checked-At"),
        checked,
      );
    }
    assert.equal(
      (await get(request(gameId + 1))).status,
      502,
      "Another game cannot use this backup",
    );
    advance(86400001 - (now() - sourceTime));
    assert.equal(
      (await get(request())).status,
      502,
      "An expired backup cannot gain a new source date",
    );
  });
});

test("permanent errors, malformed payloads and redirects cannot be disguised by last-good data", async () => {
  await environment(async ({ get, records }) => {
    global.fetch = async () => Response.json(landing());
    assert.equal((await get(request())).status, 200);
    records.delete(key);
    for (const status of [403, 404, 429, 302]) {
      global.fetch = async () => new Response(null, { status });
      const result = await get(request());
      assert.equal(result.status, status === 429 ? 503 : 502);
      assert.equal(result.headers.get("Cache-Control"), "no-store");
      assert.notEqual(result.headers.get("X-Data-State"), "stale");
    }
    global.fetch = async () => Response.json({ ...landing(), id: gameId + 1 });
    assert.equal((await get(request())).status, 502);
    assert.equal(
      records.size,
      1,
      "Errors never populate the normal success cache",
    );
  });
});

test("rate-limit responses preserve bounded Retry-After values without successful cache entries", async () => {
  await environment(async ({ get, records, now }) => {
    for (const [status, value, expected] of [
      [429, null, "60"],
      [429, "120", "120"],
      [429, "99999", "3600"],
      [429, "bad", "60"],
      [429, new Date(now() + 120000).toUTCString(), "120"],
      [503, "180", "180"],
    ]) {
      global.fetch = async () =>
        new Response(null, {
          status,
          headers: value === null ? {} : { "Retry-After": value },
        });
      const result = await get(request());
      assert.equal(result.status, 503);
      assert.equal(result.headers.get("Retry-After"), expected);
      assert.equal(result.headers.get("X-Upstream-Status"), String(status));
      assert.equal(result.headers.get("Cache-Control"), "no-store");
      assert.equal(records.size, 0);
    }
  });
});
