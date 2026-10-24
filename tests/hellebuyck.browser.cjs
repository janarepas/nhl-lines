// Current and older source projections can name a verified player absent from that roster.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const registry = require("../static/verified-players.json");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const [team, cached] of [
      ["NJD", false],
      ["NJD", true],
      ["WPG", true],
    ]) {
      const page = await browser.newPage({
        viewport: { width: 393, height: 852 },
        reducedMotion: "reduce",
      });
      const metadata = registry.players.find((player) => player.id === 8476945);
      const record = (id, first, last, positionCode, sweaterNumber) => ({
        id,
        firstName: { default: first },
        lastName: { default: last },
        positionCode,
        sweaterNumber,
        shootsCatches: "L",
        birthCountry: "USA",
        headshot: "",
      });
      const f =
          team === "NJD"
            ? record(8478542, "Evan", "Rodrigues", "C", 17)
            : record(8476460, "Mark", "Scheifele", "C", 55),
        d =
          team === "NJD"
            ? record(8476462, "Dougie", "Hamilton", "D", 7)
            : record(8480145, "Neal", "Pionk", "D", 4),
        g =
          team === "NJD"
            ? record(8474596, "Jake", "Allen", "G", 34)
            : record(8479973, "Stuart", "Skinner", "G", 74),
        roster = { forwards: [f], defensemen: [d], goalies: [g] },
        now = new Date().toISOString(),
        name = (p) => p.firstName.default + " " + p.lastName.default,
        slug = team === "NJD" ? "new-jersey-devils" : "winnipeg-jets";
      const feed = {
        source: "nhl.com",
        updated_at: now,
        teams: {
          [slug]: {
            forwards: [[name(f)]],
            defense: [[name(d)]],
            goalies: [[name(g)], ["Connor Hellebuyck"]],
            pp1: [],
            pp2: [],
            source_url:
              "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season",
            updated_at: now,
            game_date: now.slice(0, 10),
          },
        },
      };
      await page.addInitScript(
        ({ team, roster, cached, now }) => {
          localStorage.clear();
          const saved = { team, teams: {} };
          if (cached) {
            const parsed = Object.entries(roster).flatMap(([key, list]) =>
              list.map((p) => ({
                id: p.id,
                name: p.firstName.default + " " + p.lastName.default,
                first: p.firstName.default,
                last: p.lastName.default,
                group:
                  key === "forwards" ? "F" : key === "defensemen" ? "D" : "G",
                pos: p.positionCode,
                number: p.sweaterNumber,
                image: "",
              })),
            );
            const missing = {
              id: "dfo:connorhellebuyck",
              name: "Connor Hellebuyck",
              first: "Connor",
              last: "Hellebuyck",
              group: "G",
              pos: "—",
              number: "—",
              image: "",
              unmatched: true,
            };
            const lineData = {
              version: 1,
              type: "published-nhl",
              team,
              projectionDate: now.slice(0, 10),
              updated: now,
              sourceUrl:
                "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season",
              forwards: [[roster.forwards[0].id]],
              defense: [[roster.defensemen[0].id]],
              goalies: [roster.goalies[0].id, missing.id],
              pp: [],
              pk: [],
              extra: [missing],
            };
            saved.teams[team] = {
              players: [...parsed, missing],
              lineData,
              slots: [],
              fetchedAt: Date.now(),
              linesFetchedAt: Date.now(),
            };
          }
          localStorage.setItem("blueline-v2", JSON.stringify(saved));
        },
        { team, roster, cached, now },
      );
      let supplements = 0,
        prospects = 0;
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/verified-players.json")
          supplements++;
      });
      await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url()),
          nhlPath = url.searchParams.get("path") || "";
        if (url.pathname === "/api/lineups")
          return cached
            ? route.fulfill({
                status: 503,
                json: { error: "Lineup refresh unavailable" },
              })
            : route.fulfill({ json: feed });
        if (url.pathname === "/api/nhl") {
          if (nhlPath.startsWith("roster/"))
            return route.fulfill({ json: roster });
          if (nhlPath.startsWith("prospects/")) {
            prospects++;
            return route.fulfill({ status: 503 });
          }
          if (nhlPath.startsWith("club-stats/"))
            return route.fulfill({
              json: { season: 20262027, gameType: 2, skaters: [], goalies: [] },
            });
          if (nhlPath.endsWith("/landing"))
            return route.fulfill({
              json: {
                playerId: Number(nhlPath.split("/")[1]),
                currentTeamAbbrev: "NJD",
                seasonTotals: [],
              },
            });
          return route.fulfill({ json: { gameLog: [] } });
        }
        if (url.pathname === "/api/games")
          return route.fulfill({
            json: { date: url.searchParams.get("date"), games: [] },
          });
        return route.fulfill({ json: { points: [], injuries: [] } });
      });
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
          document.querySelector('#goalie-lines [data-player="8476945"]'),
      );
      const card = page.locator('#goalie-lines [data-player="8476945"]');
      assert.equal(
        await page.locator('[data-player="dfo:connorhellebuyck"]').count(),
        0,
        "An old cached initials-only identity is replaced",
      );
      assert.equal(await card.locator(".player-number").innerText(), "#37");
      assert.match(await card.locator(".player-meta").innerText(), /G/);
      assert.match(await card.innerText(), /Connor\s+Hellebuyck/);
      const photo = card.locator(".portrait img");
      assert.equal(
        await photo.getAttribute("src"),
        metadata.image,
        "The portrait follows his verified current NHL team",
      );
      await photo.scrollIntoViewIfNeeded();
      await photo.evaluate((image) => image.decode());
      assert.equal(
        await card.locator(".player-stats").count(),
        0,
        "Missing season data never becomes invented goalie metrics",
      );
      const saved = await page.evaluate(
        (team) => JSON.parse(localStorage.getItem("blueline-v2")).teams[team],
        team,
      );
      assert.deepEqual(saved.lineData.goalies, [g.id, 8476945]);
      assert.equal(
        saved.players.find((player) => player.id === 8476945).currentTeam,
        "NJD",
      );
      assert.ok(
        !saved.players.some((player) => player.id === "dfo:connorhellebuyck"),
      );
      await card.click();
      await page.waitForSelector("#player-dialog[open]");
      assert.match(
        await page.locator("#player-detail .player-meta").innerText(),
        /#37.*G.*NJD/s,
      );
      assert.equal(
        supplements,
        1,
        "One shared static metadata response repairs the source name",
      );
      assert.equal(
        prospects,
        0,
        "A verified identity needs no extra prospect API request",
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      "PASS: Hellebuyck's current NJD portrait, #37 and goalie identity repair fresh NJD and saved NJD/WPG projections, preserve current-team truth, avoid prospect requests and never invent statistics.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
