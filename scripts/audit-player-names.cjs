// Read-only audit of downloaded official NHL roster JSON files.
// Usage: node scripts/audit-player-names.cjs /path/to/rosters [published-lines.json]
const fs = require("node:fs");
const path = require("node:path");
require("../static/published-lines.js");
const directory = process.argv[2];
if (!directory)
  throw Error("Provide a directory containing NHL team roster JSON files.");
const teamNames = new Map(
  [
    ...fs
      .readFileSync(path.join(__dirname, "../static/app.js"), "utf8")
      .matchAll(/^  \["([A-Z]{3})", "([^"]+)"/gm),
  ].map((m) => [m[1], m[2]]),
);
const slug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const report = {
  teams: 0,
  players: 0,
  variants: 0,
  ambiguousNames: [],
  failures: [],
  unresolvedPublishedNames: [],
};
const feed = process.argv[3]
  ? JSON.parse(fs.readFileSync(process.argv[3], "utf8"))
  : null;
for (const file of fs
  .readdirSync(directory)
  .filter((name) => /^[A-Z]{3}\.json$/.test(name))
  .sort()) {
  const team = file.slice(0, 3);
  const raw = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
  const roster = [
    ["forwards", "F"],
    ["defensemen", "D"],
    ["goalies", "G"],
  ].flatMap(([key, group]) => {
    if (!Array.isArray(raw[key])) throw Error(`Invalid roster: ${team}/${key}`);
    return raw[key].map((p) => ({
      id: p.id,
      name: `${p.firstName.default} ${p.lastName.default}`,
      nameAliases: PublishedLines.rosterNames(p),
      group,
    }));
  });
  report.teams++;
  report.players += roster.length;
  const seen = new Set();
  for (const player of roster) {
    if (seen.has(player.id))
      report.failures.push({ team, id: player.id, reason: "Duplicate NHL ID" });
    seen.add(player.id);
    for (const name of player.nameAliases) {
      report.variants++;
      if (
        PublishedLines.matchingPlayer(name, roster, player.group)?.id !==
        player.id
      )
        report.failures.push({ team, name, id: player.id });
    }
    if (!PublishedLines.matchingPlayer(player.name, roster))
      report.ambiguousNames.push({
        team,
        name: player.name,
        id: player.id,
        group: player.group,
      });
  }
  const entry =
    feed?.teams?.[team] || feed?.teams?.[slug(teamNames.get(team) || team)];
  if (entry)
    for (const [key, group] of [
      ["forwards", "F"],
      ["defense", "D"],
      ["goalies", "G"],
      ["pp1", null],
      ["pp2", null],
      ["pk1", null],
      ["pk2", null],
    ]) {
      for (const name of (entry[key] || []).flat())
        if (!PublishedLines.matchingPlayer(name, roster, group))
          report.unresolvedPublishedNames.push({ team, unit: key, name });
    }
}
report.publishedFeedChecked = Boolean(feed);
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
