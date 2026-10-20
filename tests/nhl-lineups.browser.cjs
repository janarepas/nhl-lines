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
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("blueline-v2"))
        localStorage.setItem("blueline-v2", JSON.stringify({ team: "ANA" }));
    });
    const players = Array.from({ length: 21 }, (_, i) => ({
      id: 8480000 + i,
      firstName: { default: "Player" },
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
          "Fourteen",
          "Fifteen",
          "Sixteen",
          "Seventeen",
          "Eighteen",
          "Nineteen",
          "Twenty",
          "Twentyone",
        ][i],
      },
      sweaterNumber: i + 1,
      positionCode: i < 12 ? ["L", "C", "R"][i % 3] : i < 19 ? "D" : "G",
      shootsCatches: "L",
      birthCountry: "CAN",
      headshot: `https://assets.nhle.com/test/${i}.png`,
    }));
    const name = (i) =>
      players[i].firstName.default + " " + players[i].lastName.default;
    let date = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      failed = false,
      lineRequests = 0;
    const feed = () => ({
      source: "nhl.com",
      updated_at: new Date().toISOString(),
      teams: {
        "anaheim-ducks": {
          forwards: Array.from({ length: 4 }, (_, i) =>
            [0, 1, 2].map((j) => name(i * 3 + j)),
          ),
          defense: [
            [name(12), name(13)],
            [name(14), name(15)],
            [name(16), name(17)],
            [name(18)],
          ],
          goalies: [[name(19)], [name(20)]],
          pp1: [],
          pp2: [],
          source_url:
            "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season",
          updated_at: new Date().toISOString(),
          game_date: date,
        },
      },
    });
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/lineups") {
        lineRequests++;
        assert.equal(url.searchParams.get("team"), "ANA");
        return failed
          ? route.fulfill({ status: 502, json: { error: "Unavailable" } })
          : route.fulfill({ json: feed() });
      }
      if (url.pathname === "/api/nhl") {
        const path = url.searchParams.get("path");
        if (path.startsWith("roster/"))
          return route.fulfill({
            json: {
              forwards: players.slice(0, 12),
              defensemen: players.slice(12, 19),
              goalies: players.slice(19),
            },
          });
        if (path.startsWith("club-stats/"))
          return route.fulfill({
            json: { season: 20262027, gameType: 2, skaters: [] },
          });
        return route.fulfill({
          json: {
            gameLog: [
              {
                gameDate: new Date(Date.now() - 86400000)
                  .toISOString()
                  .slice(0, 10),
                goals: 1,
                assists: 1,
                opponentAbbrev: "BOS",
                shotsAgainst: 30,
                goalsAgainst: 2,
                toi: "60:00",
              },
            ],
          },
        });
      }
      if (url.pathname === "/api/injuries")
        return route.fulfill({ json: { injuries: [] } });
      if (url.pathname === "/api/leaders")
        return route.fulfill({ json: { points: [] } });
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    });
    await page.route("https://**", (r) => r.abort());
    await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3166");
    await page.waitForFunction(() => !loading && pendingForms.size === 0);
    assert.equal(lineRequests, 1);
    assert.equal(await page.locator("#forward-lines .line-row").count(), 4);
    assert.equal(await page.locator("#defense-lines .line-row").count(), 4);
    assert.equal(await page.locator("#goalie-lines .goalie-slot").count(), 2);
    assert.match(
      await page.locator("#goalie-lines .player-name").first().innerText(),
      /Twenty\b/,
    );
    assert.match(
      await page.locator("#defense-lines .line-number").last().innerText(),
      /Additional defenseman/,
    );
    assert.match(
      await page
        .locator("#goalie-lines .goalie-slot small")
        .first()
        .innerText(),
      /Projected Starter/,
    );
    assert.match(
      await page.locator("#line-source-status").innerText(),
      /NHL.com projected lineup/,
    );
    assert.match(
      await page.locator("#forward-lines .player-stats").first().innerText(),
      /1 GP/,
    );
    for (const width of [320, 393, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "No overflow at " + width,
      );
      const slots = await page
        .locator("#goalie-lines .goalie-slot")
        .evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            };
          }),
        );
      assert.ok(
        slots[0].right <= slots[1].left || slots[0].bottom <= slots[1].top,
        "Goalies stay separate at " + width,
      );
    }
    date = new Date(Date.now() - 2 * 86400000).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    await page.evaluate(() => loadTeam());
    await page.waitForFunction(() => !loading);
    assert.match(
      await page.locator("#lineup-notice").innerText(),
      /Last published NHL projection/,
    );
    assert.match(
      await page.locator("#lineup-notice").innerText(),
      new RegExp(date),
    );
    assert.match(
      await page
        .locator("#goalie-lines .goalie-slot small")
        .first()
        .innerText(),
      /Previous projected Starter/,
    );
    failed = true;
    await page.reload();
    await page.waitForFunction(() => !loading);
    assert.equal(
      await page.locator("#forward-lines .line-row").count(),
      4,
      "Saved official rows survive a source failure",
    );
    assert.match(
      await page.locator("#line-source-status").innerText(),
      /Previous game projection/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: official team-scoped JSON restores dated lines, seventh defender and two separate goalies; 320–1440px, stats and saved-source failure covered.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
