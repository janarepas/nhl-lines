// Selected club logos double at each existing breakpoint without overflow or late shifts.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const html = fs.readFileSync("src/index.html", "utf8");
    const style = fs.readFileSync("static/style.css", "utf8");
    for (const width of [320, 393, 580, 581, 820, 980, 981, 1350, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: 940 } });
      await page.route("**/*", (route) => route.abort());
      await page.setContent(html);
      await page.addStyleTag({ content: style });
      const expected = width <= 580 ? 168 : width <= 980 ? 88 : 96;
      const initial = await page
        .locator("#main-content")
        .evaluate((el) => el.getBoundingClientRect().top);
      const box = await page.locator("#team-logo").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      assert.equal(box.width, expected, `Logo width at ${width}`);
      assert.equal(box.height, expected, `Logo height at ${width}`);
      await page.evaluate(() => {
        const image = document.createElement("img");
        image.alt = "";
        image.src =
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/></svg>';
        document.querySelector("#team-logo").replaceChildren(image);
        document.querySelector("#team-title").textContent =
          "Toronto Maple Leafs";
      });
      const ready = await page
        .locator("#main-content")
        .evaluate((el) => el.getBoundingClientRect().top);
      assert.ok(
        Math.abs(initial - ready) < 1,
        `Late logo/name must not move content at ${width}`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `No overflow at ${width}`,
      );
      const image = await page.locator("#team-logo img").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      assert.equal(
        image.width,
        expected,
        `Image fills the doubled logo box at ${width}`,
      );
      assert.equal(image.height, expected, `Image height at ${width}`);
      await page.close();
    }
    console.log(
      "PASS: selected team logos are doubled across mobile/tablet/desktop, preserve layout on image arrival, and remain within the viewport.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
