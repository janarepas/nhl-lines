// Regression for legacy browser snapshots, including unavailable upstream APIs.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const shape of [
      "missing-extra",
      "flagless-placeholder",
      "missing-metadata",
    ]) {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      await page.route("**/api/**", async (route) => {
        await new Promise((r) => setTimeout(r, 400));
        await route.fulfill({
          status: 502,
          json: { error: "Offline fixture" },
        });
      });
      await page.route("**/assets.nhle.com/**", (route) => route.abort());
      await page.addInitScript((shape) => {
        const player = (id, first, last, group, number) => ({
          id,
          first,
          last,
          name: `${first} ${last}`,
          group,
          pos: group,
          number,
          image: "",
          customImage: "",
          tsn: "",
        });
        const jake = player(8478136, "Jake", "Middleton", "D", 55);
        const jacob = player(
          "dfo:jacobmiddleton",
          "Jacob",
          "Middleton",
          "D",
          "—",
        );
        const players = [
          player(8474150, "Mikael", "Backlund", "F", 11),
          jake,
          player(8481692, "Dustin", "Wolf", "G", 32),
        ];
        if (shape !== "missing-metadata") players.push(jacob);
        const lineData = {
          version: 1,
          type: "published-dfo",
          team: "CGY",
          forwards: [[8474150]],
          defense: [[jacob.id]],
          goalies: [8481692],
          pp: [[8474150, jacob.id]],
          pk: [],
          extra: shape === "flagless-placeholder" ? [jacob] : [],
          updated: new Date().toISOString(),
          sourceUrl: "https://example.test/published",
        };
        localStorage.setItem(
          "blueline-v2",
          JSON.stringify({
            team: "CGY",
            teams: {
              CGY: {
                players,
                lineData,
                slots: [],
                fetchedAt: Date.now(),
                linesFetchedAt: Date.now(),
              },
            },
          }),
        );
      }, shape);
      await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3163");
      await page.waitForFunction(() =>
        document.querySelector('#defense-lines [data-player="8478136"]'),
      );
      assert.equal(
        await page.locator('[data-player="dfo:jacobmiddleton"]').count(),
        0,
        shape,
      );
      assert.equal(
        await page.locator('#extras-list [data-player="8478136"]').count(),
        0,
        shape,
      );
      await page.waitForFunction(() => !loading);
      const state = await page.evaluate(() => ({
        ids: players.map((p) => p.id),
        defense: lineData.defense,
        pp: lineData.pp,
        saved: JSON.parse(localStorage.getItem("blueline-v2")).teams.CGY,
      }));
      assert.deepEqual(state.defense, [[8478136]], shape);
      assert.deepEqual(state.pp, [[8474150, 8478136]], shape);
      assert.equal(state.ids.filter((id) => id === 8478136).length, 1, shape);
      assert.ok(
        !state.saved.players.some((p) => p.id === "dfo:jacobmiddleton"),
        shape,
      );
      assert.deepEqual(state.saved.lineData.defense, [[8478136]], shape);
      await page.close();
    }
    console.log(
      "PASS: legacy Middleton duplicates are repaired before display and persisted even when all APIs fail; missing indexes, missing metadata and flagless placeholders covered.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
