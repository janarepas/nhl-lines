// Browser regression using synthetic source HTML; not a live-source validation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const roster = { forwards: [], defensemen: [], goalies: [] };
let i = 0;
for (const [key, number, position] of [
  ["forwards", 15, "C"],
  ["defensemen", 6, "D"],
  ["goalies", 2, "G"],
]) {
  for (let k = 0; k < number; k++, i++)
    roster[key].push({
      id: 8470000 + i,
      firstName: { default: i === 14 ? "Brayden" : "Player" },
      lastName: { default: i === 14 ? "Point" : "Surname" + i },
      sweaterNumber: i + 1,
      positionCode: position,
      shootsCatches: i % 2 ? "R" : "L",
      birthCountry: ["CAN", "USA", "FIN"][i % 3],
    });
}
const all = [...roster.forwards, ...roster.defensemen, ...roster.goalies];
const link = (id) => {
  const p = all[id],
    name = p.firstName.default + " " + p.lastName.default,
    slug = name.toLowerCase().replaceAll(" ", "-");
  return `<a href="/players/${slug}/123"><img alt="${name}"></a><a href="/players/${slug}/123">${name}</a>`;
};
const section = (title, ids) => `<h2>${title}</h2>${ids.map(link).join("")}`;
const source =
  '<title>Tampa Bay Lightning Line Combinations</title><time itemprop="dateModified" datetime="2026-10-18T10:00:00Z">Updated</time>' +
  section("Forwards", [0, 14, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) +
  section("Defensive Pairings", [15, 16, 17, 18, 19, 20]) +
  section("1st Powerplay Unit", [0, 14, 1, 15, 16]) +
  section("2nd Powerplay Unit", [2, 3, 4, 17, 18]) +
  section("1st Penalty Kill Unit", [14, 2, 15, 16]) +
  section("2nd Penalty Kill Unit", [3, 4, 17, 18]) +
  section("Goalies", [21, 22]);
const published = {
  source: "dailyfaceoff.com",
  updated_at: new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC",
  teams: {
    "tampa-bay-lightning": {
      forwards: [
        [0, 14, 1],
        [2, 3, 4],
        [5, 6, 7],
        [8, 9, 10],
      ],
      defense: [
        [15, 16],
        [17, 18],
        [19, 20],
      ],
      goalies: [[21], [22]],
      pp1: [0, 14, 1, 15, 16],
      pp2: [2, 3, 4, 17, 18],
      pk1: [14, 2, 15, 16],
      pk2: [3, 4, 17, 18],
    },
  },
};
for (const [key, value] of Object.entries(
  published.teams["tampa-bay-lightning"],
)) {
  const name = (i) => all[i].firstName.default + " " + all[i].lastName.default;
  published.teams["tampa-bay-lightning"][key] = Array.isArray(value[0])
    ? value.map((row) => row.map(name))
    : value.map(name);
}
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  // Source and tooltip assertions use reduced motion; motion has its own browser suite.
  const page = await b.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failure = false;
  let connectionFailure = false,
    publicFeedReads = 0;
  const forbiddenRequests = [];
  page.on("request", (request) => {
    if (/api\/shifts|club-schedule-season|gamecenter/.test(request.url()))
      forbiddenRequests.push(request.url());
  });
  await page.addInitScript(() =>
    localStorage.setItem("blueline-v2", JSON.stringify({ team: "TBL" })),
  );
  const statRequests = [];
  let scorerLimit = 3;
  await page.route("**/api/nhl?*", (r) => {
    const path = new URL(r.request().url()).searchParams.get("path");
    if (path.startsWith("roster")) return r.fulfill({ json: roster });
    if (path.startsWith("club-stats"))
      return r.fulfill({
        json: {
          season: "20262027",
          gameType: 2,
          skaters: [0, 14, 1].slice(0, scorerLimit).map((i) => ({
            playerId: all[i].id,
            firstName: all[i].firstName,
            lastName: all[i].lastName,
            gamesPlayed: 8,
            goals: 3,
            assists: 9,
            points: 12,
            plusMinus: 2,
            shots: 21,
          })),
        },
      });

    const id = Number(path.split("/")[1]);
    statRequests.push(id);
    const gameDate = new Date().toISOString().slice(0, 10);
    const gameLog =
      id >= 8470021
        ? [
            {
              gameDate,
              shotsAgainst: 30,
              goalsAgainst: 2,
              toi: "60:00",
              decision: "W",
            },
            {
              gameDate,
              shotsAgainst: 20,
              goalsAgainst: 1,
              toi: "30:00",
              decision: "O",
            },
            {
              gameDate,
              shotsAgainst: 50,
              goalsAgainst: 3,
              toi: "90:00",
              decision: "L",
            },
          ].map((g) =>
            id === 8470022
              ? {
                  ...g,
                  shotsAgainst: 30,
                  goalsAgainst: 4,
                  toi: "60:00",
                  decision: "L",
                }
              : g,
          )
        : [0, 1, 2].map((_, i) => ({
            gameDate,
            goals: id === 8470000 ? 1 : id === 8470014 ? 0 : i === 0 ? 1 : 0,
            assists: 0,
          }));
    return r.fulfill({ json: { gameLog } });
  });
  const pkSource =
    '<h1>NHL Penalty Kill Depth Charts</h1><div class="depth-charts__block"><a class="depth-charts__team"><img alt="TBL"></a>' +
    [
      [14, 3],
      [2, 4],
      [15, 17],
      [16, 18],
    ]
      .map(
        (ids, i) =>
          `<div class="depth-charts__pos"><div class="depth-charts__pos-head">${i < 2 ? "Forward" : "Defenseman"}</div><ul class="depth-charts__pos-list">${ids.map((id) => `<li><a><span class="hide-until-xs">${all[id].firstName.default}</span><span class="hide-xs-up">X.</span> ${all[id].lastName.default}</a></li>`).join("")}</ul></div>`,
      )
      .join("") +
    "</div>";
  await page.route("**/api/penalty-kill", (r) =>
    r.fulfill({ body: pkSource, contentType: "text/plain" }),
  );
  await page.route("**/api/lineups", (r) =>
    r.fulfill(
      failure
        ? {
            status: 502,
            headers: connectionFailure
              ? { "X-Line-Error": "feed-connection" }
              : {},
            body: "Daily Faceoff line combinations are unavailable: source 403 denied server-side access.",
          }
        : { json: published },
    ),
  );
  await page.route(
    "https://raw.githubusercontent.com/hg913488/nhl-line-combos-app/main/data/lines.json",
    (r) => {
      publicFeedReads++;
      return r.fulfill({
        json: published,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    },
  );
  await page.route("**/api/injuries", (r) =>
    r.fulfill({
      json: {
        injuries: [
          {
            displayName: "Tampa Bay Lightning",
            injuries: [
              {
                athlete: { displayName: "Brayden Point" },
                status: "Out",
                details: {
                  type: "Knee",
                  returnDate: new Date(Date.now() + 4 * 86400000)
                    .toISOString()
                    .slice(0, 10),
                },
              },
              {
                athlete: { displayName: "Player Surname0" },
                status: "Day-To-Day",
                details: { type: "Upper Body" },
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/api/leaders", (r) =>
    r.fulfill({
      json: {
        points: [
          { id: 8478402, value: 23, teamAbbrev: "EDM" },
          { id: 8470014, value: 12, teamAbbrev: "TBL" },
          { id: 8470000, value: 12, teamAbbrev: "TBL" },
          { id: 8470001, value: 8, teamAbbrev: "TBL" },
        ],
      },
    }),
  );
  await page.route("https://assets.nhle.com/**", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.goto(process.env.NHL_TEST_BASE_URL || "http://127.0.0.1:3000");
  await page.waitForSelector("#forward-lines .player-card");
  assert.equal(await page.locator("#forward-lines .player-card").count(), 12);
  assert.match(
    await page.locator("#forward-lines .player-card").nth(1).innerText(),
    /Point/,
  );
  await page.waitForSelector(
    '#forward-lines [data-player="8470014"] .top-mark',
  );
  assert.equal(
    await page
      .locator('#forward-lines [data-player="8470000"] .top-mark')
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator('#forward-lines [data-player="8470001"] .top-mark')
      .count(),
    1,
  );
  assert.match(
    await page
      .locator('#forward-lines [data-player="8470014"] .top-mark')
      .getAttribute("title"),
    /Tampa Bay Lightning.*12 points/,
  );
  await page.waitForFunction(() => !loading && pendingForms.size === 0);
  assert.deepEqual(
    statRequests.slice(0, 2),
    [8470021, 8470022],
    "Goalies load before skaters",
  );
  const requestsBeforeRestore = statRequests.length;
  const warmRestore = await page.evaluate(async () => {
    gameCache.clear();
    const start = performance.now();
    await loadForms(loadToken, controller.signal);
    return { elapsed: performance.now() - start, count: gameCache.size };
  });
  assert.equal(
    statRequests.length,
    requestsBeforeRestore,
    "Restoring daily statistics makes no HTTP requests",
  );
  assert.ok(
    warmRestore.count >= 20,
    "Restore all cached player statistics together",
  );
  assert.ok(
    warmRestore.elapsed < 750,
    "Cached statistics bypass the throttled network queue: " +
      warmRestore.elapsed,
  );
  assert.match(await page.locator("#goalie-lines").innerText(), /94.0% SV/);
  assert.match(await page.locator("#goalie-lines").innerText(), /2.00 GAA/);
  assert.equal(
    await page
      .locator(
        '#goalie-lines [data-player="8470021"] .form-badge [data-icon="flame"]',
      )
      .count(),
    1,
  );
  assert.equal(
    await page
      .locator(
        '#goalie-lines [data-player="8470022"] .form-badge [data-icon="ice"]',
      )
      .count(),
    1,
  );
  await page
    .locator('#goalie-lines [data-player="8470022"] .form-badge')
    .hover();
  assert.match(await page.locator("#form-tooltip").innerText(), /93%.*89%/);
  await page.mouse.move(1, 1);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.scrollTo({ top: 0, behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );

  assert.match(
    await page
      .locator('#forward-lines [data-player="8470000"] .portrait-hand')
      .getAttribute("aria-label"),
    /Left shot/,
  );
  assert.match(
    await page
      .locator('#forward-lines [data-player="8470001"] .portrait-hand')
      .getAttribute("aria-label"),
    /Right shot/,
  );
  assert.match(
    await page
      .locator('#goalie-lines [data-player="8470021"] .goalie-glove.hand-r')
      .getAttribute("aria-label"),
    /Full right stance · Right catching hand/,
  );
  assert.match(
    await page
      .locator('#defense-lines [data-player="8470015"] .player-meta')
      .innerText(),
    /LD/,
  );
  assert.match(
    await page
      .locator('#defense-lines [data-player="8470016"] .player-meta')
      .innerText(),
    /RD/,
  );
  assert.match(
    await page
      .locator('#defense-lines [data-player="8470015"] .portrait-hand')
      .getAttribute("aria-label"),
    /Right shot/,
  );
  assert.match(
    await page
      .locator('#defense-lines [data-player="8470016"] .portrait-hand')
      .getAttribute("aria-label"),
    /Left shot/,
  );
  assert.equal(await page.locator("#form-guide").count(), 0);
  assert.equal(await page.locator("#form-tooltip").isVisible(), false);
  for (const [id, explanation] of [
    [8470000, /3 consecutive/],
    [8470014, /last 3 games played/],
  ]) {
    const icon = page.locator(
      `#forward-lines [data-player="${id}"] .form-icon`,
    );
    await icon.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await icon.hover();
    assert.equal(await page.locator("#form-tooltip").isVisible(), true);
    assert.match(await page.locator("#form-tooltip").innerText(), explanation);
    const label = page.locator(
      `#forward-lines [data-player="${id}"] .form-badge`,
    );
    const labelBox = await label.boundingBox();
    await label.hover({
      position: { x: labelBox.width - 3, y: labelBox.height / 2 },
    });
    assert.equal(
      await page.locator("#form-tooltip").isVisible(),
      true,
      "Help remains visible over label text",
    );
    assert.match(await page.locator("#form-tooltip").innerText(), explanation);
    await page.mouse.move(1, 1);
    assert.equal(await page.locator("#form-tooltip").isVisible(), false);
  }
  await page
    .locator('#forward-lines [data-player="8470000"] .form-badge')
    .click();
  assert.equal(
    await page.locator("#player-dialog").isVisible(),
    false,
    "Icon help must not open player dialog",
  );
  await page.keyboard.press("Escape");
  assert.ok(
    await page
      .locator("body")
      .evaluate((el) => el.getBoundingClientRect().width <= 1200),
    "Page width is capped at 1200px",
  );
  assert.equal(
    await page
      .locator(".header-scorer-player .portrait")
      .first()
      .evaluate((el) => {
        const probe = document.createElement("img");
        el.append(probe);
        const fit = getComputedStyle(probe).objectFit;
        probe.remove();
        return fit;
      }),
    "contain",
    "Featured headshots fit without cropping the head",
  );
  const repeatedRosterRequests = [];
  const trackRoster = (request) => {
    if (
      request.url().includes("/api/nhl?") &&
      decodeURIComponent(request.url()).includes("roster/TBL/current")
    )
      repeatedRosterRequests.push(request.url());
  };
  page.on("request", trackRoster);
  await page.evaluate(async () => {
    await getNhl("roster/TBL/current", new AbortController().signal);
    await getNhl("roster/TBL/current", new AbortController().signal);
  });
  page.off("request", trackRoster);
  assert.equal(
    repeatedRosterRequests.length,
    0,
    "Repeated player-data reads use the daily cache without HTTP requests",
  );
  const archivePhoto = await page.evaluate(() => {
    const current = "https://assets.nhle.com/mugs/nhl/20262027/EDM/8480842.png";
    const render = (id, image) =>
      new DOMParser().parseFromString(
        photo({
          id,
          image,
          name: "Filip Hallander",
          first: "Filip",
          last: "Hallander",
        }),
        "text/html",
      );
    const own = render(8480842, current);
    return {
      source: own.querySelector("img").getAttribute("src"),
      label: own.querySelector(".portrait").title,
      unrelated: render(1234567, current)
        .querySelector("img")
        .getAttribute("src"),
      newSeason: render(
        8480842,
        "https://assets.nhle.com/mugs/nhl/20272028/EDM/8480842.png",
      )
        .querySelector("img")
        .getAttribute("src"),
    };
  });
  assert.equal(
    archivePhoto.source,
    "https://assets.nhle.com/mugs/nhl/20222023/PIT/8480842.png",
  );
  assert.match(archivePhoto.label, /archive.*2022\/23.*Pittsburgh/);
  assert.equal(
    archivePhoto.unrelated,
    "https://assets.nhle.com/mugs/nhl/20262027/EDM/8480842.png",
  );
  assert.equal(
    archivePhoto.newSeason,
    "https://assets.nhle.com/mugs/nhl/20272028/EDM/8480842.png",
  );
  assert.equal(
    await page
      .locator('#forward-lines [data-player="8470000"] .player-flag')
      .innerText(),
    "🇨🇦",
  );
  assert.equal(
    await page
      .locator('#forward-lines [data-player="8470000"] .player-flag')
      .getAttribute("aria-label"),
    "Country of birth: Canada",
  );
  assert.equal(
    await page.evaluate(() => countryFlag({ birthCountry: "UNKNOWN" })),
    "",
  );
  assert.equal(await page.evaluate(() => countryFlag({})), "");
  const circle = await page
    .locator("#forward-lines .portrait")
    .first()
    .evaluate((el) => ({
      radius: getComputedStyle(el).borderRadius,
      border: getComputedStyle(el).borderWidth,
      color: getComputedStyle(el).borderColor,
    }));
  assert.deepEqual(circle, {
    radius: "50%",
    border: "1px",
    color: "rgb(232, 232, 237)",
  });
  assert.equal(await page.locator(".team-header #data-status").count(), 1);
  assert.ok(
    (await page.locator(".topbar.unified-header").boundingBox()).height < 260,
    "Compact header stays the same height with tied scoring leaders",
  );
  assert.equal(
    await page
      .locator(".header-scorer-player .portrait")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width),
    112,
  );
  assert.ok(
    await page.evaluate(() => {
      const header = document
        .querySelector(".topbar.unified-header")
        .getBoundingClientRect();
      const body = document.body.getBoundingClientRect();
      const brand = document.querySelector(".brand").getBoundingClientRect();
      return (
        Math.abs(header.left - body.left) < 1 &&
        header.width <= 1200 &&
        Math.abs(brand.left + brand.width / 2 - (body.left + body.width / 2)) <
          1
      );
    }),
    "Header shares the centered page bounds and branding is symmetric",
  );
  const featureLayout = await page.evaluate(() => {
    const portrait = document
      .querySelector(".header-scorer-player .portrait")
      .getBoundingClientRect();
    const divider = document
      .querySelector(".topbar.unified-header")
      .getBoundingClientRect();
    const name = document
      .querySelector(".header-scorer-name")
      .getBoundingClientRect();
    const caption = document
      .querySelector(".header-scorer-caption")
      .getBoundingClientRect();
    return {
      gap: divider.bottom - 1 - portrait.bottom,
      labelBelow: caption.top >= name.bottom,
      controlsInline: (() => {
        const controls = document
          .querySelector(".line-mode-navigation")
          .getBoundingClientRect();
        const heading = document
          .querySelector("#forwards > .section-head")
          .getBoundingClientRect();
        const title = document
          .querySelector("#forwards > .section-head > div")
          .getBoundingClientRect();
        const totals = document
          .querySelector("#forwards .overview")
          .getBoundingClientRect();
        return (
          controls.top >= heading.top &&
          controls.bottom <= heading.bottom &&
          title.right <= controls.left &&
          controls.right <= totals.left
        );
      })(),
    };
  });
  assert.ok(
    Math.abs(featureLayout.gap) <= 1,
    "Portrait meets divider without a gap",
  );
  assert.ok(featureLayout.labelBelow);
  assert.ok(
    featureLayout.controlsInline,
    "Heading, controls and totals share one row without overlap",
  );
  assert.ok(
    await page
      .locator(".ui-emoji[data-icon]")
      .evaluateAll(
        (icons) =>
          icons.length > 10 &&
          icons.every(
            (icon) =>
              icon.textContent.trim().length > 0 &&
              icon.getAttribute("aria-hidden") === "true",
          ),
      ),
    "Player markers use native emoji with accessible labels on their parents",
  );
  assert.ok(
    await page
      .locator("#forwards-heading")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 32),
    "Larger display heading",
  );
  assert.ok(
    await page
      .locator("#forward-lines .last-name")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 30),
    "Prominent surname typography",
  );
  assert.equal(
    await page
      .locator(
        '#goalie-lines [data-player="8470021"] .goalie-glove svg[data-icon="catcher"]',
      )
      .count(),
    1,
    "Catcher graphic does not depend on emoji font support",
  );
  const injured = page.locator('#forward-lines [data-player="8470014"]');
  assert.equal(
    await injured.locator('.injury-icon [data-icon="bandage"]').count(),
    1,
  );
  assert.match(
    await injured.locator(".injury-icon").getAttribute("data-form-help"),
    /Knee injury.*approx\./,
  );
  assert.equal(await injured.locator(".player-copy .injury-icon").count(), 0);
  assert.equal(
    await injured.locator(".portrait-status .status-icon").count(),
    2,
  );
  await injured.locator(".injury-icon").hover();
  assert.match(
    await page.locator("#form-tooltip").innerText(),
    /Knee injury.*approx\./,
  );
  await injured.locator(".injury-icon").click();
  assert.equal(await page.locator("#player-dialog").isVisible(), false);
  await page.keyboard.press("Escape");
  assert.match(
    await page
      .locator('#forward-lines [data-player="8470000"] .injury-icon')
      .getAttribute("data-form-help"),
    /return unknown/,
  );
  assert.equal(
    await page
      .locator('#forward-lines [data-player="8470001"] .status-icon')
      .count(),
    0,
  );
  assert.equal(await page.locator(".form-badge.normal").count(), 0);
  assert.equal(await page.locator(".player-copy .form-badge").count(), 0);
  await page.locator('#forward-lines [data-player="8470001"]').click();
  assert.equal(await page.locator("#player-dialog").isVisible(), true);
  assert.equal(await page.locator("#edit-player").count(), 0);
  assert.equal(await page.locator("#edit-form").count(), 0);
  await page.locator("#close-dialog").click();
  await page.waitForSelector(".header-scorer-name");
  assert.equal(await page.locator(".header-scorer-name").count(), 1);
  assert.equal(await page.locator("#refresh").count(), 0);
  assert.equal(await page.locator(".team-meta").isVisible(), false);
  const scorerHeight = (
    await page.locator(".topbar.unified-header").boundingBox()
  ).height;
  assert.equal(await page.locator(".scorer-pagination").count(), 0);
  await page.locator(".brand").hover();
  const firstScorer = await page.locator(".header-scorer-name").innerText();
  await page.waitForFunction(
    (name) =>
      document.querySelector(".header-scorer-name").textContent !== name,
    firstScorer,
    { timeout: 7000 },
  );
  assert.equal(
    (await page.locator(".topbar.unified-header").boundingBox()).height,
    scorerHeight,
  );
  await page.evaluate(() => {
    headerScorerIndex = 0;
    renderHeaderScorer();
  });

  assert.equal(
    await page
      .locator(".header-scorer-stats")
      .first()
      .locator("dd")
      .allTextContents()
      .then((values) => values.join(",")),
    "8,3,9,12,+2,21",
  );
  assert.equal(await page.locator("#team-menu summary #team-title").count(), 1);
  const navigation = await page.evaluate(() => {
    const rect = (selector) =>
      document.querySelector(selector).getBoundingClientRect();
    const prev = rect("#previous-team"),
      title = rect("#team-menu"),
      next = rect("#next-team"),
      logo = rect(".brand");
    return {
      brackets: prev.right <= title.left && next.left >= title.right,
      centered: Math.abs(logo.x + logo.width / 2 - innerWidth / 2) < 1,
      brand: document.querySelector(".brand").textContent.trim(),
    };
  });
  assert.ok(navigation.brackets);
  assert.ok(navigation.centered);
  assert.equal(
    navigation.brand.replace(/\s+/g, ""),
    "LineCombosLessnoise.Morehockey.",
  );

  const crest = await page.locator("#team-logo").evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    border: getComputedStyle(el).borderWidth,
    background: getComputedStyle(el).backgroundColor,
  }));
  assert.deepEqual(crest, {
    width: 48,
    border: "0px",
    background: "rgba(0, 0, 0, 0)",
  });
  assert.deepEqual(
    await page.locator(".goalie-slot > small").allTextContents(),
    ["Starter", "Backup"],
  );
  const flat = await page
    .locator("#forward-lines .player-card")
    .first()
    .evaluate((el) => ({
      border: getComputedStyle(el).borderWidth,
      background: getComputedStyle(el).backgroundColor,
      shadow: getComputedStyle(el).boxShadow,
    }));
  assert.deepEqual(flat, {
    border: "0px",
    background: "rgba(0, 0, 0, 0)",
    shadow: "none",
  });
  assert.equal(await page.locator("#defense-lines .player-card").count(), 6);
  assert.equal(await page.locator("#goalie-lines .player-card").count(), 2);
  await page.click("#tab-pp");
  assert.equal(await page.locator("#special-lines .player-card").count(), 10);
  const umbrella = page.locator(".pp-unit").first();
  assert.equal(await umbrella.locator(".pp-position").count(), 5);
  assert.equal(
    await umbrella.locator('.pp-point [data-player="8470015"]').count(),
    1,
  );
  const pointBox = await umbrella.locator(".pp-point").boundingBox();
  for (const position of [
    "front-left",
    "front-right",
    "wing-left",
    "wing-right",
  ]) {
    const other = await umbrella.locator(".pp-" + position).boundingBox();
    assert.ok(pointBox.y > other.y, "Defender at rear of umbrella");
  }
  const cases = await page.evaluate(() => {
    const ids = [8470000, 8470014, 8470001, 8470015, 8470016];
    const before = JSON.stringify(ids),
      slots = powerPlaySlots(ids);
    const noD = powerPlaySlots([8470000, 8470014, 8470001]);
    return {
      unchanged: JSON.stringify(ids) === before,
      point: slots.at(-1).id,
      defender: slots.at(-1).defender,
      ids: slots.map((s) => s.id).sort(),
      noD: noD.at(-1).defender,
    };
  });
  assert.ok(cases.unchanged);
  assert.equal(cases.point, 8470015);
  assert.equal(cases.defender, true);
  assert.equal(cases.noD, false);
  assert.deepEqual(
    cases.ids,
    [8470000, 8470014, 8470001, 8470015, 8470016].sort(),
  );

  assert.equal(await page.locator("#even-panel").isVisible(), false);
  assert.match(
    await page.locator("#special-lines .player-card").nth(1).innerText(),
    /Point/,
  );
  await page.click("#tab-pk");
  assert.equal(await page.locator("#special-lines .player-card").count(), 8);
  await page.click("#next-mode");
  assert.equal(
    await page.locator("#tab-even").getAttribute("aria-selected"),
    "true",
  );
  await page.click("#previous-mode");
  assert.equal(
    await page.locator("#tab-pk").getAttribute("aria-selected"),
    "true",
  );
  await page.click("#previous-mode");
  assert.equal(
    await page.locator("#tab-pp").getAttribute("aria-selected"),
    "true",
  );
  await page.click("#tab-pk");
  assert.equal(await page.locator(".pk-box").count(), 2);
  const boxCards = await page
    .locator(".pk-box")
    .first()
    .locator(".player-card")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y };
      }),
    );
  assert.ok(Math.abs(boxCards[0].y - boxCards[1].y) < 2);
  assert.ok(Math.abs(boxCards[2].y - boxCards[3].y) < 2);
  assert.ok(boxCards[2].y > boxCards[0].y);
  assert.ok(boxCards[1].x > boxCards[0].x);
  await page.keyboard.press("Home");
  assert.equal(await page.locator("#even-panel").isVisible(), true);
  assert.equal(await page.locator("#reset").count(), 0);
  assert.equal(await page.locator("#swap-player").count(), 0);
  for (const width of [320, 390, 768, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.click("#tab-even");
    const titleStyle = await page.locator("#team-title").evaluate((el) => ({
      nowrap: getComputedStyle(el).whiteSpace,
      height: el.getBoundingClientRect().height,
      font: parseFloat(getComputedStyle(el).fontSize),
    }));
    assert.equal(titleStyle.nowrap, "nowrap");
    assert.ok(
      titleStyle.height < titleStyle.font * 1.4,
      "Team name stays on one line",
    );
    const portraitSizes = await page.evaluate(() => {
      const forward = document
        .querySelector("#forward-lines .portrait")
        .getBoundingClientRect();
      const defense = document
        .querySelector("#defense-lines .portrait")
        .getBoundingClientRect();
      const card = document
        .querySelector("#defense-lines .player-card")
        .getBoundingClientRect();
      return {
        fw: forward.width,
        fh: forward.height,
        dw: defense.width,
        horizontal:
          defense.right <=
          document
            .querySelector("#defense-lines .player-copy")
            .getBoundingClientRect().left,
        dh: defense.height,
        center: Math.abs(
          defense.left + defense.width / 2 - card.left - card.width / 2,
        ),
      };
    });
    assert.ok(
      Math.abs(portraitSizes.fw - portraitSizes.dw) < 1,
      "Equal forward/defense portrait widths at " + width,
    );
    assert.ok(
      Math.abs(portraitSizes.fh - portraitSizes.dh) < 1,
      "Equal forward/defense portrait heights at " + width,
    );
    if (width > 780)
      assert.ok(
        portraitSizes.horizontal,
        "Defense portrait sits beside details",
      );
    else
      assert.ok(portraitSizes.center < 1, "Centered mobile defense portrait");
    const defenseBounds = await page.locator("#defense").boundingBox();
    const goalieBounds = await page.locator("#goalies").boundingBox();
    assert.ok(
      goalieBounds.y >= defenseBounds.y + defenseBounds.height,
      "Goalies follow defense without overlapping",
    );
    if (width <= 980) {
      const portrait = await page
        .locator(".header-scorer-player .portrait")
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            border: s.borderTopWidth,
            radius: s.borderRadius,
            background: s.backgroundColor,
            width: el.getBoundingClientRect().width,
          };
        });
      assert.deepEqual(portrait, {
        border: "0px",
        radius: "0px",
        background: "rgba(0, 0, 0, 0)",
        width: width <= 580 ? 140 : 112,
      });
    }
    assert.ok(
      await page.locator("#extras-list .portrait").evaluateAll(
        (els) =>
          els.length > 0 &&
          els.every((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width >= 90 && rect.height >= 90;
          }),
      ),
      "Additional roster portraits have visible dimensions at " + width,
    );
    if (width > 580 && width <= 980) {
      assert.ok(
        await page.evaluate(() => {
          const team = document
            .querySelector(".team-identity")
            .getBoundingClientRect();
          const scorer = document
            .querySelector(".header-top-scorer")
            .getBoundingClientRect();
          return (
            team.right <= scorer.left &&
            Math.abs(
              team.top + team.height / 2 - scorer.top - scorer.height / 2,
            ) < 2
          );
        }),
        "Tablet team picker and scoring leader share one row",
      );
    }
    if (width <= 580) {
      assert.ok(
        await page.locator(".team-title-row").evaluate((el) => {
          const row = el.getBoundingClientRect();
          const header = document
            .querySelector(".team-header")
            .getBoundingClientRect();
          return (
            Math.abs(
              row.left + row.width / 2 - header.left - header.width / 2,
            ) < 2
          );
        }),
        "Mobile team picker is centered",
      );
    }
    await page.click("#tab-pp");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "overflow " + width,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: "/tmp/nhl-dfo-tabs.png", fullPage: false });
  // Start a new data snapshot for the following source-failure scenarios.
  await page.evaluate(() => DailyPlayerCache.clear());
  scorerLimit = 2;
  failure = true;
  connectionFailure = true;
  await page.evaluate(() => loadTeam());
  await page.waitForFunction(() =>
    document
      .querySelector("#line-source-status")
      .textContent.startsWith("Feed updated"),
  );
  await page.waitForTimeout(100);
  assert.equal(
    publicFeedReads,
    1,
    "Public CORS feed handles a hosting connection failure",
  );
  await page.waitForFunction(() => headerScorer?.players.length === 2);
  assert.equal(await page.locator(".header-scorer-player").count(), 1);
  assert.ok(
    (await page.locator(".topbar.unified-header").boundingBox()).height < 260,
  );
  connectionFailure = false;
  await page.evaluate(() => loadTeam());
  await page.waitForFunction(() =>
    document
      .querySelector("#line-source-status")
      .textContent.includes("Saved feed"),
  );
  assert.equal(await page.locator("#special-lines .player-card").count(), 10);
  await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem("blueline-v2"));
    cache.teams.TBL.lineData.type = "nhl-last-game";
    localStorage.setItem("blueline-v2", JSON.stringify(cache));
  });
  // Override initial team seeding on reload to retain a legacy inferred snapshot.
  await page.addInitScript(() => {
    const legacy = JSON.parse(sessionStorage.getItem("legacy-lines"));
    if (legacy) localStorage.setItem("blueline-v2", JSON.stringify(legacy));
  });
  await page.evaluate(() =>
    sessionStorage.setItem("legacy-lines", localStorage.getItem("blueline-v2")),
  );
  await page.reload();
  await page.waitForFunction(() =>
    document
      .querySelector("#line-source-status")
      .textContent.includes("unavailable"),
  );
  assert.equal(await page.locator("#forward-lines .player-card").count(), 0);
  assert.equal(await page.locator("#special-lines .player-card").count(), 0);
  const parser = await page.evaluate(
    ({ source, all }) => {
      const players = all.map((p) => ({
        id: p.id,
        name: p.firstName.default + " " + p.lastName.default,
        first: p.firstName.default,
        last: p.lastName.default,
        group:
          p.positionCode === "G" ? "G" : p.positionCode === "D" ? "D" : "F",
      }));
      const model = DfoLines.parse(
        source,
        players,
        "https://www.dailyfaceoff.com/teams/tampa-bay-lightning/line-combinations",
      );
      let rejected = false;
      try {
        DfoLines.parse(
          "<title>Just a moment...</title>",
          players,
          "https://www.dailyfaceoff.com",
        );
      } catch {
        rejected = true;
      }
      const missing = DfoLines.parse(
        source,
        players.filter((p) => p.id !== 8470014),
        "https://www.dailyfaceoff.com/teams/tampa-bay-lightning/line-combinations",
      );
      return {
        valid: DfoLines.valid(model),
        rejected,
        unmatched: missing.extra.some((p) => p.id === "dfo:brayden-point"),
        sourceDate: model.updated,
      };
    },
    { source, all },
  );
  assert.ok(parser.valid);
  assert.ok(parser.rejected);
  assert.ok(parser.unmatched);
  assert.equal(parser.sourceDate, "2026-10-18T10:00:00Z");
  // With no PK in the primary feed, read explicit RotoWire rows instead.
  failure = false;
  delete published.teams["tampa-bay-lightning"].pk1;
  delete published.teams["tampa-bay-lightning"].pk2;
  await page.evaluate(() => loadTeam());
  await page.click("#tab-pk");
  await page.waitForFunction(() =>
    document
      .querySelector(".pk-source-note")
      ?.textContent.includes("Retrieved:"),
  );
  assert.equal(await page.locator(".pk-box .player-card").count(), 8);
  assert.deepEqual(
    await page
      .locator(".pk-box")
      .first()
      .locator(".player-card")
      .evaluateAll((els) => els.map((el) => el.dataset.player)),
    ["8470014", "8470002", "8470015", "8470016"],
  );
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "PK box mobile overflow",
    );
  }
  const pkChecks = await page.evaluate(
    ({ html, all }) => {
      const roster = all.map((p) => ({
        id: p.id,
        name: p.firstName.default + " " + p.lastName.default,
        group: p.positionCode === "D" ? "D" : "F",
      }));
      const blocked = PenaltyKill.parse(
        '<h1>NHL Penalty Kill Depth Charts</h1><div class="depth-charts__block"><a class="depth-charts__team"><img alt="TBL"></a><div class="depth-charts__paywall-text">Subscribers only</div></div>',
        roster,
        "TBL",
      );
      let rejected = 0;
      for (const input of [
        "<h1>Error</h1>",
        html.replace("Defenseman", "Goalie"),
        html.replace("Surname15", "Unknown"),
        html.replace("Surname16", "Surname15"),
      ]) {
        try {
          PenaltyKill.parse(input, roster, "TBL");
        } catch {
          rejected++;
        }
      }
      return {
        restricted: blocked.restricted,
        units: blocked.units.length,
        rejected,
      };
    },
    { html: pkSource, all },
  );
  assert.deepEqual(pkChecks, { restricted: true, units: 0, rejected: 4 });
  assert.deepEqual(errors, []);
  assert.deepEqual(
    forbiddenRequests,
    [],
    "No inferred lineup endpoints requested",
  );
  await page.click("#previous-team");
  assert.equal(
    await page.locator("#team-title").innerText(),
    "St. Louis Blues",
  );
  assert.equal(
    await page
      .locator("#previous-team")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.click("#next-team");
  assert.equal(
    await page.locator("#team-title").innerText(),
    "Tampa Bay Lightning",
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator("#team-menu summary").click();
  await page.waitForFunction(() => {
    const r = document
      .querySelector("#team-menu .picker-content")
      .getBoundingClientRect();
    return (
      r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight
    );
  });
  await page.locator('[data-team="ANA"]').click();
  await page.click("#previous-team");
  assert.equal(await page.locator("#team-title").innerText(), "Winnipeg Jets");
  await page.click("#next-team");
  assert.equal(await page.locator("#team-title").innerText(), "Anaheim Ducks");
  const headerStyle = await page.locator(".unified-header").evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    texture: getComputedStyle(el, "::before").display,
  }));
  assert.deepEqual(headerStyle, {
    background: "rgb(255, 255, 255)",
    texture: "none",
  });
  await page.locator("#team-menu summary").click();
  await page.locator('[data-team="CBJ"]').click();
  await page.click("#tab-even");
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(
    await page.locator(".position-labels").first().innerText(),
    /Left Wing/,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => {
      const title = document.querySelector("#team-title");
      return (
        title.textContent === "Columbus Blue Jackets" &&
        title.scrollWidth <= title.clientWidth + 1
      );
    });
    const fit = await page.locator("#team-title").evaluate((el) => ({
      font: parseFloat(getComputedStyle(el).fontSize),
      height: el.getBoundingClientRect().height,
    }));
    assert.ok(fit.font >= 16, "Full team name remains readable at " + width);
    assert.ok(fit.height < fit.font * 1.4);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  assert.ok(
    (await page.locator(".position-labels").first().boundingBox()).height <= 26,
    "Compact position captions",
  );
  await page.evaluate(() => scrollTo({ top: 600, behavior: "instant" }));
  await page.waitForFunction(() =>
    document.body.classList.contains("page-scrolled"),
  );
  const glass = await page.locator(".scroll-glass").evaluate((el) => ({
    pointer: getComputedStyle(el).pointerEvents,
    blur: getComputedStyle(el).backdropFilter,
    opacity: getComputedStyle(el).opacity,
  }));
  assert.equal(glass.pointer, "none");
  assert.match(glass.blur, /blur/);
  assert.equal(glass.opacity, "1");
  await page.waitForFunction(() => !loading && pendingForms.size === 0);
  assert.equal(await page.locator(".picker-chevron").count(), 0);
  assert.equal(await page.locator(".section-help").count(), 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const summary = page.locator("#team-menu summary");
  await summary.scrollIntoViewIfNeeded();
  await summary.hover();
  assert.equal(
    await page.locator("#team-title").innerText(),
    "Columbus Blue Jackets",
  );
  assert.equal(await page.locator(".team-peek").count(), 0);
  await summary.click();
  assert.equal(await page.locator("#team-menu").getAttribute("open"), "");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page
        .locator(".picker-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "No horizontal picker scrolling at " + width,
    );
    assert.ok(
      await page.locator(".team-option").evaluateAll((options) =>
        options.every((el) => {
          const name = el.children[1];
          return (
            getComputedStyle(name).whiteSpace === "nowrap" &&
            name.scrollWidth <= name.clientWidth + 1
          );
        }),
      ),
      "Full team names fit on one line at " + width,
    );
  }
  await page.locator("#team-search").fill("Dallas");
  assert.equal(await page.locator(".team-option:visible").count(), 1);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#team-menu").getAttribute("open"), null);
  await page.locator(".brand").hover();
  const lastName = page.locator("#extras-list .last-name").first();
  await lastName.hover();
  await page.waitForFunction(() => {
    const el = document.querySelector("#extras-list .last-name");
    return (
      new DOMMatrixReadOnly(getComputedStyle(el, "::after").transform).m11 >
      0.99
    );
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await lastName.evaluate((el) => getComputedStyle(el).transform),
    "none",
  );
  await page.evaluate(() => DailyPlayerCache.clear());
  let rateCalls = 0;
  await page.route("**/api/nhl?*", (route) => {
    rateCalls++;
    return route.fulfill({
      status: 503,
      headers: { "X-Upstream-Status": "429", "Retry-After": "60" },
      json: { error: "Rate limited" },
    });
  });
  const limitResults = await page.evaluate(async () => {
    const results = [];
    for (let i = 0; i < 2; i++) {
      try {
        await getNhl("roster/CHI/current", new AbortController().signal);
      } catch (error) {
        results.push(error.rateLimited === true);
      }
    }
    clearTimeout(nhlRetryTimer);
    status();
    return results;
  });
  assert.deepEqual(limitResults, [true, true]);
  assert.equal(
    rateCalls,
    1,
    "Respect NHL cooldown instead of repeating requests",
  );
  assert.match(await page.locator("#data-status").textContent(), /rate limit/);
  console.log(
    "PASS: source order preserves Brayden Point beyond first 12 roster entries; 5v5, PP/PK and keyboard tabs; goalie/pair views; dated cached state; no generated lines on failure; schema rejection; unmatched player handling; mobile no overflow. Source HTML was a fixture, not a live DFO response.",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
