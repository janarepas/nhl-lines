const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      localStorage.setItem("blueline-v2", JSON.stringify({ team: "ANA" })),
    );
    await page.route("https://**", (route) => route.abort());
    const player = (id, first, last, positionCode) => ({
      id,
      firstName: { default: first },
      lastName: { default: last },
      sweaterNumber: 95,
      positionCode,
      shootsCatches: "R",
      headshot: `https://assets.nhle.com/mugs/nhl/20262027/ANA/${id}.png`,
    });
    const roster = {
      forwards: [player(8484153, "Leo", "Carlsson", "C")],
      defensemen: [player(8482116, "Test", "Defense", "D")],
      goalies: [player(8480843, "Lukas", "Dostal", "G")],
    };
    let prospectRequests = 0;
    await page.route("**/api/nhl?*", (route) => {
      const path = new URL(route.request().url()).searchParams.get("path");
      if (path.startsWith("roster/")) return route.fulfill({ json: roster });
      if (path.startsWith("prospects/")) {
        prospectRequests++;
        return route.fulfill({
          json: {
            forwards: [
              player(8485400, "Roger", "McQueen", "C"),
              player(8489999, "Unrelated", "Prospect", "C"),
            ],
            defensemen: [],
            goalies: [],
          },
        });
      }
      return route.fulfill({
        json: path.startsWith("club-stats/")
          ? { skaters: [] }
          : { gameLog: [] },
      });
    });
    await page.route("**/api/lineups", (route) =>
      route.fulfill({
        json: {
          source: "dailyfaceoff.com",
          updated_at: new Date().toISOString(),
          teams: {
            "anaheim-ducks": {
              forwards: [["Roger McQueen", "Leo Carlsson"]],
              defense: [["Test Defense"]],
              goalies: [["Lukas Dostal"]],
              pp1: ["Roger McQueen"],
              pp2: [],
            },
          },
        },
      }),
    );
    await page.route("**/api/leaders", (route) =>
      route.fulfill({ json: { points: [] } }),
    );
    await page.route("**/api/injuries", (route) =>
      route.fulfill({ json: { injuries: [] } }),
    );
    await page.route("**/api/penalty-kill", (route) =>
      route.fulfill({ status: 503 }),
    );
    const base = process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3163";
    await page.goto(base);
    await page.waitForSelector('#forward-lines [data-player="8485400"]');
    const card = page.locator('#forward-lines [data-player="8485400"]');
    assert.match(await card.innerText(), /McQueen/);
    assert.match(await card.locator(".player-meta").innerText(), /#95.*C/s);
    assert.equal(
      await page.evaluate(() => players.find((p) => p.id === 8485400).image),
      "https://assets.nhle.com/mugs/nhl/20262027/ANA/8485400.png",
    );
    assert.deepEqual(
      await page.evaluate(() => lineData.forwards[0]),
      [8485400, 8484153],
    );
    assert.equal(await page.locator('[data-player="8489999"]').count(), 0);
    assert.equal(
      await card.locator(".player-stats").count(),
      0,
      "No invented NHL game statistics",
    );
    await page.reload();
    await page.waitForSelector('#forward-lines [data-player="8485400"]');
    assert.equal(
      prospectRequests,
      1,
      "Prospect source also uses the daily cache",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: verified prospect fills the published slot, preserves order and photo/number, excludes unrelated prospects, and reuses daily cache.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
