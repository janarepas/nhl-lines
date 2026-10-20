// Read-only audit of saved official NHL pages; no scraping or browser dependency.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const result = esbuild.buildSync({
  entryPoints: [path.join(root, "lib/nhl-lineups.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const loaded = new Module(__filename);
loaded._compile(result.outputFiles[0].text, __filename);
const { teamSlugs, nhlDay, dailyUrl, parseArticle, previewCandidates } =
  loaded.exports;
const [directory, scheduleFile, time] = process.argv.slice(2);
if (!directory || !scheduleFile) {
  console.error(
    "Usage: node scripts/audit-nhl-lineups.cjs ARTICLE_DIR SCHEDULE_JSON [NOW_ISO]",
  );
  process.exit(1);
}
try {
  const now = time ? Date.parse(time) : Date.now();
  if (!Number.isFinite(now)) throw Error("Invalid audit time");
  const schedule = JSON.parse(fs.readFileSync(scheduleFile));
  const dailySource = dailyUrl(now);
  let daily = { teams: {} };
  try {
    daily = parseArticle(
      fs.readFileSync(
        path.join(directory, dailySource.split("/").at(-1) + ".html"),
        "utf8",
      ),
      dailySource,
      now,
    );
  } catch {}
  let count = 0,
    bytes = 0;
  for (const [team, slug] of Object.entries(teamSlugs)) {
    let entry = daily.teams[slug];
    if (!entry)
      for (const candidate of previewCandidates(schedule, team, nhlDay(now))) {
        try {
          const html = fs.readFileSync(
            path.join(directory, candidate.url.split("/").at(-1) + ".html"),
            "utf8",
          );
          entry = parseArticle(html, candidate.url, now, candidate.date).teams[
            slug
          ];
          if (entry) break;
        } catch {}
      }
    if (entry) {
      const payload = {
        source: "nhl.com",
        updated_at: entry.updated_at,
        teams: { [slug]: entry },
      };
      bytes += Buffer.byteLength(JSON.stringify(payload));
      count++;
      console.log(
        `${team}: ${entry.game_date}; ${entry.forwards.length} forward rows, ${entry.defense.length} defense rows, ${entry.goalies.length} goalies`,
      );
    } else console.log(`${team}: no verified recent projection`);
  }
  console.log(
    `Verified ${count}/32; average compact payload ${count ? Math.round(bytes / count) : 0} bytes`,
  );
  if (count !== 32) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
