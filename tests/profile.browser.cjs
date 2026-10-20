const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem("blueline-v2", JSON.stringify({ team: "ANA" })),
    );
    await page.route("https://**", (r) => r.abort());
    const date = new Date(),
      year = date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0),
      season = year * 10000 + year + 1;
    const p = (id, first, last, positionCode) => ({
      id,
      firstName: { default: first },
      lastName: { default: last },
      sweaterNumber: 9,
      positionCode,
      shootsCatches: "L",
      birthCountry: "CAN",
    });
    const roster = {
      forwards: [p(8480001, "Test", "Skater", "C")],
      defensemen: [p(8480002, "Test", "Defense", "D")],
      goalies: [p(8480003, "Test", "Goalie", "G")],
    };
    const profile = (id) => ({
      playerId: id,
      featuredStats: {
        season,
        regularSeason: {
          subSeason:
            id === 8480003
              ? {
                  gamesPlayed: 6,
                  wins: 3,
                  savePctg: 0.881579,
                  goalsAgainstAvg: 3.16731,
                }
              : { gamesPlayed: 8, goals: 6, assists: 17, points: 23 },
        },
      },
      careerTotals: {
        regularSeason:
          id === 8480003
            ? {
                gamesPlayed: 183,
                wins: 75,
                savePctg: 0.897717,
                goalsAgainstAvg: 3.224246,
                shutouts: 2,
              }
            : {
                gamesPlayed: 800,
                goals: 400,
                assists: 800,
                points: 1200,
                plusMinus: 120,
              },
        playoffs: { gamesPlayed: 80, points: 120 },
      },
      seasonTotals: [
        {
          leagueAbbrev: "NHL",
          season,
          gameTypeId: 2,
          gamesPlayed: 8,
          goals: 6,
          assists: 17,
          points: 23,
          shots: 18,
          teamName: { default: "Fixture team" },
        },
      ],
      awards:
        id === 8480003
          ? []
          : [
              {
                trophy: { default: "Test trophy" },
                seasons: [{ seasonId: season - 10001 }],
              },
            ],
    });
    let landingCalls = 0;
    await page.route("**/api/nhl?*", async (route) => {
      const path = new URL(route.request().url()).searchParams.get("path");
      if (path.startsWith("roster/")) return route.fulfill({ json: roster });
      if (path.startsWith("club-stats/"))
        return route.fulfill({ json: { season, gameType: 2, skaters: [] } });
      if (path.endsWith("/landing")) {
        landingCalls++;
        const id = Number(path.split("/")[1]);
        return id === 8480002
          ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
          : route.fulfill({ json: profile(id) });
      }
      return route.fulfill({ json: { gameLog: [] } });
    });
    await page.route("**/api/lineups", (r) =>
      r.fulfill({
        json: {
          source: "dailyfaceoff.com",
          updated_at: new Date().toISOString(),
          teams: {
            "anaheim-ducks": {
              forwards: [["Test Skater"]],
              defense: [["Test Defense"]],
              goalies: [["Test Goalie"]],
              pp1: [],
              pp2: [],
            },
          },
        },
      }),
    );
    await page.route("**/api/leaders", (r) =>
      r.fulfill({ json: { points: [] } }),
    );
    await page.route("**/api/injuries", (r) =>
      r.fulfill({ json: { injuries: [] } }),
    );
    await page.route("**/api/penalty-kill", (r) => r.fulfill({ status: 503 }));
    await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3163");
    await page.waitForSelector('#forward-lines [data-player="8480001"]');
    assert.equal(landingCalls, 0, "Profiles are fetched only when opened");
    await page.locator('#forward-lines [data-player="8480001"]').click();
    await page.waitForSelector(".profile-metrics");
    assert.equal(
      await page
        .locator(".profile-metrics")
        .nth(0)
        .locator('[data-stat="points"] dd')
        .innerText(),
      "23",
    );
    assert.equal(
      await page
        .locator(".profile-metrics")
        .nth(1)
        .locator('[data-stat="points"] dd')
        .innerText(),
      "1200",
    );
    assert.match(
      await page.locator(".profile-awards").innerText(),
      /Test trophy/,
    );
    assert.match(
      await page
        .locator("#player-dialog")
        .evaluate((el) => getComputedStyle(el, "::backdrop").backdropFilter),
      /blur\(20px\)/,
    );
    await page.screenshot({ path: "/tmp/nhl-profile-expanded.png" });
    await page.locator(".profile-more").last().locator("summary").click();
    await page.evaluate(() => renderDetail());
    assert.equal(
      await page.locator(".profile-more").last().getAttribute("open"),
      "",
      "Stats updates preserve expanded season history",
    );

    for (const width of [320, 393, 820]) {
      await page.setViewportSize({ width, height: 852 });
      assert.ok(
        await page
          .locator("#player-dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        "No modal overflow at " + width,
      );
    }
    await page.locator("#close-dialog").click();
    await page.locator('#goalie-lines [data-player="8480003"]').click();
    await page.waitForSelector('.profile-metrics [data-stat="savePctg"]');
    assert.equal(
      await page
        .locator(".profile-metrics")
        .nth(1)
        .locator('[data-stat="savePctg"] dd')
        .innerText(),
      "89.8%",
    );
    assert.equal(
      await page
        .locator(".profile-metrics")
        .nth(1)
        .locator('[data-stat="goalsAgainstAvg"] dd')
        .innerText(),
      "3.22",
    );
    assert.equal(
      await page
        .locator('.goalie-glove [data-icon="catcher"]')
        .first()
        .innerText(),
      "🧤",
    );
    await page.locator("#close-dialog").click();
    await page.locator('#forward-lines [data-player="8480001"]').click();
    assert.equal(landingCalls, 2, "Repeat open reuses cached profile");
    await page.locator("#close-dialog").click();
    await page.locator('#defense-lines [data-player="8480002"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("#player-detail")
        .textContent.includes("temporarily unavailable"),
    );
    assert.equal(
      await page.locator("#player-title").innerText(),
      "Test Defense 🇨🇦",
    );
    await page.locator("#close-dialog").click();
    await page.reload();
    await page.waitForSelector('#forward-lines [data-player="8480001"]');
    await page.locator('#forward-lines [data-player="8480001"]').click();
    await page.waitForSelector(".profile-metrics");
    assert.equal(
      landingCalls,
      3,
      "Successful profiles persist across reloads without another HTTP request",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: season/career/playoffs/awards, goalie metrics, stronger blur, mobile overflow, failure state and on-demand 24-hour profile caching.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
