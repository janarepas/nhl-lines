"use strict";
const teams = [
  ["ANA", "Anaheim Ducks", "#F47A38", "#B9975B"],
  ["BOS", "Boston Bruins", "#FFB81C", "#FFFFFF"],
  ["BUF", "Buffalo Sabres", "#003087", "#FFB81C"],
  ["CGY", "Calgary Flames", "#C8102E", "#F1BE48"],
  ["CAR", "Carolina Hurricanes", "#CC0000", "#FFFFFF"],
  ["CHI", "Chicago Blackhawks", "#CF0A2C", "#FFFFFF"],
  ["COL", "Colorado Avalanche", "#6F263D", "#236192"],
  ["CBJ", "Columbus Blue Jackets", "#002654", "#CE1126"],
  ["DAL", "Dallas Stars", "#006847", "#8F8F8C"],
  ["DET", "Detroit Red Wings", "#CE1126", "#FFFFFF"],
  ["EDM", "Edmonton Oilers", "#041E42", "#FF4C00"],
  ["FLA", "Florida Panthers", "#041E42", "#C8102E"],
  ["LAK", "Los Angeles Kings", "#111111", "#A2AAAD"],
  ["MIN", "Minnesota Wild", "#154734", "#DDCBA4"],
  ["MTL", "Montréal Canadiens", "#AF1E2D", "#192168"],
  ["NSH", "Nashville Predators", "#FFB81C", "#FFFFFF"],
  ["NJD", "New Jersey Devils", "#CE1126", "#FFFFFF"],
  ["NYI", "New York Islanders", "#00539B", "#F47D30"],
  ["NYR", "New York Rangers", "#0038A8", "#CE1126"],
  ["OTT", "Ottawa Senators", "#C52032", "#C2912C"],
  ["PHI", "Philadelphia Flyers", "#F74902", "#FFFFFF"],
  ["PIT", "Pittsburgh Penguins", "#FFB81C", "#FFFFFF"],
  ["SJS", "San Jose Sharks", "#006D75", "#EA7200"],
  ["SEA", "Seattle Kraken", "#99D9D9", "#E9072B"],
  ["STL", "St. Louis Blues", "#002F87", "#FCB514"],
  ["TBL", "Tampa Bay Lightning", "#002868", "#FFFFFF"],
  ["TOR", "Toronto Maple Leafs", "#00205B", "#FFFFFF"],
  ["UTA", "Utah Mammoth", "#6CACE4", "#FFFFFF"],
  ["VAN", "Vancouver Canucks", "#00205B", "#00843D"],
  ["VGK", "Vegas Golden Knights", "#B4975A", "#FFFFFF"],
  ["WSH", "Washington Capitals", "#C8102E", "#FFFFFF"],
  ["WPG", "Winnipeg Jets", "#041E42", "#AC162C"],
];
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const STORAGE = "blueline-v2",
  MAX_AGE = 10 * 60 * 1000;
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(STORAGE) || "{}") || {};
} catch {}
if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
if (
  !saved.teams ||
  typeof saved.teams !== "object" ||
  Array.isArray(saved.teams)
)
  saved.teams = {};
function validSnapshot(data) {
  return (
    data &&
    Number.isFinite(data.fetchedAt) &&
    Array.isArray(data.slots) &&
    Array.isArray(data.players) &&
    data.players.length > 0 &&
    data.players.every(
      (p) =>
        p &&
        (Number.isSafeInteger(p.id) ||
          (typeof p.id === "string" && p.id.startsWith("dfo:"))) &&
        ["F", "D", "G"].includes(p.group) &&
        typeof p.first === "string" &&
        typeof p.last === "string" &&
        typeof p.name === "string",
    )
  );
}
let team =
    teams.find((t) => t[0] === saved.team) || teams.find((t) => t[0] === "EDM"),
  players = [],
  slots = [],
  selected = null,
  lineData = null,
  linesState = "loading",
  linesError = "",
  linesFetchedAt = null,
  mode = "even",
  loadToken = 0,
  controller,
  loading = false,
  fetchedAt = null,
  source = "loading";
const gameCache = new Map(),
  running = new Set();
const failedImages = new Set();
function persist() {
  saved.team = team[0];
  saved.teams ??= {};
  if (players.length)
    saved.teams[team[0]] = {
      players,
      slots,
      fetchedAt,
      lineData,
      linesFetchedAt,
    };
  try {
    localStorage.setItem(STORAGE, JSON.stringify(saved));
    $("#save-state").textContent = "✓ Helyben mentve";
  } catch {
    $("#save-state").textContent = "A helyi mentés nem elérhető";
  }
}
function notice(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($("#toast").hidden = true), 4200);
}
function dateLabel(value) {
  return new Intl.DateTimeFormat("hu-HU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  }).format(new Date(value));
}
function assetUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "assets.nhle.com"
      ? u.href
      : "";
  } catch {
    return "";
  }
}
function primaryColor(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((n) => parseInt(n, 16));
  if (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 135) return hex;
  return (
    "#" +
    rgb
      .map((n, i) =>
        Math.round(n * 0.5 + [4, 20, 36][i] * 0.5)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function applyTheme() {
  document.documentElement.style.setProperty("--jersey-stripe", team[3]);
  document.documentElement.style.setProperty("--team-primary", team[2]);
  document.documentElement.style.setProperty(
    "--portrait-ink",
    primaryColor(team[2]) === team[2] ? "#ffffff" : "#152236",
  );

  document.documentElement.style.setProperty(
    "--primary",
    primaryColor(team[2]),
  );
  document.documentElement.style.setProperty(
    "--accent",
    team[3].toUpperCase() === "#FFFFFF" ? primaryColor(team[2]) : team[3],
  );
  document.documentElement.style.setProperty(
    "--tint",
    `color-mix(in srgb, ${team[3]} 7%, white)`,
  );
  $("#team-title").textContent = team[1];
  document.title = team[1] + " — NHL Line Combos";
  document.querySelector('meta[name="theme-color"]').content = team[2];
  $("#team-logo").innerHTML =
    `<img src="https://assets.nhle.com/logos/nhl/svg/${team[0]}_light.svg" alt="${esc(team[1])} embléma">`;
  $("#team-logo img").onerror = () => ($("#team-logo").textContent = team[0]);
  syncTeamSelection();
}
function status() {
  const el = $("#data-status");
  el.dataset.state =
    source === "live" ? "live" : source === "loading" ? "loading" : "error";
  el.textContent =
    source === "loading"
      ? "Az NHL aktuális keretének betöltése…"
      : source === "live"
        ? `NHL-keret ellenőrizve: ${dateLabel(fetchedAt)}`
        : players.length
          ? `Mentett keret: ${dateLabel(fetchedAt)} · Az élő frissítés most nem sikerült.`
          : "Az NHL-keret most nem érhető el. Próbáld újra az Adatok frissítése gombbal.";
  $("#refresh").disabled = loading;
  $("#refresh").textContent = loading ? "↻ Frissítés…" : "↻ Adatok frissítése";
}
function parseRoster(data) {
  const groups = [
    ["forwards", "F"],
    ["defensemen", "D"],
    ["goalies", "G"],
  ];
  if (groups.some(([key]) => !Array.isArray(data[key])))
    throw Error("Érvénytelen NHL-keret.");
  const seen = new Set();
  const result = groups.flatMap(([key, group]) =>
    data[key].map((p) => {
      if (
        !Number.isSafeInteger(p.id) ||
        !p.firstName?.default ||
        !p.lastName?.default ||
        seen.has(p.id)
      )
        throw Error("Hiányos NHL-játékosadat.");
      seen.add(p.id);
      return {
        id: p.id,
        name: p.firstName.default + " " + p.lastName.default,
        first: p.firstName.default,
        last: p.lastName.default,
        number: p.sweaterNumber ?? "—",
        pos: p.positionCode || group,
        shootsCatches: ["L", "R"].includes(p.shootsCatches)
          ? p.shootsCatches
          : null,
        group,
        image: assetUrl(p.headshot),
        height: p.heightInCentimeters,
        weight: p.weightInKilograms,
        birth: p.birthDate,
        tsn: "",
        customImage: "",
      };
    }),
  );
  if (!result.length) throw Error("Üres NHL-keret.");
  return result;
}
function photo(p) {
  const candidate = p.customImage || p.image;
  const image = failedImages.has(candidate) ? "" : candidate;
  return `<span class="portrait${image ? "" : " is-fallback"}"><span class="portrait-fallback"${image ? " hidden" : ""}>${esc(p.first?.[0] || p.name?.[0] || "?")}${esc(p.last?.[0] || "")}</span>${image ? `<img src="${esc(image)}" alt="${esc(p.name)} portréja" decoding="async">` : ""}</span>`;
}
function showPortraitFallback(img) {
  failedImages.add(img.src);
  const portrait = img.closest(".portrait");
  img.remove();
  portrait.classList.add("is-fallback");
  portrait.querySelector(".portrait-fallback").hidden = false;
}

let pendingForms = new Set();
function statsFor(p) {
  const item = gameCache.get(p.id);
  return item
    ? LineStats.summarize(item.games, p.group === "G")
    : {
        kind: "neutral",
        label:
          running.has(p.id) || pendingForms.has(p.id)
            ? "Statisztika betöltése…"
            : "Nincs meccsadat",
        goalie: p.group === "G",
        count: 0,
        games: [],
      };
}
let injuryReport = new Map(),
  injuryState = "loading",
  injuryCheckedAt = null;
let pointLeaders = { points: 0, ids: new Set() },
  leadersState = "loading";
function topMark(p) {
  const league = pointLeaders.ids.has(p.id);
  const club = pointLeaders.teamIds?.has(p.id);
  if (!league && !club) return "";
  const label = league
    ? `NHL${club ? " és " + team[1] : ""} pontlistavezető · ${pointLeaders.points} pont`
    : `${team[1]} pontlistavezető · ${pointLeaders.teamPoints} pont`;
  return `<span class="top-mark" role="img" aria-label="${esc(label)}" title="${esc(label)}">🔝</span>`;
}
async function loadLeaders(token, signal) {
  pointLeaders = { points: 0, ids: new Set() };
  leadersState = "loading";
  try {
    const response = await fetch("/api/leaders", { signal });
    if (!response.ok) throw Error("Points unavailable");
    const data = await response.json();
    if (token !== loadToken) return;
    pointLeaders = LineStats.leaders(data, team[0]);
    leadersState = "live";
  } catch (error) {
    if (error.name === "AbortError" || token !== loadToken) return;
    leadersState = "error";
  } finally {
    if (token === loadToken) render();
  }
}
function injuryFor(p) {
  return injuryReport.get(LineInjuries.normalize(p.name));
}
function injuryMark(p) {
  const injury = injuryFor(p);
  return injury
    ? `<span class="injury-mark" role="img" aria-label="Sérülésjelentés: ${esc(injury.status)}" title="ESPN: ${esc(injury.status)}${injury.reason ? " · " + esc(injury.reason) : ""}">🩹</span>`
    : "";
}
async function loadInjuries(token, signal) {
  injuryState = "loading";
  injuryReport = new Map();
  injuryCheckedAt = null;
  try {
    const response = await fetch("/api/injuries", { signal });
    if (!response.ok) throw Error("Injury report unavailable");
    const data = await response.json();
    if (token !== loadToken) return;
    injuryReport = LineInjuries.parseReport(data, team[1]);
    injuryState = "live";
    injuryCheckedAt = Date.now();
  } catch (error) {
    if (error.name === "AbortError" || token !== loadToken) return;
    injuryState = "error";
  } finally {
    if (token === loadToken) render();
  }
}
function badge(s) {
  const icons = {
    hot: "🔥",
    cold: "🧊",
    normal: s.goalie ? "◎" : "👌",
    stale: "◷",
    neutral: "—",
  };
  const help = s.goalie
    ? "Az utolsó legfeljebb 5 lejátszott mérkőzés. SV%: összes védés / összes kapott lövés. GAA: 60 perc játékidőre jutó kapott gól. A mérleg: győzelem–vereség–hosszabbításos vereség."
    : {
        hot: "Legalább 3 egymást követő pontszerző meccs, vagy legalább 7 pont az utolsó 5 mérkőzésen. Csak friss, legfeljebb 14 napos meccsadatnál aktuális.",
        cold: "Az utolsó 3 lejátszott mérkőzés mindegyikén 0 pont. Csak friss, legfeljebb 14 napos meccsadatnál aktuális.",
        normal:
          "Az utolsó legfeljebb 5 mérkőzés alapján sem a hot streak, sem a pontcsend feltétele nem teljesül. Ez a jelölés nem teljesítményosztályzat.",
        stale:
          "A legutóbbi mérkőzés 14 napnál régebbi, ezért ezek az adatok nem jelentenek aktuális formát.",
        neutral:
          "Még nincs elérhető, ellenőrzött meccsnapló a forma megállapításához.",
      }[s.kind];
  return `<span class="form-badge ${s.kind}" data-form-help="${esc(help)}"><span class="form-icon" aria-hidden="true">${icons[s.kind]}</span> ${esc(s.label)}</span>`;
}
function statLine(s) {
  if (!s.count) return "";
  if (s.goalie)
    return `<div class="player-stats goalie-stats">${s.count} M <span>·</span> <b>${s.pct === null ? "—" : (s.pct * 100).toFixed(1) + "%"} SV</b><br>${s.gaa === null ? "—" : s.gaa.toFixed(2)} GAA${s.wins === null ? "" : ` <span>·</span> ${s.wins}–${s.losses}–${s.overtimeLosses}`}</div>`;
  return `<div class="player-stats">${s.count} M <span>·</span> ${s.goals} G + ${s.assists} A <span>·</span> <b>${s.points} P</b></div>`;
}
function handText(p) {
  const side =
    p.shootsCatches === "L" ? "Bal" : p.shootsCatches === "R" ? "Jobb" : null;
  const label =
    p.group === "G"
      ? side
        ? `${side} fogókéz`
        : "Fogókéz: —"
      : side
        ? `${side}os ütőfogás`
        : "Ütőfogás: —";
  return `<span class="player-handedness" aria-label="${label}" title="${label}">${p.group === "G" ? label : `<span aria-hidden="true">🏒</span> ${side ? p.shootsCatches : "—"}`}</span>`;
}
function card(id, pairSide) {
  const p = players.find((p) => p.id === id);
  if (!p)
    return `<div class="empty-slot">${loading ? "Keret betöltése…" : "Nincs játékos ezen a helyen"}</div>`;
  const s = statsFor(p);
  const position = ["LD", "RD"].includes(pairSide) ? pairSide : p.pos;
  return `<button class="player-card" data-player="${esc(p.id)}" aria-label="${esc(p.name)}, ${esc(s.label)}">${photo(p)}<span class="player-copy"><span class="player-meta"><span>#${esc(p.number)}</span><span>${esc(position)}</span></span><span class="player-name"><span class="first-name">${esc(p.first)}</span>${esc(p.last)} ${injuryMark(p)} ${topMark(p)}</span>${handText(p)}${badge(s)}${statLine(s)}</span></button>`;
}
function noLines(label) {
  return `<div class="lines-empty">${esc(label)}</div>`;
}
function powerPlaySlots(ids) {
  const defender = (id) =>
    players.some((p) => p.id === id && (p.group === "D" || p.pos === "D"));
  const point = ids.find(defender) ?? ids.at(-1);
  const around = ids.filter((id) => id !== point);
  return [
    { role: "front-left", id: around[0] },
    { role: "front-right", id: around[1] },
    { role: "wing-left", id: around[2] },
    { role: "wing-right", id: around[3] },
    { role: "point", id: point, defender: defender(point) },
  ];
}
function specialUnit(ids, index) {
  if (mode !== "pp")
    return `<div class="special-unit"><h3>PK ${index + 1}</h3><div class="special-unit-players count-${ids.length}">${ids.map(card).join("")}</div></div>`;
  const slots = powerPlaySlots(ids);
  return `<div class="special-unit pp-unit"><div class="pp-unit-heading"><h3>PP ${index + 1}</h3><span>Umbrella · sematikus elrendezés</span></div><div class="special-unit-players umbrella" aria-label="PP ${index + 1}, umbrella elrendezés"><div class="umbrella-net" aria-hidden="true"></div>${slots.map((slot) => `<div class="pp-position pp-${slot.role}" data-pp-role="${slot.role}">${slot.role === "point" ? `<span class="pp-point-label">Hátul${slot.defender ? " · védő" : ""}</span>` : ""}${slot.id !== undefined ? card(slot.id) : `<span class="pp-missing">Hiányzó játékosadat</span>`}</div>`).join("")}</div></div>`;
}
function drawLines() {
  $("#forwards .section-count").textContent = lineData
    ? lineData.forwards.length + " SOR"
    : "FORRÁSRA VÁR";
  $("#defense .section-count").textContent = lineData
    ? lineData.defense.length + " PÁR"
    : "FORRÁSRA VÁR";
  $("#goalies .section-count").textContent = lineData
    ? lineData.goalies.length + " KAPUS"
    : "FORRÁSRA VÁR";
  const unavailable =
    linesState === "loading"
      ? "A közölt sorösszeállítás betöltése…"
      : "Ehhez a részhez a feed nem közöl soradatot.";
  $("#forward-lines").innerHTML = lineData?.forwards.length
    ? lineData.forwards
        .map(
          (ids, index) =>
            `<div class="line-row"><div class="line-number">${index + 1}<small>${ids.length < 3 ? "HIÁNYOS" : "SOR"}</small></div>${ids.map(card).join("")}</div>`,
        )
        .join("")
    : noLines(unavailable);
  $("#defense-lines").innerHTML = lineData?.defense.length
    ? lineData.defense
        .map(
          (ids, index) =>
            `<div class="line-row pair-row"><div class="line-number">${index + 1}<small>PÁR</small></div>${ids.map((id, side) => card(id, side === 0 ? "LD" : "RD")).join("")}</div>`,
        )
        .join("")
    : noLines(unavailable);
  $("#goalie-lines").innerHTML = lineData?.goalies.length
    ? lineData.goalies
        .map(
          (id, i) =>
            `<div class="goalie-slot"><small>${i === 0 ? "ELSŐ HELY" : "MÁSODIK HELY"}</small>${card(id)}</div>`,
        )
        .join("")
    : noLines(unavailable);
  $("#special-lines").classList.toggle("powerplay-units", mode === "pp");
  $("#special-heading").textContent =
    mode === "pk" ? "Shorthanded egységek" : "Power Play egységek";
  $("#special-symbol").textContent = mode === "pk" ? "PK" : "PP";
  $("#special-lines").innerHTML =
    mode === "even"
      ? ""
      : lineData?.[mode]?.length
        ? lineData[mode].map(specialUnit).join("")
        : noLines(unavailable);
  const used = new Set(
    lineData
      ? [
          ...lineData.forwards.flat(),
          ...lineData.defense.flat(),
          ...lineData.goalies,
          ...lineData.pp.flat(),
          ...lineData.pk.flat(),
        ]
      : [],
  );
  const extras = players.filter((p) => !used.has(p.id));
  $("#extras").hidden = !extras.length;
  $("#extras-list").innerHTML = extras.map((p) => card(p.id)).join("");
  for (const [group, key] of [
    ["F", "forward"],
    ["D", "defense"],
    ["G", "goalie"],
  ])
    $("#" + key + "-count").innerHTML =
      players.filter((p) => p.group === group).length +
      " <small>játékos</small>";
  const hot = players.filter((p) => statsFor(p).kind === "hot").length,
    available = players.some((p) => statsFor(p).count && p.group !== "G");
  $("#hot-count").innerHTML = available
    ? `${hot} <small>játékos</small>`
    : "— <small>nincs adat</small>";
  $$("[data-player]").forEach(
    (button) =>
      (button.onclick = () =>
        selectPlayer(
          /^\d+$/.test(button.dataset.player)
            ? Number(button.dataset.player)
            : button.dataset.player,
        )),
  );
  $$(".portrait img").forEach(
    (img) => (img.onerror = () => showPortraitFallback(img)),
  );
  $("#line-source-kind").textContent = "BETWEEN THE LINES · DFO-ADATOK";
  $("#forwards-heading").textContent = "Támadósorok";
  $("#line-source-title").textContent = lineData
    ? "A legutóbb közölt összeállítás"
    : linesState === "loading"
      ? "Sorok betöltése…"
      : "A sorösszeállítás nem érhető el";
  const age = lineData ? Date.now() - Date.parse(lineData.updated) : 0;
  $("#line-source-status").textContent =
    linesState === "loading"
      ? "Közölt soradatok betöltése…"
      : lineData
        ? `${linesState === "live" ? "Feed frissítése" : "Mentett feed"}: ${dateLabel(lineData.updated)} · Between the Lines, eredeti forrás: Daily Faceoff. ${age > 36 * 3600000 ? "Figyelem: több mint 36 órás adat. " : ""}${linesState === "error" ? linesError : "Naponta többször frissül; nem élő meccskövetés."}`
        : linesError;
  $("#line-source-link").href =
    lineData?.sourceUrl ||
    "https://github.com/hg913488/nhl-line-combos-app/blob/main/data/lines.json";
  $("#line-source-link").textContent = "Közölt adat megnyitása ↗";
  if (formTooltipAnchor && !formTooltipAnchor.isConnected) hideFormHelp();
}
function dfoUrl() {
  const slug = team[1]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return "https://www.dailyfaceoff.com/teams/" + slug + "/line-combinations";
}
function render() {
  status();
  drawLines();
  $("#leaders-status").textContent =
    leadersState === "live"
      ? "🔝 Csapat- és NHL-pontlistavezetők · aktuális idény"
      : leadersState === "loading"
        ? "NHL-pontlista betöltése…"
        : "NHL-pontlista most nem elérhető";
  $("#injury-status").textContent =
    injuryState === "live"
      ? `🩹 Sérülésjelentés: ESPN · ${dateLabel(injuryCheckedAt)}`
      : injuryState === "loading"
        ? "Sérülésjelentés betöltése…"
        : "Sérülésadat nem elérhető · a hiányzó jelölés nem igazol egészséges státuszt";
  if ($("#player-dialog").open && players.some((p) => p.id === selected))
    renderDetail();
}
async function getNhl(path, signal) {
  const res = await fetch("/api/nhl?path=" + encodeURIComponent(path), {
    signal,
  });
  if (!res.ok)
    throw Error("Az NHL-adatforrás nem elérhető (" + res.status() + ").");
  const data = await res.json();
  if (data.error) throw Error(data.error);
  return data;
}
async function fetchPublished(signal) {
  let response = await fetch("/api/lineups", { signal });
  // The publisher explicitly allows cross-origin reads. Use its public feed
  // directly if the hosting runtime cannot establish a connection, never after
  // an upstream access denial or malformed-source response.
  if (
    !response.ok &&
    response.headers.get("X-Line-Error") === "feed-connection"
  ) {
    response = await fetch(
      "https://raw.githubusercontent.com/hg913488/nhl-line-combos-app/main/data/lines.json",
      { signal },
    );
  }
  if (!response.ok)
    throw Error(
      "A közölt soradat-feed átmenetileg nem érhető el (HTTP " +
        response.status +
        ").",
    );
  return response.json();
}
function sourcePlayers(data) {
  return [
    data.forwards.flat(),
    data.defense.flat(),
    data.goalies,
    data.pp.flat(),
    data.pk.flat(),
  ].flat();
}
async function loadTeam() {
  const token = ++loadToken;
  failedImages.clear();
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  loading = true;
  source = "loading";
  linesState = "loading";
  linesError = "";
  if ($("#player-dialog").open) $("#player-dialog").close();
  const snapshot = saved.teams?.[team[0]],
    previous = validSnapshot(snapshot) ? snapshot : null;
  players = previous?.players || [];
  fetchedAt = previous?.fetchedAt || null;
  slots = [];
  lineData =
    PublishedLines.valid(previous?.lineData) &&
    previous?.lineData?.team === team[0]
      ? previous.lineData
      : null;
  linesFetchedAt = previous?.linesFetchedAt || null;
  applyTheme();
  loadInjuries(token, signal);
  loadLeaders(token, signal);
  render();
  const [rosterResult, dfoResult] = await Promise.allSettled([
    getNhl(`roster/${team[0]}/current`, signal),
    fetchPublished(signal),
  ]);
  if (token !== loadToken) return;
  try {
    if (rosterResult.status === "fulfilled") {
      players = parseRoster(rosterResult.value);
      source = "live";
      fetchedAt = Date.now();
    } else source = "error";
  } catch (error) {
    source = "error";
  }
  try {
    if (dfoResult.status === "rejected") throw dfoResult.reason;
    lineData = PublishedLines.parse(
      dfoResult.value,
      players,
      dfoUrl().split("/").at(-2),
      team[0],
    );
    linesFetchedAt = Date.now();
    linesState = "live";
  } catch (error) {
    linesError = error.message;
    linesState = "error";
  }
  if (lineData) {
    const known = new Set(players.map((p) => p.id));
    for (const p of lineData.extra || []) {
      if (!known.has(p.id)) {
        players.push(p);
        known.add(p.id);
      }
    }
    for (const id of sourcePlayers(lineData)) {
      if (known.has(id)) continue;
      const cached = previous?.players.find((p) => p.id === id);
      if (cached) {
        players.push(cached);
        known.add(id);
      }
    }
  }
  const overrides = new Map((previous?.players || []).map((p) => [p.id, p]));
  for (const p of players) {
    p.customImage = overrides.get(p.id)?.customImage || "";
    p.tsn = overrides.get(p.id)?.tsn || "";
  }
  loading = false;
  persist();
  render();
  loadForms(token, signal);
}
async function loadForms(token, signal) {
  const queue = players
    .filter(
      (p) =>
        Number.isSafeInteger(p.id) &&
        (!gameCache.has(p.id) || Date.now() - gameCache.get(p.id).at > MAX_AGE),
    )
    .sort((a, b) => Number(b.group === "G") - Number(a.group === "G"));
  pendingForms = new Set(queue.map((p) => p.id));
  render();
  const worker = async () => {
    while (queue.length && token === loadToken && !signal.aborted) {
      const p = queue.shift();
      running.add(p.id);
      try {
        const raw = await getNhl(`player/${p.id}/game-log/now`, signal);
        if (!Array.isArray(raw.gameLog)) throw Error("Érvénytelen meccsnapló");
        if (token === loadToken)
          gameCache.set(p.id, { games: raw.gameLog, at: Date.now() });
      } catch (e) {
      } finally {
        running.delete(p.id);
        if (token === loadToken) {
          pendingForms.delete(p.id);
          render();
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}
function selectPlayer(id) {
  selected = id;
  $("#edit-form").hidden = true;
  renderDetail();
  $("#player-dialog").showModal();
}
function renderDetail() {
  const p = players.find((p) => p.id === selected);
  if (!p) return;
  const s = statsFor(p);
  $("#dialog-role").textContent =
    p.group === "G" ? "KAPUSPROFIL" : "JÁTÉKOSPROFIL";
  const empty = `<div class="detail-empty">Ehhez a játékoshoz most nincs elérhető meccsnapló. Frissítéskor újra megpróbáljuk betölteni az NHL-től.</div>`;
  const summary = s.count
    ? s.goalie
      ? `<div class="detail-stats"><div><strong>${s.count}</strong><span>MÉRKŐZÉS</span></div><div><strong>${s.pct === null ? "—" : (s.pct * 100).toFixed(1) + "%"}</strong><span>VÉDÉSI HATÉKONYSÁG</span></div><div><strong>${s.gaa === null ? "—" : s.gaa.toFixed(2)}</strong><span>KAPOTT GÓL / 60 PERC</span></div></div>`
      : `<div class="detail-stats"><div><strong>${s.goals}</strong><span>GÓL</span></div><div><strong>${s.assists}</strong><span>GÓLPASSZ</span></div><div><strong>${s.points}</strong><span>PONT</span></div></div>`
    : empty;
  const rows = s.games
    .map(
      (g) =>
        `<tr><td>${esc(g.gameDate)}</td><td>${esc(g.opponentAbbrev || "—")}</td>${s.goalie ? `<td>${esc(g.shotsAgainst ?? "—")}</td><td>${esc(g.goalsAgainst ?? "—")}</td><td>${Number.isFinite(g.savePctg) ? (g.savePctg * 100).toFixed(1) + "%" : "—"}</td>` : `<td>${g.goals}</td><td>${g.assists}</td><td class="point-cell">${g.goals + g.assists}</td>`}</tr>`,
    )
    .join("");
  $("#player-detail").innerHTML =
    `<div class="detail-identity">${photo(p)}<div><span class="player-meta">#${esc(p.number)} · ${esc(p.pos)} · ${esc(team[0])}</span><h2 id="player-title">${esc(p.name)} ${injuryMark(p)} ${topMark(p)}</h2>${handText(p)}${badge(s)}</div></div><div class="detail-label">UTOLSÓ ${s.count || 5} MÉRKŐZÉS <span>${s.kind === "stale" ? "Korábbi időszak" : "NHL-meccsnapló"}</span></div>${summary}${s.count ? `<table class="game-log"><thead><tr><th>DÁTUM</th><th>ELLENFÉL</th><th>${s.goalie ? "LÖVÉS" : "G"}</th><th>${s.goalie ? "KAPOTT GÓL" : "A"}</th><th>${s.goalie ? "SV%" : "P"}</th></tr></thead><tbody>${rows}</tbody></table>` : ""}<p class="small-muted">${s.streak >= 3 ? `${s.streak} egymást követő pontszerző mérkőzés. ` : ""}Forrás: NHL. ${p.customImage ? "Portré: egyéni TSN-import." : p.image ? "Portré: NHL." : "Portré nem érhető el."}</p>`;
  $$("#player-detail .portrait img").forEach(
    (i) => (i.onerror = () => showPortraitFallback(i)),
  );
}
function chooseMode(next) {
  mode = next;
  $$("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $("#even-panel").hidden = mode !== "even";
  $("#special-panel").hidden = mode === "even";
  $("#special-panel").setAttribute(
    "aria-labelledby",
    "tab-" + (mode === "pk" ? "pk" : "pp"),
  );
  drawLines();
}
$$("[data-mode]").forEach((button) => {
  button.onclick = () => chooseMode(button.dataset.mode);
  button.onkeydown = (event) => {
    const modes = ["even", "pp", "pk"],
      index = modes.indexOf(mode);
    const next =
      event.key === "ArrowRight"
        ? modes[(index + 1) % 3]
        : event.key === "ArrowLeft"
          ? modes[(index + 2) % 3]
          : event.key === "Home"
            ? "even"
            : event.key === "End"
              ? "pk"
              : null;
    if (next) {
      event.preventDefault();
      chooseMode(next);
      $("#tab-" + next).focus();
    }
  };
});
const teamOptions = $("#team-options");
teamOptions.innerHTML = teams
  .map(
    (t) =>
      `<button class="team-option" data-team="${t[0]}" aria-pressed="false"><span class="team-option-logo"><img src="https://assets.nhle.com/logos/nhl/svg/${t[0]}_light.svg" alt=""><span hidden>${t[0]}</span></span><span>${esc(t[1])}</span><span class="team-option-check" aria-hidden="true">✓</span></button>`,
  )
  .join("");
$$(".team-option img").forEach(
  (img) =>
    (img.onerror = () => {
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    }),
);
function syncTeamSelection() {
  $$(".team-option").forEach((button) => {
    const active = button.dataset.team === team[0];
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#picker-selected").textContent = team[1];
}
function selectTeam(code) {
  const next = teams.find((t) => t[0] === code);
  if (!next) return;
  $("#team-search").value = "";
  $("#team-search").dispatchEvent(new Event("input"));
  $("#team-menu").open = false;
  $("#team-menu summary").focus({ preventScroll: true });
  if (code === team[0]) return;
  persist();
  team = next;
  saved.team = team[0];
  loadTeam();
}
teamOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-team]");
  if (button) selectTeam(button.dataset.team);
});
const normalizeSearch = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
$("#team-search").addEventListener("input", (event) => {
  const query = normalizeSearch(event.target.value);
  let count = 0;
  $$(".team-option").forEach((button) => {
    const t = teams.find((t) => t[0] === button.dataset.team);
    button.hidden = !normalizeSearch(t[0] + " " + t[1]).includes(query);
    if (!button.hidden) count++;
  });
  $("#team-no-results").hidden = count > 0;
});
$("#team-menu").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("#team-menu").open = false;
    $("#team-menu summary").focus();
  }
});
$("#refresh").onclick = () => loadTeam();
$("#close-dialog").onclick = () => $("#player-dialog").close();
$("#player-dialog").onclick = (e) => {
  if (e.target === $("#player-dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
};
$("#edit-player").onclick = () => {
  const p = players.find((p) => p.id === selected);
  $("#edit-tsn").value = p.tsn || "";
  $("#edit-error").textContent = "";
  $("#edit-form").hidden = !$("#edit-form").hidden;
};
$("#edit-form").onsubmit = async (e) => {
  e.preventDefault();
  const p = players.find((p) => p.id === selected);
  const currentTeam = team[0];
  const url = $("#edit-tsn").value.trim();
  $("#save-player").disabled = true;
  try {
    let image = p.customImage;
    if (url && url !== p.tsn) {
      const response = await fetch(
        "/api/portrait?url=" + encodeURIComponent(url),
      );
      const text = await response.text();
      if (!response.ok || !text.startsWith("https://"))
        throw Error("A TSN-kép nem importálható erről a profilról.");
      image = text;
    }
    if (team[0] !== currentTeam) return;
    Object.assign(p, {
      tsn: url,
      customImage: url ? image : "",
    });
    persist();
    render();
    $("#edit-form").hidden = true;
    notice("Portrébeállítás mentve.");
  } catch (e) {
    $("#edit-error").textContent = e.message;
  } finally {
    $("#save-player").disabled = false;
  }
};
setInterval(() => {
  if (!document.hidden && !loading) loadTeam();
}, MAX_AGE);
document.addEventListener("visibilitychange", () => {
  if (
    !document.hidden &&
    !loading &&
    (!fetchedAt || Date.now() - fetchedAt > MAX_AGE)
  )
    loadTeam();
});

// One transient help bubble, anchored to the full form label; no permanent legend.
const formTooltip = $("#form-tooltip");
let formTooltipAnchor = null;
function hideFormHelp() {
  formTooltip.hidden = true;
  formTooltipAnchor?.removeAttribute("aria-describedby");
  formTooltipAnchor
    ?.closest("[data-player]")
    ?.removeAttribute("aria-describedby");
  formTooltipAnchor = null;
}
function showFormHelp(icon) {
  if (!icon?.dataset.formHelp) return;
  hideFormHelp();
  formTooltipAnchor = icon;
  icon.setAttribute("aria-describedby", "form-tooltip");
  icon
    .closest("[data-player]")
    ?.setAttribute("aria-describedby", "form-tooltip");
  formTooltip.textContent = icon.dataset.formHelp;
  formTooltip.hidden = false;
  const anchor = icon.getBoundingClientRect();
  const tip = formTooltip.getBoundingClientRect();
  formTooltip.style.left =
    Math.max(12, Math.min(anchor.left, innerWidth - tip.width - 12)) + "px";
  formTooltip.style.top =
    Math.max(
      12,
      anchor.bottom + tip.height + 12 < innerHeight
        ? anchor.bottom + 8
        : anchor.top - tip.height - 8,
    ) + "px";
}
document.addEventListener("pointerover", (event) => {
  const icon = event.target.closest?.("[data-form-help]");
  if (icon && event.pointerType !== "touch") showFormHelp(icon);
});
document.addEventListener("pointerout", (event) => {
  const badge = event.target.closest?.("[data-form-help]");
  if (badge && !badge.contains(event.relatedTarget)) hideFormHelp();
});
document.addEventListener("focusin", (event) => {
  const icon = event.target.matches?.(".player-card")
    ? event.target.querySelector("[data-form-help]")
    : null;
  if (icon) showFormHelp(icon);
});
document.addEventListener("focusout", hideFormHelp);
document.addEventListener(
  "click",
  (event) => {
    const icon = event.target.closest?.("[data-form-help]");
    if (icon) {
      event.stopPropagation();
      event.preventDefault();
      showFormHelp(icon);
    } else hideFormHelp();
  },
  true,
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideFormHelp();
});
window.addEventListener("resize", hideFormHelp);
window.addEventListener("scroll", hideFormHelp, true);

loadTeam();
requestAnimationFrame(syncTeamSelection);
