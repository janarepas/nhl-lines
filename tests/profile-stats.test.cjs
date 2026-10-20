const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../static/profile-stats.js");
const id = 8478402,
  season = 20262027;
const value = (metrics, key) =>
  metrics.find((metric) => metric.key === key)?.value;
function fixture() {
  return {
    playerId: id,
    featuredStats: {
      season,
      regularSeason: {
        subSeason: { gamesPlayed: 8, goals: 6, assists: 17, points: 23 },
        career: { points: 1200 },
      },
    },
    careerTotals: {
      regularSeason: {
        gamesPlayed: 800,
        goals: 400,
        assists: 800,
        points: 1200,
        plusMinus: 120,
        shootingPctg: 0.15,
      },
      playoffs: { gamesPlayed: 80, points: 120 },
    },
    seasonTotals: [
      {
        leagueAbbrev: "NHL",
        season,
        gameTypeId: 2,
        teamName: { default: "Edmonton" },
        gamesPlayed: 8,
        goals: 6,
        assists: 17,
        points: 23,
        shots: 18,
        avgToi: "23:23",
        faceoffWinningPctg: 0.495146,
      },
      {
        leagueAbbrev: "NHL",
        season: 20252026,
        gameTypeId: 3,
        gamesPlayed: 6,
        points: 6,
      },
      {
        leagueAbbrev: "NHL",
        season: 20252026,
        gameTypeId: 2,
        gamesPlayed: 82,
        points: 138,
      },
      {
        leagueAbbrev: "OHL",
        season,
        gameTypeId: 2,
        gamesPlayed: 50,
        points: 200,
      },
    ],
    awards: [
      {
        trophy: { default: "Art Ross Trophy" },
        seasons: [
          { seasonId: 20252026 },
          { seasonId: 20222023 },
          { seasonId: 20252026 },
        ],
      },
    ],
  };
}
test("season, career and playoffs stay separate; only NHL history and official awards are used", () => {
  const result = PlayerProfileStats.parse(fixture(), id, season);
  assert.equal(result.seasonLabel, "2026/27");
  assert.equal(value(result.current, "points"), "23");
  assert.equal(value(result.current, "shots"), "18");
  assert.equal(value(result.current, "avgToi"), "23:23");
  assert.equal(value(result.career, "points"), "1200");
  assert.equal(value(result.careerPlayoffs, "points"), "120");
  assert.equal(result.currentPlayoffs.length, 0);
  assert.equal(result.history.length, 3);
  assert.deepEqual(result.awards[0].seasons, ["2025/26", "2022/23"]);
});
test("goalie totals preserve published weighted rates rather than averaging season/team percentages", () => {
  const data = fixture();
  data.featuredStats.regularSeason.subSeason = {
    gamesPlayed: 6,
    wins: 3,
    losses: 3,
    savePctg: 0.881579,
    goalsAgainstAvg: 3.16731,
  };
  data.careerTotals.regularSeason = {
    gamesPlayed: 183,
    wins: 75,
    losses: 81,
    otLosses: 17,
    savePctg: 0.897717,
    goalsAgainstAvg: 3.224246,
    shotsAgainst: 5387,
    goalsAgainst: 551,
    shutouts: 2,
    timeOnIce: "10253:33",
  };
  data.seasonTotals = [
    { leagueAbbrev: "NHL", season, gameTypeId: 2, savePctg: 0.95 },
    { leagueAbbrev: "NHL", season, gameTypeId: 2, savePctg: 0.8 },
  ];
  const result = PlayerProfileStats.parse(data, id, season, true);
  assert.equal(value(result.current, "savePctg"), "88.2%");
  assert.equal(value(result.career, "savePctg"), "89.8%");
  assert.equal(value(result.career, "goalsAgainstAvg"), "3.22");
  assert.equal(value(result.career, "timeOnIce"), "10253:33");
  assert.equal(value(result.current, "shotsAgainst"), undefined);
});
test("missing current season never relabels previous-season stats or invents zero totals", () => {
  const data = fixture();
  data.featuredStats.season = 20252026;
  data.seasonTotals = data.seasonTotals.filter((row) => row.season !== season);
  const result = PlayerProfileStats.parse(data, id, season);
  assert.deepEqual(result.current, []);
  assert.equal(value(result.career, "points"), "1200");
  assert.throws(() => PlayerProfileStats.parse(data, 1234567, season));
  assert.throws(() => PlayerProfileStats.parse({ playerId: id }, id, season));
});
test("unknown, malformed and nonfinite fields stay absent while valid zeros are kept", () => {
  assert.deepEqual(
    PlayerProfileStats.metrics(
      { goals: 0, assists: NaN, points: -1, shootingPctg: 50 },
      false,
    ),
    [{ key: "goals", label: "Goals", value: "0" }],
  );
});
