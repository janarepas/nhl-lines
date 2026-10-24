// Delayed data must not move the header; placeholder rows keep later sections offscreen.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const html = fs
      .readFileSync("src/index.html", "utf8")
      .replace(
        "<!-- BUILD_STYLES -->",
        `<style>${fs.readFileSync("static/style.css", "utf8")}</style>`,
      )
      .replace(
        "<!-- BUILD_THEME -->",
        '<script>document.documentElement.dataset.theme="dark"</script>',
      );
    for (const width of [320, 393, 820, 1350]) {
      const page = await browser.newPage({ viewport: { width, height: 940 } });
      await page.route("**/*", (route) => route.abort());
      await page.setContent(html);
      const initial = await page
        .locator("#main-content")
        .evaluate((e) => e.getBoundingClientRect().top);
      assert.ok(
        await page
          .locator(".lower-grid")
          .evaluate((e) => e.getBoundingClientRect().top > innerHeight),
        `Later sections start below the viewport while lineups load at ${width}`,
      );
      await page.evaluate(() => {
        document.querySelector("#games-list").innerHTML =
          '<article class="game-card"><div class="game-matchup"><div class="game-side"><span class="game-team"><img width="56" height="56" alt="">ANA</span><button class="game-score">2</button></div><div class="game-side"><span class="game-team"><img width="56" height="56" alt="">BOS</span><button class="game-score">1</button></div></div><span class="game-status">Final · 24 Oct, 01:00 Budapest</span><a class="nhl-game-link">NHL</a></article>';
        document.querySelector("#games-date").textContent = "23 Oct 2026";
        document.querySelector("#games-calendar-note").textContent =
          "NHL game day · Budapest starts: 24 Oct 2026";
        document.querySelector("#header-top-scorer").innerHTML =
          '<div class="header-scorer-list"><div class="header-scorer-player"><span class="portrait is-fallback">AB</span><div class="header-scorer-copy"><span class="header-scorer-caption">Team scoring leader</span><strong class="header-scorer-name">Player Name</strong><dl class="header-scorer-stats"><div><dt>GP</dt><dd>10</dd></div><div><dt>G</dt><dd>8</dd></div></dl></div></div></div>';
      });
      const ready = await page
        .locator("#main-content")
        .evaluate((e) => e.getBoundingClientRect().top);
      assert.ok(
        Math.abs(initial - ready) < 1,
        `Async games and scorer do not move main content at ${width}: ${initial} -> ${ready}`,
      );
      for (const selector of [
        ".games-heading h2",
        ".game-status",
        ".header-scorer-caption",
        ".position-labels",
        "footer .source-note",
      ]) {
        assert.ok(
          await page
            .locator(selector)
            .first()
            .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 12),
          `Readable ${selector} at ${width}`,
        );
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `No horizontal overflow at ${width}`,
      );
      await page.close();
    }
    const page = await browser.newPage();
    await page.setContent(html);
    await page.evaluate(() => {
      document.querySelector("#forward-lines").innerHTML =
        '<span class="player-portrait"><span class="portrait-status"><span class="status-icon">🔥</span><span class="top-mark">🎯</span></span><span class="portrait-hand">🏒</span></span>';
    });
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    assert.ok(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-transparency: reduce)").matches,
      ),
    );
    for (const selector of [".status-icon", ".top-mark", ".portrait-hand"]) {
      assert.equal(
        await page
          .locator(selector)
          .evaluate((e) => getComputedStyle(e).backdropFilter),
        "none",
      );
    }
    console.log(
      "PASS: delayed games/scorer retain header geometry, initial lineups reserve viewport space, secondary text is readable, reduced transparency disables badge filters.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
