// Explicit, networked portrait refresh. Ordinary builds use checked-in assets.
// Usage: node scripts/build-portraits.cjs [--refresh-originals] [--cache-dir=/workspace/.nextshift-portrait-cache]
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const root = path.resolve(__dirname, "..");
const cache = process.argv.find((v) => v.startsWith("--cache-dir="))?.slice(12) || path.join(root, "../.nextshift-portrait-cache");
const teams = [...require("node:fs").readFileSync(path.join(root, "lib/espn-teams.js"), "utf8").matchAll(/^  ([A-Z]{3}):/gm)].map((match) => match[1]);
const officialSource = /^https:\/\/assets\.nhle\.com\/mugs\/nhl\/(\d{8})\/([A-Z]{3})\/(\d{7})\.png$/;
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const report = { teams: 0, sources: 0, images: 0, originalBytes: 0, optimizedBytes: 0, failed: [] };
async function pool(values, operation, count = 6) {
  const queue = [...values];
  await Promise.all(Array.from({ length: Math.min(count, queue.length) }, async () => {
    while (queue.length) await operation(queue.shift());
  }));
}
async function download(url, target) {
  const temp = target + ".download";
  try {
    await run("curl", ["--fail", "--silent", "--show-error", "--max-time", "25", "--retry", "2", "--retry-delay", "1", url, "--output", temp]);
    await fs.rename(temp, target);
  } finally { await fs.rm(temp, { force: true }); }
}
async function main() {
  if (teams.length !== 32) throw Error("Expected exactly 32 NHL teams.");
  await fs.mkdir(cache, { recursive: true });
  const sources = new Set([
    // Verified archive fallback currently used by app.js for Filip Hallander.
    "https://assets.nhle.com/mugs/nhl/20222023/PIT/8480842.png",
  ]);
  await pool(teams, async (team) => {
    const target = path.join(cache, "roster-" + team + ".json");
    await download("https://nhl-lines.pages.dev/api/nhl?path=" + encodeURIComponent("roster/" + team + "/current"), target);
    const roster = JSON.parse(await fs.readFile(target, "utf8"));
    for (const group of ["forwards", "defensemen", "goalies"]) {
      if (!Array.isArray(roster[group])) throw Error("Invalid roster: " + team);
      for (const player of roster[group]) {
        if (officialSource.test(player.headshot)) sources.add(player.headshot);
      }
    }
    report.teams++;
  }, 4);
  report.sources = sources.size;
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "nextshift-webp-"));
  try {
    const groups = {}, hashes = [];
    await pool([...sources].sort(), async (url) => {
      const [, season, team, id] = officialSource.exec(url);
      const key = `${season}-${team}-${id}`;
      const original = path.join(cache, key + ".png");
      try {
        // The source URL is versioned by season/team. A refresh reuses downloaded
        // originals; delete an individual cached PNG to revalidate its pixels.
        if (process.argv.includes("--refresh-originals")) await download(url, original);
        else try { await fs.access(original); } catch { await download(url, original); }
        const bytes = await fs.readFile(original);
        if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error("Not a PNG");
        const outputs = [];
        for (const width of [128, 256]) {
          const filename = `${key}-${width}.webp`;
          const target = path.join(staging, filename);
          await run("magick", [original, "-resize", `${width}x${width}>`, "-strip", "-quality", "78", target]);
          const webp = await fs.readFile(target);
          if (webp.toString("ascii", 0, 4) !== "RIFF" || webp.toString("ascii", 8, 12) !== "WEBP") throw Error("Not a WebP");
          outputs.push([filename, webp]);
        }
        for (const [filename, webp] of outputs) {
          hashes.push(filename + ":" + digest(webp));
          report.optimizedBytes += webp.length;
        }
        (groups[season + "/" + team] ||= []).push(id);
        report.originalBytes += bytes.length;
        report.images++;
      } catch (error) {
        report.failed.push({ source: url, reason: error.message.split("\n")[0] });
        if (error.message === "Not a PNG") await fs.rm(original, { force: true });
        // Only completely successful source pairs enter the generated manifest.
        for (const width of [128, 256]) await fs.rm(path.join(staging, `${key}-${width}.webp`), { force: true });
      }
    });
    if (report.images < report.sources * 0.9) throw Error("Too many failed portraits; refusing to replace the existing snapshot.");
    const snapshot = digest(hashes.sort().join("\n")).slice(0, 12);
    const directory = path.join(root, "static/portraits", snapshot);
    await fs.mkdir(directory, { recursive: true });
    for (const filename of await fs.readdir(staging)) await fs.copyFile(path.join(staging, filename), path.join(directory, filename));
    const membership = Object.fromEntries(Object.keys(groups).sort().map((key) => [key, "," + groups[key].sort().join(",") + ","]));
    const helper = `/* Generated by scripts/build-portraits.cjs; exact official source URLs only. */\n(function(root) {\n  const snapshot = ${JSON.stringify(snapshot)};\n  const groups = ${JSON.stringify(membership)};\n  function resolve(original) {\n    if (typeof original !== "string") return null;\n    const match = /^https:\\/\\/assets\\.nhle\\.com\\/mugs\\/nhl\\/(\\d{8})\\/([A-Z]{3})\\/(\\d{7})\\.png$/.exec(original);\n    if (!match || !groups[match[1] + "/" + match[2]]?.includes("," + match[3] + ",")) return null;\n    const base = "/portraits/" + snapshot + "/" + match.slice(1).join("-");\n    return { src: base + "-128.webp", srcset: base + "-128.webp 128w, " + base + "-256.webp 256w", original };\n  }\n  root.PortraitImages = { resolve };\n})(globalThis);\n`;
    await fs.writeFile(path.join(root, "static/portrait-images.js"), helper);
    await fs.writeFile(path.join(directory, "summary.json"), JSON.stringify({ ...report, snapshot }, null, 2) + "\n");
    // Old content-addressed snapshots are unnecessary in this static deployment.
    for (const name of await fs.readdir(path.join(root, "static/portraits"))) if (name !== snapshot) await fs.rm(path.join(root, "static/portraits", name), { recursive: true, force: true });
    console.log(JSON.stringify({ ...report, snapshot }, null, 2));
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
