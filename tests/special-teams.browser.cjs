const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 393, height: 852 },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("nextshift-theme"))
        localStorage.setItem("nextshift-theme", "vintage");
      if (!localStorage.getItem("blueline-v2"))
        localStorage.setItem("blueline-v2", JSON.stringify({ team: "ANA" }));
    });
    const roster = Array.from({ length: 13 }, (_, i) => ({
      id: 8481000 + i,
      firstName: { default: i < 8 ? "Forward" : i < 12 ? "Defense" : "Goalie" },
      lastName: {
        default: [
          "One",
          "Two",
          "Three",
          "Four",
          "Five",
          "Six",
          "Seven",
          "Eight",
          "Nine",
          "Ten",
          "Eleven",
          "Twelve",
          "Thirteen",
        ][i],
      },
      positionCode: i < 8 ? "C" : i < 12 ? "D" : "G",
      sweaterNumber: i + 1,
      birthCountry: "CAN",
      shootsCatches: "L",
      headshot: `https://assets.nhle.com/test/${i}.png`,
    }));
    const member = (i) => ({
      name: roster[i].firstName.default + " " + roster[i].lastName.default,
      group: i < 8 ? "F" : "D",
    });
    const source = {
      team: "ANA",
      source: "ESPN",
      sourceUrl: "https://www.espn.com/nhl/team/depth/_/id/25",
      pp: [[0, 1, 2, 8, 9].map(member), [3, 4, 5, 10, 11].map(member)],
      pk: [[0, 1, 8, 9].map(member), [2, 3, 10, 11].map(member)],
    };
    let requests = 0;
    await page.route("**/api/**", (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === "/api/special-teams") {
        requests++;
        return r.fulfill({ json: source });
      }
      if (u.pathname === "/api/nhl") {
        const path = u.searchParams.get("path");
        if (path.startsWith("roster/"))
          return r.fulfill({
            json: {
              forwards: roster.slice(0, 8),
              defensemen: roster.slice(8, 12),
              goalies: roster.slice(12),
            },
          });
        if (path.startsWith("club-stats/"))
          return r.fulfill({
            json: {
              season: 20262027, gameType: 2,
              skaters: roster.slice(0, 12).map(p => ({
                playerId: p.id, firstName: p.firstName, lastName: p.lastName,
                gamesPlayed: 18, goals: 6, assists: 9, points: 15,
              })),
              goalies: [{ playerId: roster[12].id, gamesPlayed: 12,
                savePercentage: 0.915, goalsAgainstAverage: 2.45,
                wins: 8, losses: 3, overtimeLosses: 1 }],
            },
          });
        return r.fulfill({
          json: {
            gameLog: Array.from({ length: 5 }, (_, i) => ({
              gameDate: new Date(Date.now() - (i + 1) * 86400000)
                .toISOString()
                .slice(0, 10),
              goals: 0,
              assists: 0,
              opponentAbbrev: "BOS",
              shotsAgainst: 30,
              goalsAgainst: 2,
              toi: "60:00",
            })),
          },
        });
      }
      if (u.pathname === "/api/injuries")
        return r.fulfill({ json: { injuries: [] } });
      if (u.pathname === "/api/leaders")
        return r.fulfill({ json: { points: [] } });
      return r.fulfill({ status: 503, json: { error: "Unavailable" } });
    });
    await page.route("https://assets.nhle.com/**", (r) =>
      r.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3166");
    await page.waitForFunction(() => !loading && pendingForms.size === 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      "dark",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("nextshift-theme")),
      "dark",
    );
    assert.equal(requests, 0);
    await page.waitForFunction(() => seasonPlayers.size === 13);
    assert.match(await page.locator('.player-stats').first().innerText(), /18 GP.*6 G \+ 9 A.*15 P/);
    assert.match(await page.locator('.goalie-stats').first().innerText(), /12 GP.*91.5% SV/);

    const badge = page.locator(".player-portrait > .portrait-hand").first();
    assert.equal(
      await badge.evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    assert.equal(
      await badge.evaluate((e) => getComputedStyle(e).backdropFilter),
      "blur(6px)",
    );
    const darkBadgeColor = await badge.evaluate(
      (e) => getComputedStyle(e).color,
    );
    assert.match(
      await page.locator("#team-logo img").getAttribute("src"),
      /_dark\.svg$/,
    );
    await page.locator("#tab-pp").click();
    await page.waitForSelector(".pp-unit .player-card");
    assert.equal(await page.locator(".pp-unit").count(), 2);
    assert.deepEqual(await page.locator('.pp-unit h3').allTextContents(), ['Powerplay unit 1', 'Powerplay unit 2']);
    assert.equal(await page.locator('#extras').isVisible(), false);
    assert.equal(await page.locator('.pk-source-note, .pp-unit-heading > span').count(), 0);

    assert.equal(await page.locator(".pp-unit .player-card").count(), 10);
    assert.equal(requests, 1);
    await page.locator("#tab-pk").click();
    await page.waitForSelector(".pk-unit .player-card");
    assert.equal(await page.locator(".pk-unit").count(), 2);
    assert.equal(await page.locator('#extras').isVisible(), false);
    assert.equal(await page.locator('.pk-source-note, .pp-unit-heading > span').count(), 0);

    assert.equal(await page.locator(".pk-unit .player-card").count(), 8);
    assert.equal(requests, 1, "PP and PK share a single response");
    assert.deepEqual(await page.locator(".pk-unit h3").allInnerTexts(), [
      "Penalty kill unit 1",
      "Penalty kill unit 2",
    ]);
    for (const unit of await page.locator(".pk-unit").all()) {
      const groups = await unit
        .locator(".player-card")
        .evaluateAll((els) =>
          els.map(
            (el) =>
              players.find((p) => String(p.id) === el.dataset.player).group,
          ),
        );
      assert.deepEqual(groups, ["F", "F", "D", "D"]);
    }
    for (const width of [320, 393, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "PK fits at " + width,
      );
      await page.locator("#tab-pp").click();
      assert.equal(await page.locator(".pp-unit .player-card").count(), 10);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "PP fits at " + width,
      );
      await page.locator("#tab-pk").click();
    }
    const card = await page
      .locator(".pk-unit .player-card")
      .first()
      .elementHandle();
    await page.locator("#theme-toggle").click();
    assert.match(
      await page.locator("#team-logo img").getAttribute("src"),
      /_light\.svg$/,
    );
    assert.notEqual(
      await badge.evaluate((e) => getComputedStyle(e).color),
      darkBadgeColor,
      "Transparent marker color follows the selected theme",
    );
    assert.equal(
      await page
        .locator("body")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(255, 255, 255)",
    );
    assert.equal(await card.evaluate((e) => e.isConnected), true);
    assert.equal(requests, 1);
    assert.equal(
      await page
        .locator(".player-portrait > .portrait-hand")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    assert.deepEqual(errors, []);
    if (process.env.NHL_TEST_SCREENSHOT)
      await page.screenshot({ path: process.env.NHL_TEST_SCREENSHOT });
    console.log(
      "PASS: vintage-to-dark migration, transparent badges, PP1/PP2 and ranked 2F+2D PK units, one shared request, theme changes and mobile layouts.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
