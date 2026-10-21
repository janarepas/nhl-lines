const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 393, height: 852 },
      reducedMotion: "reduce",
    });
    const errors = [];
    let requests = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) => {
      requests++;
      return r.fulfill({ status: 503, json: { error: "Offline test" } });
    });
    await page.route("https://**", (r) => r.abort());
    await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3166");
    await page.waitForFunction(() => !loading);
    const color = () =>
      page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(await color(), "rgb(27, 28, 30)");
    assert.equal(await page.locator('.theme-sun').evaluate(e => getComputedStyle(e).opacity), '1');
    assert.equal(await page.locator('.theme-moon').evaluate(e => getComputedStyle(e).opacity), '0');
    assert.equal(await page.locator('.theme-sun').evaluate(e => getComputedStyle(e).transitionDuration), '0s');
    const before = requests;
    await page.locator("#theme-toggle").click();
    assert.equal(await color(), "rgb(255, 255, 255)");
    assert.equal(await page.locator("#theme-toggle").innerText(), "");
    assert.equal(
      await page.locator("#theme-toggle").getAttribute("aria-label"),
      "Switch to dark theme",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("nextshift-theme")),
      "light",
    );
    assert.equal(requests, before, "Changing theme does not reload data");
    assert.equal(await page.locator('.theme-moon').evaluate(e => getComputedStyle(e).opacity), '1');
    assert.equal(await page.locator('.theme-sun').evaluate(e => getComputedStyle(e).opacity), '0');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.match(await page.locator('.theme-sun').evaluate(e => getComputedStyle(e).transitionDuration), /0\.36s/);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.reload();
    await page.waitForFunction(() => !loading);
    assert.equal(
      await color(),
      "rgb(255, 255, 255)",
      "Selected theme persists across reloads",
    );
    for (const width of [320, 393, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const placement = await page.evaluate(() => {
        const a = document
            .querySelector("#theme-toggle")
            .getBoundingClientRect(),
          b = document.querySelector(".brand").getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          overlap:
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top,
        };
      });
      assert.deepEqual(
        placement,
        { overflow: false, overlap: false },
        "Theme switch fits beside/above the brand at " + width,
      );
      await page.locator("#theme-toggle").click();
    }
    await page.evaluate(() =>
      localStorage.setItem("nextshift-theme", "invalid"),
    );
    await page.reload();
    assert.equal(await color(), "rgb(27, 28, 30)");
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw Error("Storage disabled");
      };
    });
    await page.locator("#theme-toggle").click();
    assert.equal(
      await color(),
      "rgb(255, 255, 255)",
      "Palette works even when saving is disabled",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: light/dark toggle, persistent choice, invalid/disabled storage, no data reloads and no brand overlap at 320–1440px.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
