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

test("goalies show weighted save rate, time-weighted GAA and W-L-OT record", () => {
  const data = [
    {
      gameDate: "2026-10-17",
      shotsAgainst: 30,
      goalsAgainst: 2,
      toi: "60:00",
      decision: "W",
    },
    {
      gameDate: "2026-10-16",
      shotsAgainst: 20,
      goalsAgainst: 1,
      toi: "30:00",
      decision: "O",
    },
  ];
  const s = summarize(data, true, now);
  assert.equal(s.pct, 0.94);
  assert.equal(s.gaa, 2);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 0);
  assert.equal(s.overtimeLosses, 1);
  const partial = summarize(
    [data[0], { gameDate: "2026-10-16", goalsAgainst: 1 }],
    true,
    now,
  );
  assert.equal(partial.pct, null);
  assert.equal(partial.gaa, null);
  assert.equal(partial.wins, null);
  assert.equal(summarize([{ ...data[0], toi: "60:99" }], true, now).gaa, null);
  assert.equal(summarize([], true, now).goalie, true);
});

test("goalie form uses exact weighted SV% boundaries with three recent appearances", () => {
  const games = (pairs) =>
    pairs.map(([shotsAgainst, goalsAgainst], i) => ({
      gameDate: `2026-10-${17 - i}`,
      shotsAgainst,
      goalsAgainst,
    }));
  const hot = summarize(
    games([
      [30, 2],
      [30, 2],
      [40, 3],
    ]),
    true,
    now,
  );
  assert.equal(hot.pct, 0.93);
  assert.equal(hot.kind, "hot");
  assert.equal(hot.label, "Hot streak");
  const lower = summarize(
    games([
      [30, 3],
      [30, 3],
      [40, 5],
    ]),
    true,
    now,
  );
  assert.equal(lower.pct, 0.89);
  assert.equal(lower.kind, "normal");
  assert.equal(lower.label, "Steady form");
  assert.equal(
    summarize(
      games([
        [30, 4],
        [30, 4],
        [40, 4],
      ]),
      true,
      now,
    ).kind,
    "cold",
  );
  assert.equal(
    summarize(
      games([
        [30, 3],
        [30, 3],
        [40, 2],
      ]),
      true,
      now,
    ).kind,
    "normal",
  );
  const weighted = summarize(
    games([
      [10, 3],
      [40, 0],
      [50, 2],
    ]),
    true,
    now,
  );
  assert.equal(weighted.pct, 0.95);
  assert.equal(
    weighted.kind,
    "hot",
    "Weight by shots instead of averaging game percentages",
  );
});
test("goalie form withholds ratings for sparse, incomplete, invalid or old records", () => {
  const valid = { gameDate: "2026-10-17", shotsAgainst: 30, goalsAgainst: 1 };
  assert.equal(summarize([valid, valid], true, now).kind, "neutral");
  assert.match(summarize([valid, valid], true, now).label, /Not enough/);
  assert.equal(
    summarize([valid, valid, { ...valid, shotsAgainst: null }], true, now).kind,
    "neutral",
  );
  assert.equal(
    summarize([valid, valid, { ...valid, goalsAgainst: 31 }], true, now).pct,
    null,
  );
  assert.equal(
    summarize([valid, valid, { ...valid, shotsAgainst: -1 }], true, now).kind,
    "neutral",
  );
  assert.equal(
    summarize(
      Array(3).fill({ ...valid, shotsAgainst: 0, goalsAgainst: 0 }),
      true,
      now,
    ).kind,
    "neutral",
  );
  assert.equal(
    summarize(Array(3).fill({ ...valid, gameDate: "2026-09-01" }), true, now)
      .kind,
    "stale",
  );
});

test("header scoring leaders use season totals, preserve ties and reject incomplete data", () => {
  const { teamScorers } = require("../static/stats.js");
  const player = (id, goals, assists) => ({
    playerId: id,
    firstName: { default: "Test" },
    lastName: { default: "Player" + id },
    gamesPlayed: 8,
    goals,
    assists,
    points: goals + assists,
    plusMinus: 2,
    shots: 20,
  });
  const data = {
    season: "20262027",
    gameType: 2,
    skaters: [
      player(8470000, 2, 8),
      player(8470014, 4, 6),
      player(8470001, 1, 1),
    ],
  };
  const x = teamScorers(data);
  assert.equal(x.season, "20262027");
  assert.deepEqual(
    x.players.map((p) => p.playerId),
    [8470000, 8470014],
  );
  assert.equal(
    teamScorers({ ...data, skaters: [player(8470000, 0, 0)] }).players.length,
    0,
  );
  assert.throws(() => teamScorers({ skaters: data.skaters }));
  assert.throws(() =>
    teamScorers({ ...data, skaters: [{ ...data.skaters[0], points: 99 }] }),
  );
});
