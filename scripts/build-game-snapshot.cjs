// Explicit maintenance refresh; ordinary builds never fetch live NHL scores.
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
require("../static/games.js");
(async () => {
  const date = process.argv[2] || GameScores.day();
  if (
    !/^20\d{2}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error("Invalid game date");
  const sourceUrl = `https://api-web.nhle.com/v1/score/${date}`;
  const { stdout } = await promisify(execFile)(
    "curl",
    ["--fail", "--silent", "--show-error", "--max-time", "20", sourceUrl],
    { maxBuffer: 1024 * 1024 },
  );
  const data = GameScores.normalize(JSON.parse(stdout));
  if (!GameScores.valid(data, date))
    throw Error("Invalid official score data; keeping the previous snapshot");
  const target = path.join(__dirname, "../static/game-snapshot.json");
  await fs.writeFile(
    target + ".tmp",
    JSON.stringify(
      { version: 1, checkedAt: new Date().toISOString(), sourceUrl, data },
      null,
      2,
    ) + "\n",
  );
  await fs.rename(target + ".tmp", target);
  console.log(`Saved ${data.games.length} verified games for ${date}`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
