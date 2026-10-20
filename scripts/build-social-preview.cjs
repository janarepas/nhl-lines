// Optional design-time renderer; the live page never loads Playwright or this HTML.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
(async () => {
  const root = path.resolve(__dirname, ".."),
    logo = fs
      .readFileSync(path.join(root, "static/nhl-shield.svg"))
      .toString("base64");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const temporary = path.join(
    require("node:os").tmpdir(),
    "nextshift-social-" + process.pid + ".png",
  );
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    await page.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f5eddf;color:#64564a;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column}
      .brand{display:flex;align-items:center;gap:28px;margin-top:5px}.shield{width:114px;height:131px}.name{font-size:102px;letter-spacing:-5px;font-weight:700;line-height:1.1;white-space:nowrap}.next{display:inline-flex;font-style:italic;font-weight:900;letter-spacing:0}.e{margin-left:-.07em}.x{margin-left:-.06em}.t{margin-left:-.14em}.tagline{font-size:27px;letter-spacing:1px;color:#94816a;margin:15px 0 0 3px}.rule{width:120px;height:1px;background:#e8ddca;margin:56px 0 28px}.description{font-size:24px;color:#88765f;letter-spacing:.2px}.url{position:absolute;bottom:35px;color:#94816a;font-size:17px}
      </style></head><body><div class="brand"><img class="shield" src="data:image/svg+xml;base64,${logo}" alt=""><div><div class="name"><span class="next"><span>N</span><span class="e">E</span><span class="x">X</span><span class="t">T</span></span> Shift</div><div class="tagline">Every line. Every night.</div></div></div><div class="rule"></div><div class="description">NHL lineups · Player statistics · All 32 teams</div><div class="url">nhl-lines.pages.dev</div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: temporary, type: "png" });
    execFileSync("convert", [
      temporary,
      "-strip",
      "-sampling-factor",
      "4:4:4",
      "-quality",
      "88",
      "-interlace",
      "Plane",
      path.join(root, "static/social-preview.jpg"),
    ]);
    console.log(
      "Social preview: 1200×630 JPEG, " +
        fs.statSync(path.join(root, "static/social-preview.jpg")).size +
        " bytes",
    );
  } finally {
    await browser.close();
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
