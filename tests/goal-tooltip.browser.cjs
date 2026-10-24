const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const details = (id, overrides = {}) => ({
  gameId: id,
  state: "OFF",
  outcome: "REG",
  shootout: false,
  away: {
    code: "MTL",
    score: 4,
    complete: true,
    scorers: [
      { playerId: 8478133, name: "Jake Evans", goals: 2 },
      { playerId: 8482087, name: "Kaiden Guhle", goals: 1 },
      { playerId: 8476875, name: "Mike Matheson", goals: 1 },
    ],
  },
  home: { code: "CHI", score: 0, complete: true, scorers: [] },
  source: "NHL",
  sourceUrl: `https://api-web.nhle.com/v1/gamecenter/${id}/landing`,
  ...overrides,
});
const game = (id, goalDetails) => ({
  id,
  state: "OFF",
  outcome: "REG",
  start: "2026-10-24T00:00:00Z",
  away: { code: "MTL", score: 4 },
  home: { code: "CHI", score: 0 },
  goalDetails,
});

(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      hasTouch: true,
    });
    const page = await context.newPage();
    let calls = 0,
      mode = "ok",
      held = null;
    await page.route("http://goals.test/api/game-goals?*", (route) => {
      calls++;
      const id = Number(
        new URL(route.request().url()).searchParams.get("game"),
      );
      if (mode === "held") {
        held = route;
        return;
      }
      if (mode === "error")
        return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      if (mode === "limited")
        return route.fulfill({
          status: 429,
          headers: { "Retry-After": "120" },
          json: { error: "Slow down" },
        });
      if (mode === "limited503")
        return route.fulfill({
          status: 503,
          headers: { "Retry-After": "600" },
          json: { error: "Source is busy" },
        });
      if (mode === "savedLimited")
        return route.fulfill({
          json: details(id),
          headers: {
            "Retry-After": "600",
            "X-Data-State": "stale",
            "X-NHL-Checked-At": new Date().toISOString(),
          },
        });
      const body =
        mode === "partial"
          ? details(id, {
              away: {
                code: "MTL",
                score: 4,
                complete: false,
                scorers: [{ playerId: 8478133, name: "Jake Evans", goals: 2 }],
              },
            })
          : mode === "mismatch"
            ? details(id, {
                away: {
                  code: "MTL",
                  score: 5,
                  complete: true,
                  scorers: [
                    { playerId: 8478133, name: "Jake Evans", goals: 5 },
                  ],
                },
              })
            : details(id);
      return route.fulfill({
        json: body,
        headers: {
          "X-Data-State": "fresh",
          "X-NHL-Checked-At": new Date().toISOString(),
        },
      });
    });
    await page.route("http://goals.test/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html data-theme="dark"><body><section id="daily-games"><div id="games-list"></div></section><button id="outside" style="position:fixed;bottom:0;right:0">Outside</button></body></html>',
      }),
    );
    await page.goto("http://goals.test/");
    await page.addStyleTag({
      content: fs.readFileSync("static/style.css", "utf8"),
    });
    await page.addScriptTag({
      path: path.resolve("static/game-goal-tooltip.js"),
    });
    await page.evaluate(() => {
      window.scoreState = { games: [], stale: false, at: Date.now() };
      window.goalPopover = GameGoalPopover.mount(
        document.querySelector("#daily-games"),
        () => scoreState,
      );
    });
    const show = async (item) => {
      await page.evaluate((g) => {
        goalPopover.close();
        scoreState.games = [g];
        document.querySelector("#games-list").innerHTML =
          `<article class="game-card"><div class="game-matchup"><div class="game-side"><span class="game-team">MTL</span><button class="game-score" data-game="${g.id}" data-team="MTL" aria-expanded="false">${g.away.score}</button></div><div class="game-side"><span class="game-team">CHI</span><button class="game-score" data-game="${g.id}" data-team="CHI" aria-expanded="false">${g.home.score}</button></div></div></article>`;
      }, item);
    };
    const panel = page.locator("#game-goal-tooltip"),
      away = page.locator('[data-team="MTL"]'),
      home = page.locator('[data-team="CHI"]');
    await show(game(2026020166, details(2026020166)));
    assert.equal(
      calls,
      0,
      "Merely mounting and drawing results makes no detail request",
    );
    await away.hover();
    await panel.waitFor({ state: "visible" });
    assert.match(await panel.innerText(), /Jake Evans\s+2/);
    assert.match(await panel.innerText(), /Kaiden Guhle/);
    assert.equal(
      calls,
      0,
      "Verified embedded scoring events open immediately without extra fetches",
    );
    await home.focus();
    assert.match(await panel.innerText(), /No goals scored/);
    assert.equal(await home.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
    assert.equal(await home.getAttribute("aria-expanded"), "false");
    await away.tap();
    await panel.waitFor({ state: "visible" });
    await away.tap();
    await panel.waitFor({ state: "hidden" });
    await away.tap();
    await page.locator("#outside").tap();
    await panel.waitFor({ state: "hidden" });

    // Both teams share one in-flight game request and then the same saved result.
    mode = "held";
    await show(game(2026020200));
    await away.hover();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("Loading goal scorers"),
    );
    while (!held) await new Promise((resolve) => setTimeout(resolve, 10));
    await home.focus();
    assert.equal(calls, 1);
    await held.fulfill({
      json: details(2026020200),
      headers: { "X-NHL-Checked-At": new Date().toISOString() },
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("No goals scored"),
    );
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("Jake Evans"),
    );
    assert.equal(calls, 1);
    await page.keyboard.press("Escape");

    mode = "partial";
    await show(game(2026020201));
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("Goal details incomplete"),
    );
    assert.match(await panel.innerText(), /Jake Evans/);
    assert.doesNotMatch(await panel.innerText(), /No goals scored/);
    mode = "mismatch";
    await show(game(2026020202));
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("updating to match the score"),
    );
    assert.doesNotMatch(await panel.innerText(), /Jake Evans/);
    mode = "error";
    await show(game(2026020203));
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("Goal scorers unavailable"),
    );
    const errorsAt = calls;
    await home.focus();
    await page.waitForTimeout(30);
    assert.equal(
      calls,
      errorsAt,
      "Repeated interaction does not hammer a failed source",
    );

    const shootout = details(2026020204, {
      outcome: "SO",
      shootout: true,
      away: { code: "MTL", score: 1, complete: true, scorers: [] },
    });
    await show({
      ...game(2026020204, shootout),
      away: { code: "MTL", score: 1 },
    });
    await away.focus();
    assert.match(await panel.innerText(), /No regulation or overtime goals/);
    assert.match(
      await panel.innerText(),
      /shootout deciding score is not a player goal/,
    );
    const malicious = details(2026020205, {
      away: {
        code: "MTL",
        score: 4,
        complete: true,
        scorers: [
          {
            playerId: 8478133,
            name: '<img src=x onerror="window.badGoalName=true">',
            goals: 4,
          },
        ],
      },
    });
    await show(game(2026020205, malicious));
    await away.focus();
    assert.equal(await panel.locator("img").count(), 0);
    assert.equal(await page.evaluate(() => window.badGoalName), undefined);
    assert.match(await panel.innerText(), /<img src=x/);
    const bounds = await panel.boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.x + bounds.width <= 393 &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= 852,
      "Mobile popover stays fully inside the viewport",
    );
    // An open region closes if its score is removed in a later score response.
    await page.evaluate(() => {
      document.querySelector("#games-list").replaceChildren();
      goalPopover.refresh();
    });
    await panel.waitFor({ state: "hidden" });

    mode = "limited";
    await show(game(2026020206));
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("unavailable"),
    );
    const limitedAt = calls;
    await show(game(2026020207));
    await away.focus();
    await page.waitForTimeout(40);
    assert.equal(
      calls,
      limitedAt,
      "Retry-After pauses even different game detail requests",
    );

    // Upstream overload also supplies Retry-After; 503 must retain its full delay.
    await page.evaluate(() => {
      window.goalTestNow = Date.now() + 121000;
      Date.now = () => window.goalTestNow;
    });
    mode = "limited503";
    await show(game(2026020208));
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("unavailable"),
    );
    assert.equal(calls, limitedAt + 1);
    const limited503At = calls;
    await page.evaluate(() => {
      window.goalTestNow += 599000;
    });
    await show(game(2026020208));
    await away.focus();
    await page.waitForTimeout(40);
    assert.equal(
      calls,
      limited503At,
      "503 error cache lasts the full 600-second source delay",
    );
    await show(game(2026020209));
    await away.focus();
    await page.waitForTimeout(40);
    assert.equal(
      calls,
      limited503At,
      "503 Retry-After also pauses other game IDs before 600 seconds",
    );
    await page.evaluate(() => {
      window.goalTestNow += 2000;
    });
    await show(game(2026020208));
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("unavailable"),
    );
    assert.equal(
      calls,
      limited503At + 1,
      "A new interaction can retry after the 600-second backoff expires",
    );
    // A saved 200 response remains usable while its overload hint pauses new work.
    await page.evaluate(() => {
      window.goalTestNow += 601000;
    });
    mode = "savedLimited";
    await show(game(2026020210));
    await away.focus();
    await page.waitForFunction(() =>
      document
        .querySelector("#game-goal-tooltip")
        .textContent.includes("Saved NHL goal details"),
    );
    assert.match(await panel.innerText(), /Jake Evans/);
    const savedLimitedAt = calls;
    await page.evaluate(() => {
      window.goalTestNow += 599000;
    });
    await show(game(2026020211));
    await away.focus();
    await page.waitForTimeout(40);
    assert.equal(
      calls,
      savedLimitedAt,
      "Saved 200 Retry-After pauses other games for the full source delay",
    );
    await context.close();
    console.log(
      "PASS: goal scorers are instant from verified embedded data, accessible by hover/focus/tap, shared and lazy on missing data, safely escaped, truthful for partial/zero/SO/mismatched scores, and bounded inside mobile viewports.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
