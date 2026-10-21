// Read-only verification of downloaded ESPN chart snapshots.
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  esbuild = require("esbuild");
const root = path.resolve(__dirname, ".."),
  compiled = esbuild.buildSync({
    entryPoints: [path.join(root, "lib/special-teams.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });
const m = new Module(__filename);
m._compile(compiled.outputFiles[0].text, __filename);
const { rankedSpecialTeams } = m.exports;
const directory = process.argv[2];
if (!directory) {
  console.error("Usage: node scripts/audit-special-teams.cjs CHART_DIR");
  process.exit(1);
}
const codes = [
  ...fs
    .readFileSync(path.join(root, "lib/espn-teams.js"), "utf8")
    .matchAll(/^  ([A-Z]{3}):/gm),
].map((m) => m[1]);
let verified = 0;
for (const team of codes) {
  try {
    const units = rankedSpecialTeams(
      JSON.parse(fs.readFileSync(path.join(directory, team + ".json"))),
    );
    const pp = units.pp.every((r) => r.length === 5),
      pk = units.pk.every(
        (r) =>
          r.length === 4 &&
          r.filter((p) => p.group === "F").length === 2 &&
          r.filter((p) => p.group === "D").length === 2,
      );
    if (pp && pk) verified++;
    console.log(
      `${team}: PP ${units.pp.map((r) => r.length).join("/")}, PK ${units.pk.map((r) => r.length).join("/")}${pp && pk ? " OK" : " INCOMPLETE"}`,
    );
  } catch (e) {
    console.log(team + ": " + e.message);
  }
}
console.log(
  `Verified ${verified}/${codes.length} teams with two 5-player PP and two 2F+2D PK units`,
);
if (verified !== 32) process.exitCode = 1;
