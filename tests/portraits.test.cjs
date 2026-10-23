const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("../static/portrait-images.js");

test("optimized portraits only resolve exact official season/team/player URLs", () => {
  const resolve = globalThis.PortraitImages.resolve;
  const source = "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png";
  const image = resolve(source);
  assert.equal(image.original, source);
  assert.match(image.src, /^\/portraits\/[a-f0-9]{12}\/20262027-EDM-8478402-128\.webp$/);
  assert.equal(image.srcset, image.src + " 128w, " + image.src.replace("-128.webp", "-256.webp") + " 256w");
  for (const unknown of [null, {}, "", source + "?other=1", source + "#fragment", source.replace("https:", "http:"), source.replace("assets.nhle.com", "assets.nhle.com.evil.test"), source.replace("/EDM/", "/ANA/"), source.replace("20262027", "20252026"), source.replace("8478402", "9999999")])
    assert.equal(resolve(unknown), null, "Unknown URL must retain the official fallback: " + unknown);
});

test("each manifest source has both bounded static WebP assets; all 32 team rosters were processed", () => {
  const root = path.resolve(__dirname, "../static/portraits");
  const [snapshot] = fs.readdirSync(root).filter((name) => /^[a-f0-9]{12}$/.test(name));
  const directory = path.join(root, snapshot);
  const summary = JSON.parse(fs.readFileSync(path.join(directory, "summary.json"), "utf8"));
  assert.equal(summary.teams, 32);
  assert.equal(summary.snapshot, snapshot);
  assert.ok(summary.images >= summary.sources * .9);
  assert.ok(summary.optimizedBytes < summary.originalBytes * .3, "Both optimized widths together remain much smaller than source PNGs");
  assert.ok(summary.optimizedBytes <= 10 * 1024 * 1024, "Total checked-in portrait snapshot stays under 10 MiB");
  let count = 0;
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith("-128.webp"))) {
    const [, season, team, id] = /^(\d{8})-([A-Z]{3})-(\d{7})-128\.webp$/.exec(file);
    const source = `https://assets.nhle.com/mugs/nhl/${season}/${team}/${id}.png`;
    assert.equal(globalThis.PortraitImages.resolve(source).src, `/portraits/${snapshot}/${file}`);
    for (const width of [128, 256]) {
      const bytes = fs.readFileSync(path.join(directory, `${season}-${team}-${id}-${width}.webp`));
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert.ok(bytes.length > 100 && bytes.length < 128 * 1024);
    }
    count++;
  }
  assert.equal(count, summary.images);
});
