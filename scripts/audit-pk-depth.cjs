// Read-only coverage check. Supply downloaded ESPN charts and NHL roster directories.
const fs = require("node:fs"),
  path = require("node:path");
require("../static/published-lines.js");
require("../static/penalty-kill.js");
const [chartsDirectory, rosterDirectory] = process.argv.slice(2);
if (!chartsDirectory || !rosterDirectory)
  throw Error(
    "Usage: node scripts/audit-pk-depth.cjs ESPN_CHART_DIRECTORY NHL_ROSTER_DIRECTORY",
  );
const aliases = { LAK: "LA", NJD: "NJ", SJS: "SJ", TBL: "TB", UTA: "UTAH" };
const table = [
  ...fs
    .readFileSync(path.join(__dirname, "../lib/espn-teams.js"), "utf8")
    .matchAll(/^  ([A-Z]{3}): "(\d+)"/gm),
];
const report = {
  teams: 0,
  participants: 0,
  matchedNhlProfiles: 0,
  unmatched: [],
};
for (const [, team, id] of table) {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(chartsDirectory, `${aliases[team] || team}.json`),
    ),
  );
  const official = JSON.parse(
    fs.readFileSync(path.join(rosterDirectory, `${team}.json`)),
  );
  const roster = [
    ["forwards", "F"],
    ["defensemen", "D"],
    ["goalies", "G"],
  ].flatMap(([key, group]) =>
    official[key].map((p) => ({
      id: p.id,
      name: `${p.firstName.default} ${p.lastName.default}`,
      nameAliases: PublishedLines.rosterNames(p),
      group,
    })),
  );
  const parsed = PenaltyKill.parseDepth(
    { raw, team, sourceUrl: `https://www.espn.com/nhl/team/depth/_/id/${id}` },
    roster,
    team,
  );
  report.teams++;
  for (const key of ["forwards", "defense"]) {
    report.matchedNhlProfiles += parsed.depth[key].length;
    report.participants +=
      parsed.depth[key].length + parsed.unmatched[key].length;
    if (parsed.unmatched[key].length)
      report.unmatched.push({ team, group: key, names: parsed.unmatched[key] });
  }
}
console.log(JSON.stringify(report, null, 2));
if (report.teams !== 32) process.exitCode = 1;
