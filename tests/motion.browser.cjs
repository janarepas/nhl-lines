const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setContent(
    '<title>Motion regression</title><div id="forward-lines">' +
      Array.from(
        { length: 12 },
        (_, i) =>
          `<div class="line-row" style="height:220px"><button data-player="${i + 1}">Player ${i + 1}</button></div>`,
      ).join("") +
      "</div>",
  );
  await p.addStyleTag({ content: fs.readFileSync("static/style.css", "utf8") });
  await p.addScriptTag({ path: path.resolve("static/motion.js") });
  await p.evaluate(() => LineMotion.refresh());
  await p.waitForFunction(() =>
    document.querySelector(".line-row").classList.contains("row-entering"),
  );
  assert.equal(
    await p
      .locator(".line-row")
      .last()
      .evaluate((el) => el.classList.contains("row-pending")),
    true,
  );
  await p.waitForTimeout(160);
  const delay = await p.evaluate(() => {
    const row = document.querySelector(".line-row");
    row.outerHTML = row.outerHTML;
    LineMotion.refresh();
    return parseFloat(
      document.querySelector(".line-row").style.getPropertyValue("--row-delay"),
    );
  });
  assert.ok(
    delay < -100,
    "Renders resume elapsed animation rather than restart it",
  );
  await p.mouse.move(500, 350);
  await p.mouse.wheel(0, 600);
  await p.waitForTimeout(50);
  const partial = await p.evaluate(() => scrollY);
  assert.ok(partial > 0 && partial < 600, "Mouse wheel is eased over time");
  await p.waitForFunction(() => scrollY === 600, {}, { timeout: 3000 });
  await p.evaluate(() => {
    const d = document.createElement("div");
    d.id = "nested";
    d.style =
      "position:fixed;top:20px;left:20px;width:180px;height:120px;overflow:auto;overscroll-behavior:contain";
    d.innerHTML = '<div style="height:1000px">Picker</div>';
    document.body.append(d);
  });
  const before = await p.evaluate(() => scrollY);
  await p.mouse.move(50, 60);
  await p.mouse.wheel(0, 220);
  await p.waitForFunction(
    () => document.querySelector("#nested").scrollTop > 0,
  );
  assert.equal(
    await p.evaluate(() => scrollY),
    before,
    "Nested picker keeps native scrolling",
  );
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.waitForFunction(
    () => !document.querySelector(".row-pending,.row-entering"),
  );
  assert.equal(
    await p.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
    "auto",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: progressive row reveal, animation resumes across renders, smooth wheel completes, nested scroll is preserved, reduced motion disables animation.",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
