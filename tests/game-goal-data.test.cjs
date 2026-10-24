const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../static/game-goal-data.js");

const gameId = 2026020166;
const goal = (
  playerId,
  name,
  teamAbbrev,
  awayScore,
  homeScore,
  periodType = "REG",
) => ({
  playerId,
  firstName: { default: name.split(" ")[0] },
  lastName: { default: name.split(" ").slice(1).join(" ") },
  name: { default: name },
  teamAbbrev,
  awayScore,
  homeScore,
  goalsToDate: 77,
  periodDescriptor: { number: periodType === "SO" ? 5 : 1, periodType },
  timeInPeriod: "01:23",
});
const score = () => ({
  id: gameId,
  gameState: "OFF",
  awayTeam: { abbrev: "MTL", score: 2 },
  homeTeam: { abbrev: "CHI", score: 1 },
  periodDescriptor: { number: 3, periodType: "REG" },
  gameOutcome: { lastPeriodType: "REG" },
  goals: [
    goal(8484144, "Connor Bedard", "CHI", 0, 1),
    goal(8478133, "Jake Evans", "MTL", 1, 1),
    goal(8478133, "Jake Evans", "MTL", 2, 1),
  ],
});
const landing = (raw) => ({
  ...raw,
  summary: {
    scoring: raw.goals && [
      {
        periodDescriptor: { number: 1, periodType: "REG" },
        goals: raw.goals.map((g, index) => ({
          ...g,
          eventId: index + 1,
          teamAbbrev: { default: g.teamAbbrev },
        })),
      },
    ],
  },
});

test("score and landing adapters agree on verified player IDs and per-game goal totals", () => {
  const raw = score(),
    data = GameGoalData.normalizeScore(raw);
  assert.equal(data.source, "NHL");
  assert.equal(data.gameId, gameId);
  assert.equal(data.away.complete, true);
  assert.equal(data.home.complete, true);
  assert.deepEqual(data.away.scorers, [
    { playerId: 8478133, name: "Jake Evans", goals: 2 },
  ]);
  assert.deepEqual(data.home.scorers, [
    { playerId: 8484144, name: "Connor Bedard", goals: 1 },
  ]);
  assert.deepEqual(GameGoalData.normalizeLanding(landing(raw), gameId), data);
  const reversed = { ...raw, goals: [...raw.goals].reverse() };
  assert.deepEqual(
    GameGoalData.normalizeScore(reversed),
    data,
    "Cumulative scores establish source order without guessing goal counts",
  );
});

test("missing goal data remains unavailable rather than becoming invented empty scorer lists", () => {
  for (const value of [undefined, null]) {
    const raw = { ...score(), goals: value },
      data = GameGoalData.normalizeScore(raw);
    assert.equal(data.away.complete, false);
    assert.equal(data.home.complete, false);
    assert.deepEqual(data.away.scorers, []);
    assert.equal(
      GameGoalData.normalizeLanding(landing(raw), gameId).away.complete,
      false,
    );
  }
  for (const invalid of [{}, "goals", new Array(201).fill(null)]) {
    assert.equal(
      GameGoalData.normalizeScore({ ...score(), goals: invalid }),
      null,
      "Malformed optional goal data does not throw away the independent scoreboard",
    );
  }
});

test("only verified zero-goal summaries confirm a shutout", () => {
  const raw = score();
  raw.awayTeam.score = 0;
  raw.goals = [raw.goals[0]];
  const data = GameGoalData.normalizeScore(raw);
  assert.equal(data.away.complete, true);
  assert.deepEqual(data.away.scorers, []);
  assert.equal(data.home.complete, true);
  delete raw.goals;
  assert.equal(GameGoalData.normalizeScore(raw).away.complete, false);
});

test("partial player fields withhold completeness while retaining separately verified scorers", () => {
  const raw = score();
  delete raw.goals[0].playerId;
  const data = GameGoalData.normalizeScore(raw);
  assert.equal(data.home.complete, false);
  assert.deepEqual(data.home.scorers, []);
  assert.equal(data.away.complete, true);
  assert.equal(data.away.scorers[0].goals, 2);
  const missingEvent = score();
  missingEvent.goals = missingEvent.goals.slice(1);
  assert.equal(GameGoalData.normalizeScore(missingEvent).away.complete, false);
});

test("future or pregame payloads never expose scoring events as played goals", () => {
  for (const state of ["FUT", "PRE"]) {
    const raw = { ...score(), gameState: state },
      data = GameGoalData.normalizeScore(raw);
    assert.equal(data.state, state);
    assert.deepEqual(data.away.scorers, []);
    assert.deepEqual(data.home.scorers, []);
    assert.equal(data.away.complete, false);
    assert.deepEqual(GameGoalData.normalizeLanding(landing(raw), gameId), data);
  }
});

test("shootout attempts and the deciding scoreboard point never count as player goals", () => {
  const raw = score();
  raw.awayTeam.score = 3;
  raw.homeTeam.score = 2;
  raw.gameOutcome.lastPeriodType = "SO";
  raw.periodDescriptor = { number: 5, periodType: "SO" };
  raw.goals.push(goal(8484144, "Connor Bedard", "CHI", 2, 2));
  raw.goals.push(goal(8482087, "Kaiden Guhle", "MTL", 3, 2, "SO"));
  const data = GameGoalData.normalizeScore(raw);
  assert.equal(data.shootout, true);
  assert.equal(data.outcome, "SO");
  assert.equal(data.away.complete, true);
  assert.equal(data.home.complete, true);
  assert.deepEqual(data.away.scorers, [
    { playerId: 8478133, name: "Jake Evans", goals: 2 },
  ]);
  assert.equal(data.home.scorers[0].goals, 2);
  const detailed = landing(raw);
  detailed.summary.scoring[0].goals.pop();
  detailed.summary.scoring.push({
    periodDescriptor: { number: 5, periodType: "SO" },
    goals: [
      { ...raw.goals.at(-1), eventId: 999, teamAbbrev: { default: "MTL" } },
    ],
  });
  assert.deepEqual(GameGoalData.normalizeLanding(detailed, gameId), data);
});

test("a 1–0 shootout result correctly has no physical player goals", () => {
  const raw = score();
  raw.awayTeam.score = 1;
  raw.homeTeam.score = 0;
  raw.gameOutcome.lastPeriodType = "SO";
  raw.goals = [goal(8478133, "Jake Evans", "MTL", 1, 0, "SO")];
  const data = GameGoalData.normalizeScore(raw);
  assert.equal(data.shootout, true);
  assert.equal(data.away.complete, true);
  assert.equal(data.home.complete, true);
  assert.deepEqual(data.away.scorers, []);
  assert.deepEqual(data.home.scorers, []);
});

test("duplicated or contradictory progression cannot invent extra goals", () => {
  const raw = score();
  raw.goals.push({ ...raw.goals.at(-1) });
  assert.equal(GameGoalData.normalizeScore(raw), null);
  const repeated = landing(score());
  repeated.summary.scoring[0].goals.push({
    ...repeated.summary.scoring[0].goals.at(-1),
  });
  assert.equal(
    GameGoalData.normalizeLanding(repeated, gameId).away.complete,
    false,
  );
  const impossible = score();
  impossible.awayTeam.score = 1;
  assert.equal(GameGoalData.normalizeScore(impossible), null);
  assert.throws(
    () => GameGoalData.normalizeLanding(landing(impossible), gameId),
    /exceed/,
  );
});

test("identities and opponents remain exact and unknown teams never gain named goals", () => {
  const raw = score();
  assert.throws(
    () => GameGoalData.normalizeLanding(landing(raw), gameId + 1),
    /identity/,
  );
  for (const change of [
    { id: "2026020166" },
    { gameState: "UNKNOWN" },
    { awayTeam: { abbrev: "<bad>", score: 2 } },
    { homeTeam: { abbrev: "MTL", score: 1 } },
  ]) {
    assert.equal(GameGoalData.normalizeScore({ ...raw, ...change }), null);
  }
  raw.goals[0].teamAbbrev = "NYR";
  const data = GameGoalData.normalizeScore(raw);
  assert.equal(data.away.complete, false);
  assert.equal(data.home.complete, false);
  assert.deepEqual(data.home.scorers, []);
});
