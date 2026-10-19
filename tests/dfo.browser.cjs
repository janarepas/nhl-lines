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
            body: "A Daily Faceoff aktuális sorai nem tölthetők le: a forrás 403-mal elutasítja a szerveroldali hozzáférést.",
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
    /Tampa Bay Lightning.*12 pont/,
  );
  await page.waitForFunction(() => !loading && pendingForms.size === 0);
  assert.deepEqual(
    statRequests.slice(0, 2),
    [8470021, 8470022],
    "Goalies load before skaters",
  );
  assert.match(await page.locator("#goalie-lines").innerText(), /94.0% SV/);
  assert.match(await page.locator("#goalie-lines").innerText(), /2.00 GAA/);
  assert.match(
    await page
      .locator('#goalie-lines [data-player="8470021"] .form-badge')
      .innerText(),
    /🔥\s+Hot streak/,
  );
  assert.match(
    await page
      .locator('#goalie-lines [data-player="8470022"] .form-badge')
      .innerText(),
    /🧊\s+Cold streak/,
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
      .locator('#forward-lines [data-player="8470000"] .player-handedness')
      .innerText(),
    /🏒\s+Left$/,
  );
  assert.match(
    await page
      .locator('#forward-lines [data-player="8470001"] .player-handedness')
      .innerText(),
    /🏒\s+Right$/,
  );
  assert.match(
    await page
      .locator('#goalie-lines [data-player="8470021"] .player-handedness')
      .innerText(),
    /🥅\s+Fordított · jobb fogókéz/,
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
      .locator('#defense-lines [data-player="8470015"] .player-handedness')
      .innerText(),
    /🏒\s+Right$/,
  );
  assert.match(
    await page
      .locator('#defense-lines [data-player="8470016"] .player-handedness')
      .innerText(),
    /🏒\s+Left$/,
  );
  assert.equal(await page.locator("#form-guide").count(), 0);
  assert.equal(await page.locator("#form-tooltip").isVisible(), false);
  for (const [id, explanation] of [
    [8470000, /3 egymást követő/],
    [8470014, /3 lejátszott/],
    [8470001, /nem teljesül/],
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
    border: "2px",
    color: "rgb(0, 40, 104)",
  });
  assert.equal(await page.locator(".team-header #data-status").count(), 1);
  assert.ok(
    (await page.locator(".team-header").boundingBox()).height < 260,
    "Compact header stays the same height with tied scoring leaders",
  );
  assert.equal(
    await page
      .locator(".header-scorer-player .portrait")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width),
    220,
  );
  const featureLayout = await page.evaluate(() => {
    const portrait = document
      .querySelector(".header-scorer-player .portrait")
      .getBoundingClientRect();
    const divider = document
      .querySelector(".team-meta")
      .getBoundingClientRect();
    const name = document
      .querySelector(".header-scorer-name")
      .getBoundingClientRect();
    const caption = document
      .querySelector(".header-scorer-caption")
      .getBoundingClientRect();
    return {
      gap: divider.top - portrait.bottom,
      labelBelow: caption.top >= name.bottom,
      tabsAbove:
        document.querySelector(".line-mode-navigation").getBoundingClientRect()
          .bottom <=
        document.querySelector(".overview").getBoundingClientRect().top,
    };
  });
  assert.ok(
    Math.abs(featureLayout.gap) <= 1,
    "Portrait meets divider without a gap",
  );
  assert.ok(featureLayout.labelBelow);
  assert.ok(featureLayout.tabsAbove);
  const injured = page.locator('#forward-lines [data-player="8470014"]');
  assert.match(await injured.locator(".player-injury").innerText(), /🩹/);
  assert.match(
    await injured.locator(".player-injury").innerText(),
    /Térdsérülés/,
  );
  assert.match(await injured.locator(".player-injury").innerText(), /kb\./);
  assert.equal(await injured.locator(".player-name .player-injury").count(), 0);
  assert.ok(
    (await injured.locator(".player-injury").boundingBox()).y >
      (await injured.locator(".player-handedness").boundingBox()).y,
  );
  assert.match(
    await page
      .locator('#forward-lines [data-player="8470000"] .player-injury')
      .innerText(),
    /visszatérés nem ismert/,
  );
  assert.equal(
    await page
      .locator('#forward-lines [data-player="8470001"] .player-injury')
      .count(),
    0,
  );
  await page.locator('#forward-lines [data-player="8470001"]').click();
  assert.equal(await page.locator("#player-dialog").isVisible(), true);
  assert.equal(await page.locator("#edit-player").count(), 0);
  assert.equal(await page.locator("#edit-form").count(), 0);
  await page.locator("#close-dialog").click();
  await page.waitForSelector(".header-scorer-name");
  assert.equal(await page.locator(".header-scorer-name").count(), 1);
  const scorerHeight = (await page.locator(".team-header").boundingBox())
    .height;
  assert.match(await page.locator(".scorer-pagination").innerText(), /1 \/ 3/);
  await page.locator('[data-scorer-step="1"]').click();
  assert.match(
    await page.locator("#header-top-scorer").innerText(),
    /Brayden Point/,
  );
  assert.match(
    await page.locator("#header-top-scorer").innerText(),
    /2026\/27/,
  );
  await page.locator('[data-scorer-step="1"]').click();
  assert.match(
    await page.locator(".header-scorer-name").innerText(),
    /Surname1/,
  );
  assert.match(await page.locator(".scorer-pagination").innerText(), /3 \/ 3/);
  assert.equal(
    (await page.locator(".team-header").boundingBox()).height,
    scorerHeight,
  );
  await page.locator('[data-scorer-step="1"]').click();
  assert.match(
    await page.locator(".header-scorer-name").innerText(),
    /Surname0/,
  );
  await page.locator('[data-scorer-step="-1"]').click();
  assert.match(
    await page.locator(".header-scorer-name").innerText(),
    /Surname1/,
  );
  await page.locator('[data-scorer-step="1"]').click();

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
      logo = rect(".brand > img");
    return {
      brackets: prev.right <= title.left && next.left >= title.right,
      centered: Math.abs(logo.x + logo.width / 2 - innerWidth / 2) < 1,
      brand: document.querySelector(".brand").textContent.trim(),
    };
  });
  assert.ok(navigation.brackets);
  assert.ok(navigation.centered);
  assert.equal(navigation.brand.replace(/\s+/g, ""), "LineCombos");

  const crest = await page.locator("#team-logo").evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    border: getComputedStyle(el).borderWidth,
    background: getComputedStyle(el).backgroundColor,
  }));
  assert.deepEqual(crest, {
    width: 100,
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
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.click("#tab-even");
    const defenseBounds = await page.locator("#defense").boundingBox();
    const goalieBounds = await page.locator("#goalies").boundingBox();
    assert.ok(
      goalieBounds.y >= defenseBounds.y + defenseBounds.height,
      "Goalies follow defense without overlapping",
    );
    if (width <= 780) {
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
        width: 160,
      });
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
  scorerLimit = 2;
  failure = true;
  connectionFailure = true;
  await page.click("#refresh");
  await page.waitForFunction(() =>
    document
      .querySelector("#line-source-status")
      .textContent.startsWith("Feed frissítése"),
  );
  await page.waitForTimeout(100);
  assert.equal(
    publicFeedReads,
    1,
    "Public CORS feed handles a hosting connection failure",
  );
  await page.waitForFunction(() =>
    document.querySelector(".scorer-pagination")?.textContent.includes("1 / 2"),
  );
  assert.equal(await page.locator(".header-scorer-player").count(), 1);
  assert.ok((await page.locator(".team-header").boundingBox()).height < 260);
  connectionFailure = false;
  await page.click("#refresh");
  await page.waitForFunction(() =>
    document
      .querySelector("#line-source-status")
      .textContent.includes("Mentett feed"),
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
      .textContent.includes("nem érhető el"),
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
  await page.click("#refresh");
  await page.click("#tab-pk");
  await page.waitForFunction(() =>
    document.querySelector(".pk-source-note")?.textContent.includes("Lekérve:"),
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
  console.log(
    "PASS: source order preserves Brayden Point beyond first 12 roster entries; 5v5, PP/PK and keyboard tabs; goalie/pair views; dated cached state; no generated lines on failure; schema rejection; unmatched player handling; mobile no overflow. Source HTML was a fixture, not a live DFO response.",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
