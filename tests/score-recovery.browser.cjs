const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ timezoneId: "UTC" });
    let api = "fresh",
      snapshot = null,
      snapshotRequests = 0,
      sourceAt = new Date().toISOString(),
      deferredRoute,
      deferredReady;
    const requestDates = [];
    const game = (date) => ({
      date,
      games: [
        {
          id: 2026020137,
          start: date + "T23:00:00Z",
          state: "LIVE",
          away: { code: "ANA", score: 2 },
          home: { code: "NYR", score: 1 },
          period: 2,
          periodType: "REG",
          clock: "12:20",
        },
      ],
    });
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/")
        return route.fulfill({
          contentType: "text/html",
          body: '<section id="daily-games"><h2 hidden>NHL results <time id="games-date"></time></h2><span id="games-updated"></span><div id="games-list"></div></section>',
        });
      if (u.pathname === "/api/games") {
        requestDates.push(u.searchParams.get("date"));
        if (api === "deferred") {
          deferredRoute = route;
          deferredReady();
          return;
        }
        return api === "error"
          ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
          : route.fulfill({
              json: game(u.searchParams.get("date")),
              headers: {
                "X-Data-State": api === "stale" ? "stale" : "fresh",
                "X-NHL-Checked-At": sourceAt,
              },
            });
      }
      if (u.pathname === "/game-snapshot.json") {
        snapshotRequests++;
        return snapshot
          ? route.fulfill({ json: snapshot })
          : route.fulfill({ status: 404 });
      }
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      });
    });
    const mount = async () => {
      await page.goto("http://scores.test/");
      await page.addScriptTag({ path: path.resolve("static/dom.js") });
      await page.addScriptTag({ path: path.resolve("static/games.js") });
      await page.evaluate(() => GameScores.mount());
    };
    await mount();
    await page.waitForSelector(".game-card.is-live");
    const initial = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nextshift-scores-v1")),
    );
    api = "error";
    await mount();
    await page.waitForFunction(
      () =>
        document.querySelector("#games-updated").textContent === "Saved scores",
    );
    assert.equal(await page.locator(".is-live").count(), 0);
    assert.doesNotMatch(await page.locator("#games-list").innerText(), /12:20/);
    assert.equal(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("nextshift-scores-v1")).at,
      ),
      initial.at,
      "Failure does not renew the original timestamp",
    );
    assert.equal(
      snapshotRequests,
      0,
      "Valid browser backup avoids extra snapshot fetch",
    );
    // Expired data and another calendar day must never be displayed as current.
    await page.evaluate(() => {
      const x = JSON.parse(localStorage.getItem("nextshift-scores-v1"));
      x.at = Date.now() - 86400001;
      localStorage.setItem("nextshift-scores-v1", JSON.stringify(x));
    });
    await mount();
    await page.waitForSelector(".games-retry");
    assert.equal(await page.locator(".game-card").count(), 0);
    const today = await page.evaluate(() => GameScores.resultDay());
    snapshot = {
      version: 1,
      checkedAt: new Date().toISOString(),
      data: game(today),
    };
    await page.locator(".games-retry").click();
    await page.waitForSelector(".game-card");
    assert.equal(
      await page.locator("#games-updated").innerText(),
      "Saved scores",
    );
    assert.equal(await page.locator(".is-live").count(), 0);
    assert.match(await page.locator(".game-status").innerText(), /Saved score/);
    const expiryAt = await page.evaluate(
      () => JSON.parse(localStorage.getItem("nextshift-scores-v1")).at,
    );
    assert.ok(
      Date.now() - expiryAt > 86400000,
      "Static fallback is not stored as newly fresh browser data",
    );
    await page.evaluate(() => localStorage.clear());
    api = "stale";
    sourceAt = new Date(Date.now() - 1800000).toISOString();
    await mount();
    await page.waitForSelector(".game-card");
    assert.equal(
      await page.locator("#games-updated").innerText(),
      "Saved scores",
    );
    assert.equal(await page.locator(".is-live").count(), 0);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("nextshift-scores-v1")),
      null,
      "Backend stale data is not persisted as fresh",
    );
    api = "error";
    snapshot = {
      version: 1,
      checkedAt: new Date().toISOString(),
      data: game("2020-01-01"),
    };
    await mount();
    await page.waitForSelector(".games-retry");
    assert.equal(await page.locator(".game-card").count(), 0);
    // The selected result day changes at New York midnight, not Budapest/UTC midnight.
    // An in-flight response must immediately request the newly selected NHL day.
    await page.clock.install({ time: new Date("2026-10-24T03:59:59Z") });
    api = "deferred";
    const deferred = new Promise((resolve) => {
      deferredReady = resolve;
    });
    await mount();
    await deferred;
    await page.clock.setSystemTime(new Date("2026-10-24T04:00:01Z"));
    api = "fresh";
    sourceAt = "2026-10-24T04:00:01.000Z";
    await deferredRoute.fulfill({
      json: game("2026-10-22"),
      headers: { "X-Data-State": "fresh", "X-NHL-Checked-At": sourceAt },
    });
    await page.waitForSelector(".game-card.is-live");
    assert.equal(
      requestDates.at(-1),
      "2026-10-23",
      "The previous NHL date changes immediately at New York midnight",
    );
    assert.match(
      await page.locator("#games-date").textContent(),
      /23 Oct.*2026/,
    );
    assert.ok(await page.locator("#games-date").isHidden());
    assert.match(
      await page.locator(".game-date").innerText(),
      /24 Oct.*2026.*01:00/,
    );
    console.log(
      "PASS: previous NHL results recover from date-matched browser or static backups, preserve age, exclude other dates, never show saved live clocks as current, and refresh at New York midnight.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
