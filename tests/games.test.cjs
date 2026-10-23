const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
require("../static/games.js");
const handler = import(
  "data:text/javascript;base64," +
    Buffer.from(fs.readFileSync("functions/api/games.js")).toString("base64")
);
const rawGame = () => ({
  id: 2026020137,
  startTimeUTC: "2026-10-20T23:00:00Z",
  gameState: "FUT",
  gameScheduleState: "OK",
  awayTeam: { abbrev: "ANA" },
  homeTeam: { abbrev: "NYR" },
  periodDescriptor: { number: 2, periodType: "REG" },
  clock: { timeRemaining: "12:20" },
});
test("game dates and start times use the client timezone and preserve next-day European starts", () => {
  assert.equal(
    GameScores.day(new Date("2026-10-20T22:30:00Z"), "Europe/Budapest"),
    "2026-10-21",
  );
  assert.equal(
    GameScores.day(new Date("2026-10-20T22:30:00Z"), "America/New_York"),
    "2026-10-20",
  );
  const data = GameScores.normalize({
    currentDate: "2026-10-20",
    games: [rawGame()],
  });
  assert.ok(GameScores.valid(data, "2026-10-20"));
  assert.match(
    GameScores.status(data.games[0], "Europe/Budapest"),
    /21 Oct.*01:00/,
  );
  assert.equal(
    data.games[0].away.score,
    null,
    "Missing scores never become fake zeroes",
  );
  const live = { ...data.games[0], state: "LIVE" };
  assert.equal(GameScores.status(live), "P2 · 12:20");
  assert.equal(GameScores.interval({ games: [live] }), 60000);
  assert.equal(
    GameScores.status({ ...live, state: "OFF", outcome: "OT" }),
    "Final · OT",
  );
  assert.equal(
    GameScores.status({ ...live, scheduleState: "PPD" }),
    "Postponed",
  );
  assert.equal(GameScores.interval(data), 300000);
  assert.equal(GameScores.interval({ games: [] }), 900000);
});
test("score proxy validates dates, fixed origin, game identity and upstream failure without caching errors", async () => {
  const { onRequestGet } = await handler;
  const original = global.fetch;
  let calls = 0;
  try {
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(url, "https://api-web.nhle.com/v1/score/2026-10-20");
      assert.equal(options.redirect, "manual");
      return Response.json({ currentDate: "2026-10-20", games: [rawGame()] });
    };
    const request = (date) => ({
      request: new Request("https://test/api/games?date=" + date),
    });
    for (const date of ["2026-02-30", "https://evil.test", "2026-13-01", ""])
      assert.equal((await onRequestGet(request(date))).status, 400);
    assert.equal(calls, 0);
    const ok = await onRequestGet(request("2026-10-20"));
    assert.equal(ok.status, 200);
    assert.ok(GameScores.valid(await ok.json(), "2026-10-20"));
    assert.equal(ok.headers.get("X-Data-Source"), "NHL");
    for (const payload of [
      { currentDate: "2026-10-19", games: [] },
      { currentDate: "2026-10-20", games: [rawGame(), rawGame()] },
      {
        currentDate: "2026-10-20",
        games: [{ ...rawGame(), gameState: "UNKNOWN" }],
      },
    ]) {
      global.fetch = async () => Response.json(payload);
      const bad = await onRequestGet(request("2026-10-20"));
      assert.equal(bad.status, 502);
      assert.equal(bad.headers.get("Cache-Control"), "no-store");
    }
    global.fetch = async () =>
      Response.json({ currentDate: "2026-10-20", games: [] });
    assert.deepEqual(
      (await (await onRequestGet(request("2026-10-20"))).json()).games,
      [],
    );
    global.fetch = async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.test" },
      });
    assert.equal((await onRequestGet(request("2026-10-20"))).status, 502);
  } finally {
    global.fetch = original;
  }
});

test("scores retain same-date last-good data only for transient failures and never renew its original age", async () => {
  const { onRequestGet } = await handler;
  const originalFetch = global.fetch,
    originalCaches = global.caches,
    originalNow = Date.now;
  let now = originalNow(),
    mode = "fresh",
    calls = 0;
  const records = new Map();
  const request = (date) => ({
    request: new Request("https://test/api/games?date=" + date),
  });
  try {
    Date.now = () => now;
    global.caches = {
      default: {
        match: async (key) => records.get(key.url)?.clone(),
        put: async (key, value) => records.set(key.url, value.clone()),
      },
    };
    global.fetch = async () => {
      calls++;
      if (mode === "connection") throw Error("Offline");
      if (mode === "bad")
        return Response.json({ currentDate: "2026-10-19", games: [] });
      if (mode !== "fresh") return new Response(null, { status: Number(mode) });
      return Response.json({ currentDate: "2026-10-20", games: [rawGame()] });
    };
    const first = await onRequestGet(request("2026-10-20"));
    assert.equal(first.headers.get("X-Data-State"), "fresh");
    const checked = first.headers.get("X-NHL-Checked-At");
    now = Date.parse(checked) + 1000;
    const expected = await first.json();
    await onRequestGet(request("2026-10-20"));
    assert.equal(calls, 1, "Fresh short cache shares the source response");
    records.delete("https://test/api/games?date=2026-10-20");
    for (const transient of ["503", "connection"]) {
      mode = transient;
      const saved = await onRequestGet(request("2026-10-20"));
      assert.equal(saved.status, 200);
      assert.equal(saved.headers.get("X-Data-State"), "stale");
      assert.equal(saved.headers.get("X-NHL-Checked-At"), checked);
      assert.equal(saved.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await saved.json(), expected);
    }
    for (const permanent of ["403", "429", "302", "bad"]) {
      mode = permanent;
      const denied = await onRequestGet(request("2026-10-20"));
      assert.equal(denied.status, 502);
      assert.equal(denied.headers.get("Cache-Control"), "no-store");
    }
    mode = "503";
    assert.equal(
      (await onRequestGet(request("2026-10-21"))).status,
      502,
      "Another date cannot use the saved game day",
    );
    now = Date.parse(checked) + 86400001;
    assert.equal(
      (await onRequestGet(request("2026-10-20"))).status,
      502,
      "Expired last-good data is never refreshed by fallback use",
    );
  } finally {
    global.fetch = originalFetch;
    global.caches = originalCaches;
    Date.now = originalNow;
  }
});
