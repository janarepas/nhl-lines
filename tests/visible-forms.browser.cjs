const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 393, height: 852 },
    });
    await page.setContent(
      `<button class="player-card" data-player="1">One</button><button class="player-card" data-player="2">Two</button><div style="height:1600px"></div><button class="player-card" data-player="3">Three</button><div hidden><button class="player-card" data-player="4">Four</button></div>`,
    );
    await page.addScriptTag({ path: path.resolve("static/visible-forms.js") });
    await page.evaluate(() => {
      window.calls = [];
      window.changes = 0;
      window.current = 0;
      window.maximum = 0;
      window.done = new Set();
      window.pending = new Set();
      window.controller = new AbortController();
      window.loader = VisiblePlayerForms.create({
        signal: controller.signal,
        isFresh: (id) => done.has(id),
        pending: (id, waiting) =>
          waiting ? pending.add(id) : pending.delete(id),
        load: async (id) => {
          calls.push(id);
          maximum = Math.max(maximum, ++current);
          await new Promise((r) => setTimeout(r, 30));
          current--;
          done.add(id);
        },
        changed: () => changes++,
      });
      loader.observe();
      loader.observe();
    });
    await page.waitForFunction(() => calls.length === 2 && changes === 1);
    assert.deepEqual(await page.evaluate(() => calls), [1, 2]);
    assert.equal(await page.evaluate(() => maximum), 2);
    await page.evaluate(() => {
      loader.observe();
      loader.request(1);
    });
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => calls), [1, 2]);
    await page.locator('[data-player="3"]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => done.has(3));
    assert.deepEqual(await page.evaluate(() => calls), [1, 2, 3]);
    // An explicit profile open can demand an otherwise hidden player's log.
    await page.evaluate(() => loader.request(4));
    await page.waitForFunction(() => done.has(4));
    // DOM patching can retain a card element while its player identity changes.
    await page.evaluate(() => {
      document.querySelector('[data-player="3"]').dataset.player = "6";
      loader.observe();
    });
    await page.waitForFunction(() => done.has(6));
    await page.evaluate(() => controller.abort());
    assert.equal(await page.evaluate(() => pending.size), 0);
    await page.evaluate(() => loader.request(5));
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => calls), [1, 2, 3, 4, 6]);
    console.log(
      "PASS: only visible form logs load, requests deduplicate, two-worker limit and batched renders hold, profile demand and abort cleanup work.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
