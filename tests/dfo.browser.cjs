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
  const page = await b.newPage({ viewport: { width: 1440, height: 1100 } });
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
  await page.route("**/api/nhl?*", (r) => {
    const path = new URL(r.request().url()).searchParams.get("path");
    if (path.startsWith("roster")) return r.fulfill({ json: roster });
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
    0,
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
    /🔥 Hot streak/,
  );
  assert.match(
    await page
      .locator('#goalie-lines [data-player="8470022"] .form-badge')
      .innerText(),
    /🧊 Cold streak/,
  );
  await page
    .locator('#goalie-lines [data-player="8470022"] .form-badge')
    .hover();
  assert.match(await page.locator("#form-tooltip").innerText(), /93%.*89%/);
  await page.mouse.move(1, 1);

  assert.match(
    await page
      .locator('#forward-lines [data-player="8470000"] .player-handedness')
      .innerText(),
    /🏒 L/,
  );
  assert.match(
    await page
      .locator('#forward-lines [data-player="8470001"] .player-handedness')
      .innerText(),
    /🏒 R/,
  );
  assert.match(
    await page
      .locator('#goalie-lines [data-player="8470021"] .player-handedness')
      .innerText(),
    /Jobb fogókéz/,
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
    /🏒 R/,
  );
  assert.match(
    await page
      .locator('#defense-lines [data-player="8470016"] .player-handedness')
      .innerText(),
    /🏒 L/,
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
    await icon.hover();
    assert.equal(await page.locator("#form-tooltip").isVisible(), true);
    assert.match(await page.locator("#form-tooltip").innerText(), explanation);
    const label = page.locator(
      `#forward-lines [data-player="${id}"] .form-badge`,
    );
    const labelBox = await label.boundingBox();
    await page.mouse.move(
      labelBox.x + labelBox.width - 3,
      labelBox.y + labelBox.height / 2,
    );
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
    (await page.locator(".team-header").boundingBox()).height < 230,
    "Compact unified header",
  );
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
  const brandBox = await page.locator(".brand").boundingBox();
  const pickerBox = await page.locator("#team-menu summary").boundingBox();
  assert.ok(
    Math.abs(
      brandBox.y + brandBox.height / 2 - (pickerBox.y + pickerBox.height / 2),
    ) < 2,
    "One navigation row",
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
  await page.keyboard.press("Home");
  assert.equal(await page.locator("#even-panel").isVisible(), true);
  assert.equal(await page.locator("#reset").count(), 0);
  assert.equal(await page.locator("#swap-player").count(), 0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
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
  assert.deepEqual(errors, []);
  assert.deepEqual(
    forbiddenRequests,
    [],
    "No inferred lineup endpoints requested",
  );
  console.log(
    "PASS: source order preserves Brayden Point beyond first 12 roster entries; 5v5, PP/PK and keyboard tabs; goalie/pair views; dated cached state; no generated lines on failure; schema rejection; unmatched player handling; mobile no overflow. Source HTML was a fixture, not a live DFO response.",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
