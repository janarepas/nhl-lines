// Verified metadata must repair published identities even when roster/prospect data omits them.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const team of ["NJD", "CBJ"]) {
      const page = await browser.newPage({
        viewport: { width: 393, height: 852 },
        reducedMotion: "reduce",
      });
      await page.addInitScript(
        (team) => localStorage.setItem("blueline-v2", JSON.stringify({ team })),
        team,
      );
      let prospectRequests = 0,
        supplementRequests = 0;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/verified-players.json")
          supplementRequests++;
      });
      const player = (id, first, last, pos) => ({
        id,
        firstName: { default: first },
        lastName: { default: last },
        positionCode: pos,
        sweaterNumber: 10,
        shootsCatches: "L",
        birthCountry: "CAN",
        headshot: "",
      });
      const f = Array.from({ length: 4 }, (_, i) =>
        player(8481000 + i, "Forward", String.fromCharCode(65 + i), "C"),
      );
      const d = Array.from({ length: 3 }, (_, i) =>
        player(8481010 + i, "Defense", String.fromCharCode(65 + i), "D"),
      );
      const g = player(8481020, "Goalie", "One", "G");
      const name = (p) => p.firstName.default + " " + p.lastName.default;
      const slug =
        team === "NJD" ? "new-jersey-devils" : "columbus-blue-jackets";
      const now = new Date().toISOString();
      const feed = {
        source: "nhl.com",
        updated_at: now,
        teams: {
          [slug]: {
            forwards: [[team === "NJD" ? "Dawson Mercer" : name(f[0])]],
            defense: [[name(d[0])]],
            goalies: [[team === "NJD" ? "Nico Daws" : name(g)]],
            pp1: [],
            pp2: [],
            source_url: "https://www.nhl.com/news/test-projection",
            updated_at: now,
            game_date: now.slice(0, 10),
          },
        },
      };
      const member = (p) => ({
        name: name(p),
        group: p.positionCode === "D" ? "D" : "F",
      });
      const sev = { name: "Damon Severson", group: "D" };
      const special = {
        team,
        source: "ESPN",
        sourceUrl: `https://www.espn.com/nhl/team/depth/_/id/${team === "CBJ" ? 29 : 11}`,
        pp: [
          [member(f[0]), member(f[1]), member(f[2]), member(d[0]), sev],
          [
            member(f[0]),
            member(f[1]),
            member(f[3]),
            member(d[1]),
            member(d[2]),
          ],
        ],
        pk: [
          [member(f[0]), member(f[1]), member(d[0]), sev],
          [member(f[2]), member(f[3]), member(d[1]), member(d[2])],
        ],
      };
      await page.route("**/api/**", (route) => {
        const u = new URL(route.request().url()),
          path = u.searchParams.get("path") || "";
        if (u.pathname === "/api/lineups") return route.fulfill({ json: feed });
        if (u.pathname === "/api/special-teams")
          return route.fulfill({ json: special });
        if (u.pathname === "/api/nhl") {
          if (path.startsWith("roster/"))
            return route.fulfill({
              json: { forwards: f, defensemen: d, goalies: [g] },
            });
          if (path.startsWith("prospects/")) {
            prospectRequests++;
            return route.fulfill({
              status: 503,
              json: { error: "Unavailable" },
            });
          }
          if (path.startsWith("club-stats/"))
            return route.fulfill({
              json: { season: 20262027, gameType: 2, skaters: [] },
            });
          if (path.endsWith("/landing"))
            return route.fulfill({
              json: {
                playerId: Number(path.split("/")[1]),
                seasonTotals: [],
                currentTeamAbbrev: "WPG",
              },
            });
          return route.fulfill({ json: { gameLog: [] } });
        }
        if (u.pathname === "/api/games")
          return route.fulfill({
            json: { date: u.searchParams.get("date"), games: [] },
          });
        return route.fulfill({ json: { injuries: [], points: [] } });
      });
      await page.route(
        (url) => url.protocol === "https:",
        (route) =>
          route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
          }),
      );
      await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3182");
      await page.waitForFunction(() => !loading);
      if (team === "NJD") {
        assert.equal(
          await page.locator('[data-player="dfo:dawsonmercer"]').count(),
          0,
        );
        assert.equal(
          await page.locator('[data-player="dfo:nicodaws"]').count(),
          0,
        );
        assert.equal(await page.locator('[data-player="8482110"]').count(), 1);
        assert.equal(await page.locator('[data-player="8482076"]').count(), 1);
        assert.ok(
          await page.evaluate(() =>
            players
              .filter((p) => p.supplemental)
              .every((p) => p.number !== "—" && p.image && p.birthCountry),
          ),
        );
        await page.locator('[data-player="8482110"]').click();
        assert.match(
          await page.locator("#player-detail .player-meta").innerText(),
          /WPG/,
        );
        await page.keyboard.press("Escape");
      } else {
        assert.equal(
          supplementRequests,
          0,
          "Fully matched even-strength lineup needs no supplement",
        );
        await page.locator("#tab-pk").click();
        await page.waitForSelector('.pk-unit [data-player="8476923"]');
        assert.equal(
          await page
            .locator('.pk-unit [data-player="dfo:damonseverson"]')
            .count(),
          0,
        );
        assert.equal(
          await page.locator('#extras [data-player="8476923"]').count(),
          0,
          "Special-only identity must not become an unrelated scratched player",
        );
      }
      assert.equal(
        supplementRequests,
        1,
        "One shared small metadata file serves all missing names",
      );
      assert.equal(
        prospectRequests,
        0,
        "Verified static identity needs no extra origin prospect calls",
      );
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      "PASS: missing roster metadata resolves from verified NHL identities, transfer teams stay correct, special-only names resolve without unrelated extras or prospect calls.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
