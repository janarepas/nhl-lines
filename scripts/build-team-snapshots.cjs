// Explicit maintenance refresh: build per-team cold-failure metadata from verified NHL files.
// Usage: node scripts/build-team-snapshots.cjs --roster-dir=/path/to/raw [--fetch-stats]
const fs = require("node:fs/promises");
const sync = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
require("../static/stats.js");
const root = path.resolve(__dirname, "..");
const teams = [
  ...sync
    .readFileSync(path.join(root, "lib/espn-teams.js"), "utf8")
    .matchAll(/^  ([A-Z]{3}):/gm),
].map((match) => match[1]);
const rosterFields = [
  "id",
  "firstName",
  "lastName",
  "sweaterNumber",
  "positionCode",
  "shootsCatches",
  "headshot",
  "heightInCentimeters",
  "weightInKilograms",
  "birthDate",
  "birthCountry",
];
const skaterFields = [
  "playerId",
  "firstName",
  "lastName",
  "headshot",
  "gamesPlayed",
  "goals",
  "assists",
  "points",
  "plusMinus",
  "shots",
];
const goalieFields = [
  "playerId",
  "gamesPlayed",
  "savePercentage",
  "goalsAgainstAverage",
  "wins",
  "losses",
  "overtimeLosses",
];
const select = (object, fields) =>
  Object.fromEntries(
    fields
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, object[key]]),
  );
function validTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function trimRoster(data) {
  const seen = new Set();
  const result = {};
  for (const key of ["forwards", "defensemen", "goalies"]) {
    if (!Array.isArray(data?.[key])) throw Error("Invalid NHL roster groups.");
    result[key] = data[key].map((player) => {
      if (
        !Number.isSafeInteger(player.id) ||
        player.id <= 0 ||
        seen.has(player.id) ||
        !player.firstName?.default ||
        !player.lastName?.default
      )
        throw Error("Invalid or duplicate NHL identity.");
      seen.add(player.id);
      if (
        player.headshot &&
        !new RegExp(
          `^https://assets\\.nhle\\.com/mugs/nhl/\\d{8}/[A-Z]{3}/${player.id}\\.png$`,
        ).test(player.headshot)
      )
        throw Error("Untrusted NHL portrait.");
      return select(player, rosterFields);
    });
  }
  if (!seen.size) throw Error("Empty NHL roster.");
  return result;
}
function trimStats(data) {
  LineStats.teamScorers(data); // Same season/id/points validation as the browser.
  const seen = new Set();
  for (const p of [...data.skaters, ...(data.goalies || [])]) {
    if (
      !Number.isSafeInteger(p.playerId) ||
      p.playerId <= 0 ||
      seen.has(p.playerId)
    )
      throw Error("Invalid or duplicate stats identity.");
    seen.add(p.playerId);
  }
  return {
    season: data.season,
    gameType: data.gameType,
    skaters: data.skaters.map((p) => select(p, skaterFields)),
    goalies: (data.goalies || []).map((p) => select(p, goalieFields)),
  };
}
function makeSnapshot(team, roster, rosterCheckedAt, stats, statsCheckedAt) {
  if (!teams.includes(team) || !validTime(rosterCheckedAt))
    throw Error("Invalid snapshot identity or time.");
  const snapshot = {
    version: 1,
    team,
    rosterCheckedAt: new Date(rosterCheckedAt).toISOString(),
    roster: trimRoster(roster),
  };
  if (stats) {
    if (!validTime(statsCheckedAt))
      throw Error("Stats need their original check time.");
    snapshot.statsCheckedAt = new Date(statsCheckedAt).toISOString();
    snapshot.stats = trimStats(stats);
  }
  return snapshot;
}
async function json(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}
async function build({
  rosterDirectory,
  fetchStats = false,
  outputDirectory = path.join(root, "static/team-snapshots"),
}) {
  if (teams.length !== 32 || !rosterDirectory)
    throw Error(
      "Pass --roster-dir with all32 verified roster-TEAM.json files.",
    );
  const provenance =
    (await json(
      path.join(path.dirname(rosterDirectory), "roster-provenance.json"),
    )) || [];
  const provenanceTimes = new Map(provenance.map((p) => [p.team, p.savedUTC]));
  const report = {
    teams: 0,
    rosterPlayers: 0,
    statsTeams: 0,
    bytes: 0,
    errors: [],
    statsRateLimited: false,
  };
  const pending = [...teams],
    snapshots = [];
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), "nextshift-team-snapshots-"),
  );
  async function worker() {
    while (pending.length) {
      const team = pending.shift();
      const file = path.join(rosterDirectory, `roster-${team}.json`);
      const roster = JSON.parse(await fs.readFile(file, "utf8"));
      const rosterCheckedAt =
        provenanceTimes.get(team) || (await fs.stat(file)).mtime.toISOString();
      const existing = await json(path.join(outputDirectory, `${team}.json`));
      let stats = existing?.stats,
        statsCheckedAt = existing?.statsCheckedAt;
      if (fetchStats && !report.statsRateLimited) {
        const body = path.join(temp, team + ".json"),
          headers = path.join(temp, team + ".headers");
        try {
          const response = await run("curl", [
            "--silent",
            "--show-error",
            "--max-time",
            "20",
            "--dump-header",
            headers,
            "--output",
            body,
            "--write-out",
            "%{http_code}",
            "https://nhl-lines.pages.dev/api/nhl?path=" +
              encodeURIComponent(`club-stats/${team}/now`),
          ]);
          const headerText = await fs.readFile(headers, "utf8");
          if (
            response.stdout === "429" ||
            /\nretry-after\s*:/i.test(headerText)
          )
            report.statsRateLimited = true;
          if (response.stdout !== "200") throw Error("HTTP " + response.stdout);
          const raw = JSON.parse(await fs.readFile(body, "utf8"));
          const verified = trimStats(raw);
          const checked = [
            ...headerText.matchAll(/\nx-nhl-checked-at:\s*([^\r\n]+)/gi),
          ].at(-1)?.[1];
          statsCheckedAt = validTime(checked)
            ? checked
            : new Date().toISOString();
          stats = verified;
        } catch (error) {
          report.errors.push({ team, kind: "stats", error: error.message });
        }
      }
      const snapshot = makeSnapshot(
        team,
        roster,
        rosterCheckedAt,
        stats,
        statsCheckedAt,
      );
      const body = JSON.stringify(snapshot) + "\n";
      if (Buffer.byteLength(body) > 24000)
        throw Error("Oversized team snapshot: " + team);
      snapshots.push([team, body]);
      report.teams++;
      report.rosterPlayers += Object.values(snapshot.roster).reduce(
        (n, group) => n + group.length,
        0,
      );
      if (snapshot.stats) report.statsTeams++;
      report.bytes += Buffer.byteLength(body);
    }
  }
  try {
    await Promise.all([worker(), worker()]);
    if (report.teams !== 32) throw Error("Incomplete roster snapshot batch.");
    await fs.mkdir(outputDirectory, { recursive: true });
    for (const [team, body] of snapshots)
      await fs.writeFile(path.join(outputDirectory, team + ".json"), body);
    return report;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
module.exports = { trimRoster, trimStats, makeSnapshot, build, teams };
if (require.main === module) {
  const rosterDirectory = process.argv
    .find((x) => x.startsWith("--roster-dir="))
    ?.slice(13);
  build({ rosterDirectory, fetchStats: process.argv.includes("--fetch-stats") })
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
