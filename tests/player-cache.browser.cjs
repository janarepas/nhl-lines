const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const base = process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3163";
    await page.route("**/cache-test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<script src="/player-cache.js"></script>',
      }),
    );
    await page.goto(base + "/cache-test");
    await page.waitForFunction(() => !!globalThis.DailyPlayerCache);
    await page.evaluate(() => DailyPlayerCache.clear());
    const first = await page.evaluate(async () => {
      let calls = 0;
      const load = async () => {
        calls++;
        return { games: [1, 2] };
      };
      const values = await Promise.all(
        Array.from({ length: 5 }, () => DailyPlayerCache.get("player:1", load)),
      );
      values[0].games.push(3);
      const cached = await DailyPlayerCache.get("player:1", load);
      return { calls, cached };
    });
    assert.deepEqual(first, { calls: 1, cached: { games: [1, 2] } });
    await page.reload();
    await page.waitForFunction(() => !!globalThis.DailyPlayerCache);
    assert.deepEqual(
      await page.evaluate(() =>
        DailyPlayerCache.get("player:1", () => {
          throw Error("Must persist across reloads");
        }),
      ),
      { games: [1, 2] },
    );
    const expiry = await page.evaluate(async () => {
      const originalNow = Date.now;
      Date.now = () => originalNow() + DailyPlayerCache.MAX_AGE + 1;
      let calls = 0;
      const value = await DailyPlayerCache.get("player:1", async () => {
        calls++;
        return { games: [4] };
      });
      Date.now = originalNow;
      return { calls, value };
    });
    assert.deepEqual(expiry, { calls: 1, value: { games: [4] } });
    const retries = await page.evaluate(async () => {
      let calls = 0;
      for (let i = 0; i < 2; i++) {
        try {
          await DailyPlayerCache.get("failure", async () => {
            calls++;
            throw Error("Unavailable");
          });
        } catch {}
      }
      for (let i = 0; i < 2; i++) {
        try {
          await DailyPlayerCache.get(
            "invalid",
            async () => {
              calls++;
              return {};
            },
            (data) => Array.isArray(data.games),
          );
        } catch {}
      }
      return calls;
    });
    assert.equal(retries, 4);
    console.log(
      "PASS: daily player cache persists across reloads, deduplicates requests, expires after 24 hours, and never saves failed or invalid responses.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
