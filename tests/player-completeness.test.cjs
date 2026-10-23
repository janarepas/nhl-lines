const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  audit,
  parseRoster,
} = require("../scripts/audit-player-completeness.cjs");
const now = Date.parse("2026-10-23T12:00:00Z");
const player = (id, first, last, positionCode = "C") => ({
  id,
  firstName: { default: first },
  lastName: { default: last },
  positionCode,
  sweaterNumber: 10,
  shootsCatches: "L",
  birthCountry: "CAN",
  birthDate: "2000-01-01",
  headshot: `https://assets.nhle.com/mugs/nhl/20262027/ANA/${id}.png`,
});
test("completeness audit preserves official name variants and reports metadata and identity faults separately", () => {
  const p = player(8481582, "Nick", "Robertson");
  p.firstName.cs = "Nicholas";
  const missing = player(8480001, "Synthetic", "Missing");
  delete missing.sweaterNumber;
  missing.headshot = "https://untrusted.example/photo.png";
  const report = { invalidIdentities: [], duplicates: [], missingMetadata: [] };
  const parsed = parseRoster(
    { forwards: [p, missing, { id: 12 }], defensemen: [], goalies: [] },
    "ANA",
    "roster",
    report,
  );
  assert.deepEqual(parsed[0].nameAliases, [
    "Nick Robertson",
    "Nicholas Robertson",
  ]);
  assert.equal(parsed[1].image, "");
  assert.deepEqual(report.missingMetadata[0].fields, ["number", "headshot"]);
  assert.equal(report.invalidIdentities.length, 1);
  assert.equal(parsed.length, 2);
});
test("completeness audit uses production lineup reconciliation and keeps unverified names unresolved", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "nextshift-completeness-test-"),
  );
  try {
    const put = (name, data) =>
      fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
    put("roster-ANA.json", {
      forwards: [player(8481582, "Nick", "Robertson")],
      defensemen: [player(8480003, "Test", "Defense", "D")],
      goalies: [player(8480004, "Test", "Goalie", "G")],
    });
    put("prospects-ANA.json", {
      forwards: [player(8485400, "Roger", "McQueen")],
      defensemen: [],
      goalies: [],
    });
    put("lineups-ANA.json", {
      source: "nhl.com",
      updated_at: new Date(now).toISOString(),
      teams: {
        "anaheim-ducks": {
          forwards: [
            ["Nicholas Robertson", "Roger McQueen", "Unverified Forward"],
          ],
          defense: [["Test Defense"]],
          goalies: [["Test Goalie"]],
          pp1: [],
          pp2: [],
          source_url:
            "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season",
          updated_at: new Date(now).toISOString(),
          game_date: "2026-10-23",
        },
      },
    });
    put("special-ANA.json", {
      team: "ANA",
      source: "ESPN",
      sourceUrl: "https://www.espn.com/nhl/team/depth/_/id/25",
      pp: [[], []],
      pk: [[], []],
    });
    const result = audit(dir, now);
    assert.equal(result.teams, 1);
    assert.equal(result.rosterPlayers, 3);
    assert.equal(result.prospectPlayers, 1);
    assert.equal(result.publishedTeams, 1);
    assert.equal(result.specialTeams, 1);
    assert.equal(result.unresolved.length, 1);
    assert.equal(result.unresolved[0].name, "Unverified Forward");
    assert.equal(result.unresolved[0].group, "F");
    assert.equal(result.unresolved[0].image, "");
    assert.deepEqual(
      result.resolvedByProspects.map((p) => p.id),
      [8485400],
    );
    assert.equal(result.parserErrors.length, 0);
    assert.ok(
      result.missingInputs.some((p) => p.team === "BOS" && p.kind === "roster"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verified supplements are opt-in and preserve a source lineup team separately from the official current team", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "nextshift-supplement-audit-test-"),
  );
  try {
    const put = (kind, data) =>
      fs.writeFileSync(
        path.join(dir, `${kind}-NJD.json`),
        JSON.stringify(data),
      );
    put("roster", {
      forwards: [player(8480001, "Roster", "Forward")],
      defensemen: [player(8480003, "Test", "Defense", "D")],
      goalies: [player(8480004, "Test", "Goalie", "G")],
    });
    put("lineups", {
      source: "nhl.com",
      updated_at: new Date(now).toISOString(),
      teams: {
        "new-jersey-devils": {
          forwards: [["Dawson Mercer"]],
          defense: [["Test Defense"]],
          goalies: [["Test Goalie"]],
          pp1: [],
          pp2: [],
          source_url:
            "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season",
          updated_at: new Date(now).toISOString(),
          game_date: "2026-10-23",
        },
      },
    });
    put("special", {
      team: "NJD",
      source: "ESPN",
      sourceUrl: "https://www.espn.com/nhl/team/depth/_/id/11",
      pp: [[], []],
      pk: [[], []],
    });
    const verified = {
      version: 1,
      checkedAt: new Date(now).toISOString(),
      players: [
        {
          id: 8482110,
          name: "Dawson Mercer",
          first: "Dawson",
          last: "Mercer",
          nameAliases: ["Dawson Mercer"],
          group: "F",
          number: 91,
          pos: "C",
          image: "https://assets.nhle.com/mugs/nhl/20262027/WPG/8482110.png",
          currentTeam: "WPG",
          sourceTeams: ["NJD"],
          sourceUrl: "https://api-web.nhle.com/v1/player/8482110/landing",
        },
      ],
    };
    const without = audit(dir, now);
    assert.equal(without.supplementChecked, false);
    assert.equal(without.unresolved.length, 1);
    const withSupplement = audit(dir, now, { verified });
    assert.equal(withSupplement.unresolved.length, 0);
    assert.equal(withSupplement.resolvedByProspects.length, 0);
    assert.equal(withSupplement.resolvedBySupplement.length, 1);
    const resolved = withSupplement.resolvedBySupplement[0];
    assert.equal(resolved.team, "NJD");
    assert.equal(resolved.currentTeam, "WPG");
    assert.deepEqual(resolved.sourceTeams, ["NJD"]);
    assert.match(resolved.image, /\/WPG\/8482110\.png$/);
    const wrongScope = audit(dir, now, {
      verified: {
        ...verified,
        players: [{ ...verified.players[0], sourceTeams: ["WPG"] }],
      },
    });
    assert.equal(wrongScope.unresolved.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
