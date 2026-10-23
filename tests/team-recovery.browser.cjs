// Real checked-in last-good snapshots must keep cold visits useful during NHL outages.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const snapshots = Object.fromEntries(
  ["CGY", "ANA"].map((team) => [
    team,
    JSON.parse(
      fs.readFileSync(
        path.join(__dirname, `../static/team-snapshots/${team}.json`),
        "utf8",
      ),
    ),
  ]),
);
const slugs = { CGY: "calgary-flames", ANA: "anaheim-ducks" };
const displayName = (player) =>
  `${player.firstName.default} ${player.lastName.default}`;
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const [team, healthy] of [
      ["CGY", false],
      ["ANA", false],
      ["CGY", true],
    ]) {
      const snapshot = snapshots[team];
      const now =
        Math.max(
          Date.parse(snapshot.rosterCheckedAt),
          Date.parse(snapshot.statsCheckedAt),
        ) + 1000;
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors = [];
      let snapshotRequests = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/team-snapshots/"))
          snapshotRequests++;
      });
      // The only initial preference is the selected team: no saved roster/stats or IndexedDB.
      await page.addInitScript(
        ({ team, now }) => {
          localStorage.clear();
          localStorage.setItem("blueline-v2", JSON.stringify({ team }));
          Date.now = () => now;
        },
        { team, now },
      );
      const rows = (members, width) =>
        Array.from({ length: Math.ceil(members.length / width) }, (_, i) =>
          members.slice(i * width, (i + 1) * width).map(displayName),
        );
      const forwards = snapshot.roster.forwards.slice(0, 12);
      const defensemen = snapshot.roster.defensemen.slice(0, 6);
      const goalies = snapshot.roster.goalies.slice(0, 2);
      const source = {
        source: "nhl.com",
        updated_at: new Date(now).toISOString(),
        teams: {
          [slugs[team]]: {
            forwards: rows(forwards, 3),
            defense: rows(defensemen, 2),
            goalies: rows(goalies, 1),
            pp1: [],
            pp2: [],
            source_url: "https://www.nhl.com/news/test-published-projection",
            updated_at: new Date(now).toISOString(),
            game_date: new Date(now).toISOString().slice(0, 10),
          },
        },
      };
      await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/lineups")
          return route.fulfill({ json: source });
        if (url.pathname === "/api/nhl") {
          const routePath = url.searchParams.get("path") || "";
          if (healthy && routePath.startsWith("roster/"))
            return route.fulfill({ json: snapshot.roster });
          if (healthy && routePath.startsWith("club-stats/"))
            return route.fulfill({ json: snapshot.stats });
          if (healthy && routePath.includes("/game-log/"))
            return route.fulfill({ json: { gameLog: [] } });
          return route.fulfill({
            status: 503,
            json: { error: "Synthetic NHL outage" },
          });
        }
        if (url.pathname === "/api/games")
          return route.fulfill({
            json: { date: url.searchParams.get("date"), games: [] },
          });
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic ancillary source outage" },
        });
      });
      // Static WebPs load unchanged; unrelated official SVG/logo requests remain offline.
      await page.route(
        (url) => url.protocol === "https:",
        (route) =>
          route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
          }),
      );
      await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3184");
      await page.waitForFunction(
        () =>
          !loading &&
          seasonPlayers.size > 0 &&
          document.querySelector(".header-scorer-player"),
      );
      assert.equal(
        await page.locator("#forward-lines .player-card").count(),
        forwards.length,
      );
      assert.equal(
        await page.locator("#defense-lines .player-card").count(),
        defensemen.length,
      );
      assert.equal(
        await page.locator("#goalie-lines .player-card").count(),
        goalies.length,
      );
      const state = await page.evaluate(() => ({
        source,
        fetchedAt,
        ids: players.map((p) => p.id),
        unmatched: players.filter((p) => p.unmatched).map((p) => p.name),
      }));
      assert.ok(
        state.ids.every(Number.isSafeInteger),
        `Every recovered player has an NHL ID (${team})`,
      );
      assert.deepEqual(
        state.unmatched,
        [],
        `No all-initials source placeholders survive (${team})`,
      );
      if (!healthy) {
        assert.equal(
          state.source,
          "saved",
          "Backup data is not claimed to be freshly fetched",
        );
        assert.equal(
          state.fetchedAt,
          Date.parse(snapshot.rosterCheckedAt),
          "Recovery preserves the original roster timestamp",
        );
      } else assert.equal(state.source, "live");
      for (const player of [forwards[0], defensemen[0], goalies[0]]) {
        const card = page
          .locator(`.player-card[data-player="${player.id}"]`)
          .first();
        assert.equal(
          await card.locator(".player-number").innerText(),
          `#${player.sweaterNumber}`,
        );
        assert.doesNotMatch(
          await card.locator(".player-meta").innerText(),
          /—/,
        );
        const image = card.locator(".portrait img");
        assert.equal(
          await image.count(),
          1,
          `Recovered portrait exists for ${displayName(player)}`,
        );
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
        assert.ok(await image.evaluate((element) => element.naturalWidth > 0));
      }
      const stat = snapshot.stats.skaters.find(
        (player) => player.playerId === forwards[0].id,
      );
      assert.ok(
        stat,
        "Fixture includes real season totals for the first forward",
      );
      assert.match(
        await page
          .locator(
            `#forward-lines [data-player="${forwards[0].id}"] .player-stats`,
          )
          .innerText(),
        new RegExp(
          `${stat.gamesPlayed} GP.*${stat.goals} G \\+ ${stat.assists} A.*${stat.points} P`,
        ),
      );
      const leader = snapshot.stats.skaters.reduce(
        (best, player) =>
          !best || player.points > best.points ? player : best,
        null,
      );
      assert.ok(
        await page
          .locator(".header-scorer-name")
          .innerText()
          .then((name) => name.includes(displayName(leader))),
        "Last-good scoring leader remains visible",
      );
      assert.equal(
        snapshotRequests,
        healthy ? 0 : 1,
        "Concurrent roster/stat failures share one static team snapshot request; healthy APIs need none",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Cold recovery has no mobile overflow",
      );
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS: cold CGY/ANA NHL outages recover real identities, portraits, jersey/position and season/scorer data through one shared dated snapshot; healthy live data needs no backup fetch.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
