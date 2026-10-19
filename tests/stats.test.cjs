const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summarize } = require("../static/stats.js");
const now = Date.parse("2026-10-18T12:00:00Z");
const game = (day, goals, assists) => ({
  gameDate: `2026-10-${day}`,
  goals,
  assists,
});
test("hot requires three consecutive recent scoring games", () => {
  const s = summarize(
    [game(17, 1, 0), game(15, 0, 1), game(13, 1, 0), game(11, 0, 0)],
    false,
    now,
  );
  assert.equal(s.kind, "hot");
  assert.equal(s.streak, 3);
  assert.equal(s.points, 3);
});
test("seven points over five games is hot even without a streak", () => {
  assert.equal(
    summarize(
      [
        game(17, 0, 0),
        game(15, 2, 2),
        game(13, 1, 2),
        game(11, 0, 0),
        game(9, 0, 0),
      ],
      false,
      now,
    ).kind,
    "hot",
  );
});
test("two high-scoring games alone do not establish five-game hot threshold", () => {
  assert.equal(
    summarize([game(17, 4, 0), game(15, 3, 0)], false, now).kind,
    "normal",
  );
});
test("old scoring streak is labeled historical, never currently hot", () => {
  const s = summarize(
    [game("03", 1, 0), game("02", 2, 0), game("01", 1, 1)],
    false,
    now,
  );
  assert.equal(s.kind, "stale");
});
test("three recent pointless games count as point drought", () => {
  assert.equal(
    summarize([game(17, 0, 0), game(15, 0, 0), game(13, 0, 0)], false, now)
      .kind,
    "cold",
  );
});
test("missing or invalid stats never invent a form", () => {
  assert.equal(summarize([], false, now).kind, "neutral");
  assert.equal(
    summarize([{ gameDate: "2026-10-17" }], false, now).kind,
    "neutral",
  );
  assert.equal(
    summarize([{ gameDate: "invalid", goals: 4, assists: 4 }], false, now)
      .count,
    0,
  );
});
test("sorts game log and excludes future results", () => {
  const s = summarize(
    [game(13, 0, 0), game(20, 5, 5), game(17, 1, 1)],
    false,
    now,
  );
  assert.equal(s.games[0].gameDate, "2026-10-17");
  assert.equal(s.count, 2);
  assert.equal(s.points, 2);
});
test("goalie rate is weighted by shots, not an average of percentages", () => {
  const s = summarize(
    [
      { gameDate: "2026-10-17", shotsAgainst: 40, goalsAgainst: 2 },
      { gameDate: "2026-10-15", shotsAgainst: 10, goalsAgainst: 3 },
    ],
    true,
    now,
  );
  assert.equal(s.pct, 0.9);
  assert.notEqual(s.kind, "hot");
});
test("missing goalie shot data remains unavailable", () => {
  assert.equal(summarize([{ gameDate: "2026-10-17" }], true, now).pct, null);
});

test("league scoring leader marks every tied leader by NHL id", () => {
  const { leaders } = require("../static/stats.js");
  const result = leaders({
    points: [
      { id: 8478402, value: 14 },
      { id: 8477934, value: 14 },
      { id: 8475786, value: 8 },
    ],
  });
  assert.equal(result.points, 14);
  assert.deepEqual([...result.ids], [8478402, 8477934]);
  assert.equal(leaders({ points: [{ id: 8478402, value: 0 }] }).ids.size, 0);
  assert.throws(() => leaders({ points: [{ id: 8478402 }] }));
});

test("team scoring leaders include all ties without marking other clubs or zero scorers", () => {
  const { leaders } = require("../static/stats.js");
  const points = [
    { id: 8478402, value: 23, teamAbbrev: "EDM" },
    { id: 8478010, value: 12, teamAbbrev: "TBL" },
    { id: 8476453, value: 12, teamAbbrev: "TBL" },
    { id: 8478519, value: 8, teamAbbrev: "TBL" },
  ];
  const x = leaders({ points }, "TBL");
  assert.deepEqual([...x.ids], [8478402]);
  assert.deepEqual([...x.teamIds], [8478010, 8476453]);
  assert.equal(x.teamPoints, 12);
  assert.equal(leaders({ points }, "LAK").teamIds.size, 0);
  assert.equal(
    leaders({ points: [{ id: 8478010, value: 0, teamAbbrev: "TBL" }] }, "TBL")
      .teamIds.size,
    0,
  );
  const oilers = leaders({ points }, "EDM");
  assert.ok(oilers.ids.has(8478402) && oilers.teamIds.has(8478402));
});
