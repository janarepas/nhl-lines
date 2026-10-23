const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  trimRoster,
  makeSnapshot,
  teams,
} = require("../scripts/build-team-snapshots.cjs");
const sample = () => ({
  forwards: [
    {
      id: 8478402,
      firstName: { default: "Connor", cs: "Connor" },
      lastName: { default: "McDavid" },
      sweaterNumber: 97,
      positionCode: "C",
      headshot: "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png",
      birthCountry: "CAN",
      unneeded: "drop me",
    },
  ],
  defensemen: [],
  goalies: [],
});
test("cold-failure snapshots preserve verified identities/translations and original source times", () => {
  const time = "2026-10-23T16:41:13.000Z";
  const snapshot = makeSnapshot("EDM", sample(), time);
  assert.equal(snapshot.rosterCheckedAt, time);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.team, "EDM");
  assert.deepEqual(snapshot.roster.forwards[0].firstName, {
    default: "Connor",
    cs: "Connor",
  });
  assert.equal(snapshot.roster.forwards[0].unneeded, undefined);
  assert.equal(
    snapshot.stats,
    undefined,
    "Missing stats never become zero counters",
  );
  assert.throws(() => makeSnapshot("BAD", sample(), time), /identity/);
  assert.throws(() => makeSnapshot("EDM", sample(), "bad"), /identity/);
  const roster = sample();
  roster.goalies.push(roster.forwards[0]);
  assert.throws(() => trimRoster(roster), /duplicate/);
  roster.goalies = [];
  roster.forwards[0].headshot = "https://example.com/person.png";
  assert.throws(() => trimRoster(roster), /Untrusted/);
});
test("season totals are optional and require their own original timestamp and valid NHL stats", () => {
  const roster = sample(),
    time = "2026-10-23T16:41:13.000Z";
  const stats = {
    season: 20262027,
    gameType: 2,
    skaters: [
      {
        playerId: 8478402,
        firstName: { default: "Connor" },
        lastName: { default: "McDavid" },
        gamesPlayed: 10,
        goals: 8,
        assists: 23,
        points: 31,
      },
    ],
    goalies: [],
  };
  const s = makeSnapshot(
    "EDM",
    roster,
    time,
    stats,
    "2026-10-23T18:59:00.000Z",
  );
  assert.equal(s.statsCheckedAt, "2026-10-23T18:59:00.000Z");
  assert.equal(s.stats.skaters[0].points, 31);
  assert.throws(() => makeSnapshot("EDM", roster, time, stats), /original/);
  stats.skaters[0].points = 99;
  assert.throws(
    () => makeSnapshot("EDM", roster, time, stats, time),
    /statistics/,
  );
});
test("all32 fixed teams have compact, individually retrievable verified roster snapshots", () => {
  assert.equal(teams.length, 32);
  let players = 0;
  for (const team of teams) {
    const file = path.join(
      __dirname,
      "../static/team-snapshots",
      team + ".json",
    );
    const raw = fs.readFileSync(file);
    assert.ok(raw.length <= 24000);
    const d = JSON.parse(raw);
    assert.equal(d.team, team);
    assert.equal(d.version, 1);
    assert.ok(Number.isFinite(Date.parse(d.rosterCheckedAt)));
    const roster = trimRoster(d.roster);
    players += Object.values(roster).reduce((n, p) => n + p.length, 0);
    if (d.stats) assert.ok(Number.isFinite(Date.parse(d.statsCheckedAt)));
  }
  assert.ok(players >= 750);
});
