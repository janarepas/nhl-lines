// Real checked-in WebP files, synthetic NHL responses, no external network.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const original = "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png";
const transparentPNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==",
  "base64",
);
async function localServer() {
  const directory = path.resolve(__dirname, "../static");
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = path.resolve(
      directory,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(directory + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, bytes) => {
      if (error) return response.writeHead(404).end();
      const types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".json": "application/json",
      };
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      response.end(bytes);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: "http://127.0.0.1:" + server.address().port };
}
(async () => {
  const local = process.env.NHL_TEST_BASE_URL ? null : await localServer();
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    for (const scenario of [
      "optimized",
      "original-fallback",
      "initials-fallback",
    ]) {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 393, height: 852 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors = [],
        requestedOptimized = [],
        observedImages = [];
      page.on("request", (req) => {
        if (req.resourceType() === "image") observedImages.push(req.url());
      });
      let originalRequests = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() =>
        localStorage.setItem("blueline-v2", JSON.stringify({ team: "EDM" })),
      );
      const player = {
        id: 8478402,
        firstName: { default: "Connor" },
        lastName: { default: "McDavid" },
        sweaterNumber: 97,
        positionCode: "C",
        shootsCatches: "L",
        birthCountry: "CAN",
        headshot: original,
      };
      await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url()),
          nhlPath = url.searchParams.get("path") || "";
        if (url.pathname === "/api/nhl") {
          if (nhlPath.startsWith("roster/"))
            return route.fulfill({
              json: { forwards: [player], defensemen: [], goalies: [] },
            });
          if (nhlPath.startsWith("club-stats/"))
            return route.fulfill({
              json: {
                season: 20262027,
                gameType: 2,
                skaters: [
                  {
                    ...player,
                    playerId: player.id,
                    gamesPlayed: 10,
                    goals: 8,
                    assists: 23,
                    points: 31,
                  },
                ],
                goalies: [],
              },
            });
          return route.fulfill({ json: { gameLog: [] } });
        }
        if (url.pathname === "/api/injuries")
          return route.fulfill({ json: { injuries: [] } });
        if (url.pathname === "/api/leaders")
          return route.fulfill({ json: { points: [] } });
        if (url.pathname === "/api/games")
          return route.fulfill({
            json: { date: url.searchParams.get("date"), games: [] },
          });
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic unavailable lineup" },
        });
      });
      await page.route("**/portraits/**", (route) => {
        requestedOptimized.push(route.request().url());
        return scenario === "optimized"
          ? route.continue()
          : route.fulfill({ status: 404, body: "Missing optimized fixture" });
      });
      await page.route(
        (url) => url.protocol === "https:",
        (route) => {
          if (route.request().url() === original) {
            originalRequests++;
            return scenario === "initials-fallback"
              ? route.fulfill({ status: 404, body: "Missing original fixture" })
              : route.fulfill({
                  contentType: "image/png",
                  body: transparentPNG,
                });
          }
          return route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
          });
        },
      );
      await page.goto(process.env.NHL_TEST_BASE_URL || local.url);
      await page
        .waitForFunction(() => !loading && seasonPlayers.size === 1)
        .catch(async (error) => {
          console.error({
            scenario,
            errors,
            state: await page.evaluate(() => ({
              loading: typeof loading === "undefined" ? null : loading,
              title: document.title,
              header: document.querySelector("#header-top-scorer")?.textContent,
              status: document.querySelector("#data-status")?.textContent,
              seasonSize:
                typeof seasonPlayers === "undefined"
                  ? null
                  : seasonPlayers.size,
            })),
          });
          throw error;
        });
      const portrait = page
        .locator('.player-card[data-player="8478402"] .portrait')
        .first();
      await portrait.scrollIntoViewIfNeeded();
      if (scenario === "optimized") {
        const img = portrait.locator("img");
        await img.evaluate((image) => image.decode());
        assert.match(await img.getAttribute("srcset"), /128w, .*256w$/);
        assert.equal(await img.getAttribute("data-original-source"), original);
        assert.match(
          await img.evaluate((image) => image.currentSrc),
          /\/portraits\/[a-f0-9]{12}\/20262027-EDM-8478402-(128|256)\.webp$/,
        );
        assert.equal(
          await img.evaluate((image) => {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, 1, 1).data[3];
          }),
          0,
          "Transparent corner survives the real WebP conversion",
        );
        assert.equal(
          originalRequests,
          0,
          "Successful optimized images never download original PNGs",
        );
      } else if (scenario === "original-fallback") {
        const img = portrait.locator("img");
        await page
          .waitForFunction(
            (source) =>
              [...document.querySelectorAll(".portrait img")].some(
                (image) =>
                  image.src === source &&
                  image.complete &&
                  image.naturalWidth > 0,
              ),
            original,
            { timeout: 5000 },
          )
          .catch(async (error) => {
            console.error(
              JSON.stringify(
                {
                  scenario,
                  originalRequests,
                  requestedOptimized,
                  observedImages,
                  images: await page
                    .locator(".portrait")
                    .evaluateAll((nodes) =>
                      nodes.map((x) => ({
                        html: x.outerHTML,
                        img: x.querySelector("img") && {
                          complete: x.querySelector("img").complete,
                          naturalWidth: x.querySelector("img").naturalWidth,
                        },
                      })),
                    ),
                },
                null,
                2,
              ),
            );
            throw error;
          });
        assert.equal(await img.getAttribute("src"), original);
        assert.equal(await img.getAttribute("srcset"), null);
        assert.equal(await img.getAttribute("sizes"), null);
        const before = originalRequests;
        await page.evaluate(() => {
          render();
          render();
        });
        await page.waitForTimeout(100);
        assert.equal(
          originalRequests,
          before,
          "Normal rerenders do not retry an already successful original",
        );
      } else {
        await portrait.locator(".portrait-fallback:not([hidden])").waitFor();
        assert.equal(
          await portrait.locator(".portrait-fallback").innerText(),
          "CM",
        );
        assert.equal(await portrait.locator("img").count(), 0);
        const before = originalRequests;
        await page.evaluate(() => {
          render();
          render();
        });
        await page.waitForTimeout(100);
        assert.equal(
          originalRequests,
          before,
          "Known failed originals do not enter an image retry loop",
        );
      }
      assert.ok(requestedOptimized.length >= 1);
      if (scenario !== "optimized") {
        assert.ok(
          originalRequests >= 1 && originalRequests <= 2,
          "Original is retried at most once per header/card image",
        );
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS: real responsive WebP portraits retain alpha, optimized failure retries the original once, double failure shows initials without retry loops.",
    );
  } finally {
    await browser.close();
    if (local) await new Promise((resolve) => local.server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
