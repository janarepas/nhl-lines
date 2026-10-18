const { test } = require("node:test");
const assert = require("node:assert/strict");
const { lastCompleted, fromShifts, valid } = require("../static/last-game.js");
function fixture() {
  const p = (playerId, position) => ({
    playerId,
    position,
    name: { default: "Player " + playerId },
    toi: "01:00",
  });
  const box = {
    id: 2026020001,
    gameState: "OFF",
    gameDate: "2026-10-17",
    homeTeam: { id: 1, abbrev: "TBL", score: 3 },
    awayTeam: { id: 2, abbrev: "BOS", score: 1 },
    playerByGameStats: {
      homeTeam: {
        forwards: [1, 2, 3, 4].map((id) => p(id, "C")),
        defense: [7, 8].map((id) => p(id, "D")),
        goalies: [{ ...p(10, "G"), starter: true }],
      },
      awayTeam: {
        forwards: [21, 22, 23].map((id) => p(id, "C")),
        defense: [24, 25].map((id) => p(id, "D")),
        goalies: [p(26, "G")],
      },
    },
  };
  const data = [];
  const time = (s) =>
    String(Math.floor(s / 60)).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0");
  const add = (ids, a, b) =>
    ids.forEach((playerId) =>
      data.push({
        playerId,
        typeCode: 517,
        gameId: box.id,
        period: 1,
        startTime: time(a),
        endTime: time(b),
        firstName: "Player",
        lastName: String(playerId),
      }),
    );
  add([1, 2, 3, 7, 8, 10, 21, 22, 23, 24, 25, 26], 0, 60);
  add([1, 2, 3, 7, 8, 10, 21, 22, 24, 25, 26], 60, 90);
  add([1, 2, 7, 8, 10, 21, 22, 23, 24, 25, 26], 90, 120);
  add([1, 2, 3, 4, 7, 8, 21, 22, 23, 24, 25, 26], 120, 150);
  return { box, chart: { data, total: data.length } };
}
test("fallback measures actual 5v5, PP and PK and excludes pulled goalie time", () => {
  const { box, chart } = fixture();
  const data = fromShifts(box, chart, "TBL");
  assert.ok(valid(data));
  assert.deepEqual(data.forwards, [[1, 2, 3]]);
  assert.equal(data.measured.forwards[0].seconds, 60);
  assert.equal(data.measured.pp[0].seconds, 30);
  assert.equal(data.measured.pk[0].seconds, 30);
  assert.equal(data.pp.length, 1);
  assert.equal(data.coverage, 120);
});
test("shift duplicates never inflate shared time", () => {
  const { box, chart } = fixture();
  chart.data.push({ ...chart.data[0] });
  chart.total++;
  assert.equal(fromShifts(box, chart, "TBL").measured.forwards[0].seconds, 60);
});
test("missing, truncated or wrong-game charts cannot produce a lineup", () => {
  const { box, chart } = fixture();
  assert.throws(() =>
    fromShifts(box, { ...chart, total: chart.data.length + 1 }, "TBL"),
  );
  assert.throws(() =>
    fromShifts(
      box,
      { data: chart.data.map((r) => ({ ...r, gameId: 1 })) },
      "TBL",
    ),
  );
  assert.throws(() =>
    fromShifts(
      box,
      { data: chart.data.filter((r) => r.playerId !== 10) },
      "TBL",
    ),
  );
  assert.equal(valid({ type: "nhl-last-game", version: 1 }), false);
});
test("schedule uses only completed games for the selected club", () => {
  const make = (id, gameState, startTimeUTC, abbrev = "TBL") => ({
    id,
    gameState,
    startTimeUTC,
    homeTeam: { abbrev },
    awayTeam: { abbrev: "BOS" },
  });
  const result = lastCompleted(
    {
      games: [
        make(1, "OFF", "2026-10-16"),
        make(2, "LIVE", "2026-10-17"),
        make(3, "OFF", "2026-10-19"),
        make(4, "OFF", "2026-10-17", "TOR"),
      ],
    },
    "TBL",
    Date.parse("2026-10-18"),
  );
  assert.equal(result.id, 1);
});
