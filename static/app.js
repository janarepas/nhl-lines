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
  } catch {
    // Browsing remains available when local storage is disabled.
  }
}
function notice(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($("#toast").hidden = true), 4200);
}
function dateLabel(value) {
  return new Intl.DateTimeFormat("en-GB", {
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
function fitTeamTitle() {
  const title = $("#team-title");
  const row = title.closest(".team-title-row");
  row.style.width = "";
  title.style.fontSize = "";
  const size = parseFloat(getComputedStyle(title).fontSize);
  const available = title.clientWidth;
  const needed = title.scrollWidth;
  if (available > 0 && needed > available) {
    title.style.fontSize =
      Math.floor(((size * available) / needed) * 10) / 10 + "px";
  }
  const textRange = document.createRange();
  textRange.selectNodeContents(title);
  const titleWidth = textRange.getBoundingClientRect().width;
  const controlsWidth = row.clientWidth - title.clientWidth;
  row.style.width =
    Math.min(row.clientWidth, Math.ceil(titleWidth + controlsWidth)) + "px";
}
function applyTheme() {
  document.documentElement.style.setProperty("--jersey-stripe", team[3]);
  document.documentElement.style.setProperty("--team-primary", team[2]);
  document.documentElement.style.setProperty("--team-secondary", team[3]);
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
  $("#team-title").removeAttribute("title");
  document.title = team[1] + " — Line Combos";
  document.querySelector('meta[name="theme-color"]').content = team[2];
  $("#team-logo").innerHTML =
    `<img src="https://assets.nhle.com/logos/nhl/svg/${team[0]}_light.svg" alt="${esc(team[1])} logo">`;
  $("#team-logo img").onerror = () => ($("#team-logo").textContent = team[0]);
  syncTeamSelection();
  fitTeamTitle();
}
function status() {
  const el = $("#data-status");
  el.dataset.state =
    source === "live" ? "live" : source === "loading" ? "loading" : "error";
  el.textContent =
    source === "loading"
      ? "Loading the current NHL roster…"
      : source === "live"
        ? `NHL roster checked: ${dateLabel(fetchedAt)}`
        : players.length
          ? `Saved roster: ${dateLabel(fetchedAt)} · The latest refresh failed.`
          : "The NHL roster is temporarily unavailable. An automatic refresh will try again.";
  if (Date.now() < nhlRetryAt) {
    el.dataset.state = "error";
    el.textContent = `${fetchedAt ? `${source === "live" ? "NHL roster" : "Saved roster"}: ${dateLabel(fetchedAt)} · ` : ""}Waiting for the NHL rate limit · retrying automatically.`;
  }
}
function parseRoster(data) {
  const groups = [
    ["forwards", "F"],
    ["defensemen", "D"],
    ["goalies", "G"],
  ];
  if (groups.some(([key]) => !Array.isArray(data[key])))
    throw Error("Invalid NHL roster.");
  const seen = new Set();
  const result = groups.flatMap(([key, group]) =>
    data[key].map((p) => {
      if (
        !Number.isSafeInteger(p.id) ||
        !p.firstName?.default ||
        !p.lastName?.default ||
        seen.has(p.id)
      )
        throw Error("Incomplete NHL player data.");
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
        birthCountry:
          typeof p.birthCountry === "string"
            ? p.birthCountry.toUpperCase()
            : null,
      };
    }),
  );
  if (!result.length) throw Error("Empty NHL roster.");
  return result;
}
const flagRegions = Object.freeze({
  CAN: "CA",
  USA: "US",
  SWE: "SE",
  FIN: "FI",
  RUS: "RU",
  CZE: "CZ",
  SVK: "SK",
  SVN: "SI",
  SUI: "CH",
  CHE: "CH",
  GER: "DE",
  DEU: "DE",
  DEN: "DK",
  DNK: "DK",
  NOR: "NO",
  FRA: "FR",
  GBR: "GB",
  AUT: "AT",
  LAT: "LV",
  LVA: "LV",
  LTU: "LT",
  EST: "EE",
  BLR: "BY",
  UKR: "UA",
  KAZ: "KZ",
  ITA: "IT",
  POL: "PL",
  HUN: "HU",
  NED: "NL",
  NLD: "NL",
  CRO: "HR",
  HRV: "HR",
  SRB: "RS",
  ROU: "RO",
  BUL: "BG",
  BGR: "BG",
  AUS: "AU",
  NZL: "NZ",
  JPN: "JP",
  CHN: "CN",
  KOR: "KR",
  BRA: "BR",
  MEX: "MX",
  ISR: "IL",
  GEO: "GE",
  UZB: "UZ",
  RSA: "ZA",
  ZAF: "ZA",
});
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryFlag(p) {
  const code = flagRegions[p?.birthCountry];
  if (!code) return "";
  const emoji = [...code]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
  const label = "Country of birth: " + countryNames.of(code);
  return `<span class="player-flag" role="img" aria-label="${esc(label)}" title="${esc(label)}">${emoji}</span>`;
}
// Verified NHL archive portraits for known missing current-season images.
const archivedPortraits = {
  8480842: {
    missing: "https://assets.nhle.com/mugs/nhl/20262027/EDM/8480842.png",
    image: "https://assets.nhle.com/mugs/nhl/20222023/PIT/8480842.png",
    label: "NHL archive portrait · 2022/23 · Pittsburgh Penguins",
  },
};
function photo(p) {
  const archive = archivedPortraits[p.id];
  const replacement = archive?.missing === p.image ? archive : null;
  const candidate = replacement?.image || p.image;
  const image = failedImages.has(candidate) ? "" : candidate;
  return `<span class="portrait${image ? "" : " is-fallback"}"${replacement ? ` title="${esc(replacement.label)}"` : ""}><span class="portrait-fallback"${image ? " hidden" : ""}>${esc(p.first?.[0] || p.name?.[0] || "?")}${esc(p.last?.[0] || "")}</span>${image ? `<img src="${esc(image)}" alt="${esc(p.name)} portrait${replacement ? ` · ${esc(replacement.label)}` : ""}" decoding="async">` : ""}</span>`;
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
            ? "Loading statistics…"
            : "No game data",
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
let headerScorerIndex = 0;
let headerScorer = null,
  headerScorerState = "loading";
async function loadHeaderScorer(token, signal) {
  headerScorer = null;
  headerScorerIndex = 0;
  headerScorerState = "loading";
  try {
    const data = await getNhl(`club-stats/${team[0]}/now`, signal);
    if (token !== loadToken) return;
    headerScorer = LineStats.teamScorers(data);
    headerScorerState = "live";
  } catch (error) {
    if (signal.aborted || token !== loadToken) return;
    headerScorerState = "error";
  } finally {
    if (token === loadToken) render();
  }
}
function renderHeaderScorer() {
  const target = $("#header-top-scorer");
  if (!headerScorer?.players.length) {
    target.innerHTML = `<span class="header-scorer-message">${headerScorerState === "loading" ? "Loading scoring leader…" : headerScorerState === "error" ? "Scoring leader unavailable" : "No points recorded this season yet"}</span>`;
    return;
  }
  const activeScorer =
    headerScorer.players[headerScorerIndex % headerScorer.players.length];
  const flag = countryFlag(
    players.find((player) => player.id === activeScorer.playerId),
  );
  const key = JSON.stringify([team[0], headerScorer, headerScorerIndex, flag]);
  if (
    target.dataset.scorerKey === key &&
    target.querySelector(".header-scorer-player")
  )
    return;
  target.dataset.scorerKey = key;
  const season =
    headerScorer.season.slice(0, 4) + "/" + headerScorer.season.slice(6);
  target.innerHTML = `<div class="header-scorer-list" tabindex="0" aria-label="Team scoring leaders">${[
    headerScorer.players[headerScorerIndex % headerScorer.players.length],
  ]
    .map((p) => {
      const name = p.firstName.default + " " + p.lastName.default;
      const stats = [
        ["GP", p.gamesPlayed, "Games played"],
        ["G", p.goals, "Goals"],
        ["A", p.assists, "Assists"],
        ["P", p.points, "Points"],
        [
          "+/−",
          Number.isInteger(p.plusMinus)
            ? (p.plusMinus > 0 ? "+" : "") + p.plusMinus
            : "—",
          "Plus/minus",
        ],
        [
          "SOG",
          Number.isInteger(p.shots) && p.shots >= 0 ? p.shots : "—",
          "Shots on goal",
        ],
      ];
      return `<div class="header-scorer-player">${photo({ id: p.playerId, image: assetUrl(p.headshot), first: p.firstName.default, last: p.lastName.default, name })}<div><strong class="header-scorer-name">${esc(name)} ${flag} <span class="scorer-target" role="img" aria-label="Team scoring leader">${uiIcon("target")}</span></strong><span class="header-scorer-caption">Team scoring leader · ${season}${headerScorer.gameType === 3 ? " · playoffs" : ""}${headerScorer.players.length > 1 ? " · tied" : ""}</span><dl class="header-scorer-stats">${stats.map(([label, value, title]) => `<div title="${title}"><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></div></div>`;
    })
    .join("")}</div>`;
}
let scorerTransitioning = false;
setInterval(async () => {
  if (
    document.hidden ||
    scorerTransitioning ||
    !headerScorer ||
    headerScorer.players.length < 2
  )
    return;
  const target = $("#header-top-scorer");
  if (target.matches(":hover") || target.contains(document.activeElement))
    return;
  scorerTransitioning = true;
  const snapshot = headerScorer;
  const nextIndex = (headerScorerIndex + 1) % snapshot.players.length;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    const url = assetUrl(snapshot.players[nextIndex].headshot);
    if (url) {
      const image = new Image();
      image.src = url;
      await Promise.race([
        image.decode().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
    if (snapshot !== headerScorer || document.hidden) return;
    const old = target.querySelector(".header-scorer-player");
    if (old && !reduced)
      await old.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 180,
        fill: "forwards",
        easing: "ease-in",
      }).finished;
    if (snapshot !== headerScorer) return;
    headerScorerIndex = nextIndex;
    renderHeaderScorer();
    if (!reduced)
      await target
        .querySelector(".header-scorer-player")
        .animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 360,
          easing: "ease-out",
        }).finished;
  } finally {
    scorerTransitioning = false;
  }
}, 5000);

function topMark(p) {
  const league = pointLeaders.ids.has(p.id);
  const clubLeader = headerScorer?.players.find(
    (player) => player.playerId === p.id,
  );
  const club = pointLeaders.teamIds?.has(p.id) || !!clubLeader;
  if (!league && !club) return "";
  const label = league
    ? `NHL${club ? " and " + team[1] : ""} scoring leader · ${pointLeaders.points} points`
    : `${team[1]} scoring leader · ${clubLeader?.points ?? pointLeaders.teamPoints} points`;
  return `<span class="top-mark" data-form-help="${esc(label)}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${uiIcon("target")}</span>`;
}
async function loadLeaders(token, signal) {
  pointLeaders = { points: 0, ids: new Set() };
  leadersState = "loading";
  try {
    const data = await DailyPlayerCache.get(
      "nhl:scoring-leaders",
      async () => {
        const response = await fetch("/api/leaders", { signal });
        if (!response.ok) throw Error("Points unavailable");
        return response.json();
      },
      (data) => Array.isArray(data?.points),
    );
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
function injuryLine(p) {
  const injury = injuryFor(p);
  if (!injury) return "";
  const info = LineInjuries.describe(injury);
  return `<span class="player-injury" title="${esc(injury.source)} · ${esc(injury.status)}. The return date is a source estimate, not a confirmed return."><span class="injury-symbol" aria-hidden="true">${uiIcon("bandage")}</span><span class="injury-copy"><span class="injury-type">${esc(info.type)}</span><span class="injury-return">${esc(info.returnLabel)}</span></span></span>`;
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
const playerEmojis = Object.freeze({
  flame: "🔥",
  ice: "🧊",
  bandage: "🩹",
  target: "🎯",
  stick: "🏒",
  catcher: "🪍",
  net: "🥅",
});
function uiIcon(name) {
  return `<span class="ui-emoji" data-icon="${name}" aria-hidden="true">${playerEmojis[name] || ""}</span>`;
}
function badge(s) {
  if (!["hot", "cold"].includes(s.kind)) return "";
  const icons = { hot: uiIcon("flame"), cold: uiIcon("ice") };
  const help = s.goalie
    ? "Weighted save percentage over the last 5 appearances: hot streak at 93% or higher, cold streak below 89%, steady form in between. Requires at least 3 appearances with complete shot data and a latest appearance within 14 days. SV% = total saves / shots faced. GAA = goals allowed per 60 minutes."
    : {
        hot: "At least 3 consecutive games with a point, or at least 7 points in the last 5 games. Only current when the latest game is within 14 days.",
        cold: "No points in each of the last 3 games played. Only current when the latest game is within 14 days.",
        normal:
          "Neither hot-streak nor point-drought criteria are met over the last 5 games. This label is not a performance rating.",
        stale:
          "The latest game is more than 14 days old, so these results do not represent current form.",
        neutral:
          "Verified game logs are not yet available to assess recent form.",
      }[s.kind];
  return `<span class="status-icon form-badge ${s.kind}" role="img" aria-label="${esc(s.label)}" data-form-help="${esc(help)}"><span class="form-icon" aria-hidden="true">${icons[s.kind]}</span></span>`;
}
function portraitBlock(p, s) {
  const injury = injuryFor(p);
  let injuryIcon = "";
  if (injury) {
    const info = LineInjuries.describe(injury);
    const help = `${info.type} · ${info.returnLabel}. Source: ${injury.source}. The return date is an estimate, not a confirmed return.`;
    injuryIcon = `<span class="status-icon injury-icon" role="img" aria-label="${esc(info.type)}" data-form-help="${esc(help)}"><span aria-hidden="true">${uiIcon("bandage")}</span></span>`;
  }
  let hand =
    p.group !== "G" && ["L", "R"].includes(p.shootsCatches)
      ? `<span class="portrait-hand hand-${p.shootsCatches.toLowerCase()}" role="img" aria-label="${p.shootsCatches === "L" ? "Left" : "Right"} shot" data-form-help="${p.shootsCatches === "L" ? "Left" : "Right"} shot"><span aria-hidden="true">${uiIcon("stick")}</span></span>`
      : "";
  if (p.group === "G" && ["L", "R"].includes(p.shootsCatches)) {
    const catchSide = p.shootsCatches.toLowerCase();
    const stickSide = catchSide === "l" ? "r" : "l";
    const stance = catchSide === "l" ? "Regular" : "Full right";
    const gloveHelp = `${stance} stance · ${catchSide === "l" ? "Left" : "Right"} catching hand`;
    const stickHelp = `${stance} stance · ${stickSide === "l" ? "Left" : "Right"} stick hand`;
    hand = `<span class="portrait-hand goalie-glove hand-${catchSide}" role="img" aria-label="${gloveHelp}" data-form-help="${gloveHelp}">${uiIcon("catcher")}</span><span class="portrait-hand goalie-stick hand-${stickSide}" role="img" aria-label="${stickHelp}" data-form-help="${stickHelp}"><span aria-hidden="true">${uiIcon("stick")}</span></span>`;
  }
  return `<span class="player-portrait">${photo(p)}${hand}<span class="portrait-status">${badge(s)}${injuryIcon}${topMark(p)}</span></span>`;
}
function statLine(s) {
  if (!s.count) return "";
  if (s.goalie)
    return `<div class="player-stats goalie-stats">${s.count} GP <span>·</span> <b>${s.pct === null ? "—" : (s.pct * 100).toFixed(1) + "%"} SV</b><br>${s.gaa === null ? "—" : s.gaa.toFixed(2)} GAA${s.wins === null ? "" : ` <span>·</span> ${s.wins}–${s.losses}–${s.overtimeLosses}`}</div>`;
  return `<div class="player-stats">${s.count} GP <span>·</span> ${s.goals} G + ${s.assists} A <span>·</span> <b>${s.points} P</b></div>`;
}
function handText(p) {
  const side =
    p.shootsCatches === "L" ? "Left" : p.shootsCatches === "R" ? "Right" : null;
  if (p.group === "G") {
    const stance =
      p.shootsCatches === "L"
        ? "Regular"
        : p.shootsCatches === "R"
          ? "Full right"
          : "—";
    const help = side
      ? `${stance} stance · ${side.toLowerCase()} catching hand`
      : "Goalie stance unavailable";
    return `<span class="player-handedness shooting-hand goalie-stance" aria-label="${help}" title="${help}"><span aria-hidden="true">${uiIcon("net")}</span> ${stance}${side ? ` · ${side.toLowerCase()} catch` : ""}</span>`;
  }
  const label = side ? `${side} shot` : "Shooting hand unavailable";
  return `<span class="player-handedness shooting-hand" aria-label="${label}" title="${label}"><span aria-hidden="true">${uiIcon("stick")}</span> ${side || "—"}</span>`;
}
function displayPosition(position) {
  return position === "L" ? "LW" : position === "R" ? "RW" : position;
}
function card(id, pairSide) {
  const p = players.find((p) => p.id === id);
  if (!p)
    return `<div class="empty-slot">${loading ? "Loading roster…" : "No player in this position"}</div>`;
  const s = statsFor(p);
  const position = ["LD", "RD"].includes(pairSide)
    ? pairSide
    : displayPosition(p.pos);
  return `<button class="player-card" data-player="${esc(p.id)}" aria-label="${esc(p.name)}${["hot", "cold"].includes(s.kind) ? `, ${esc(s.label)}` : ""}">${portraitBlock(p, s)}<span class="player-copy"><span class="player-meta"><span>#${esc(p.number)}</span><span>${esc(position)}</span></span><span class="player-name"><span class="first-name">${esc(p.first)}</span><span class="last-name">${esc(p.last)}</span> ${countryFlag(p)}</span>${statLine(s)}</span></button>`;
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
let pkData = null,
  pkState = "loading",
  pkError = "";
function specialUnit(ids, index) {
  if (mode !== "pp")
    return `<div class="special-unit pk-unit"><div class="pp-unit-heading"><h3>PK ${index + 1}</h3><span>Box · schematic formation</span></div><div class="special-unit-players pk-box" aria-label="PK ${index + 1}, box formation">${ids.map(card).join("")}</div></div>`;
  const slots = powerPlaySlots(ids);
  return `<div class="special-unit pp-unit"><div class="pp-unit-heading"><h3>PP ${index + 1}</h3><span>Umbrella · schematic formation</span></div><div class="special-unit-players umbrella" aria-label="PP ${index + 1}, umbrella formation"><div class="umbrella-net" aria-hidden="true"></div>${slots.map((slot) => `<div class="pp-position pp-${slot.role}" data-pp-role="${slot.role}">${slot.role === "point" ? `<span class="pp-point-label">Point${slot.defender ? " · defenseman" : ""}</span>` : ""}${slot.id !== undefined ? card(slot.id) : `<span class="pp-missing">Player data unavailable</span>`}</div>`).join("")}</div></div>`;
}
function drawLines() {
  $("#forwards .section-count").textContent = lineData
    ? lineData.forwards.length + " LINES"
    : "AWAITING SOURCE";
  $("#defense .section-count").textContent = lineData
    ? lineData.defense.length + " PAIRS"
    : "AWAITING SOURCE";
  $("#goalies .section-count").textContent = lineData
    ? lineData.goalies.length + " GOALIES"
    : "AWAITING SOURCE";
  const unavailable =
    linesState === "loading"
      ? "Loading published line combinations…"
      : "The feed does not publish line combinations for this section.";
  $("#forward-lines").innerHTML = lineData?.forwards.length
    ? lineData.forwards
        .map(
          (ids, index) =>
            `<div class="line-row"><div class="line-number">${["First line", "Second line", "Checking line", "Energy line"][index] || `Line ${index + 1}`}${ids.length < 3 ? "<small> · INCOMPLETE</small>" : ""}</div>${ids.map(card).join("")}</div>`,
        )
        .join("")
    : noLines(unavailable);
  $("#defense-lines").innerHTML = lineData?.defense.length
    ? lineData.defense
        .map(
          (ids, index) =>
            `<div class="line-row pair-row"><div class="line-number">${["First pair", "Second pair", "Third pair", "Fourth pair"][index] || `Pair ${index + 1}`}</div>${ids.map((id, side) => card(id, side === 0 ? "LD" : "RD")).join("")}</div>`,
        )
        .join("")
    : noLines(unavailable);
  $("#goalie-lines").innerHTML = lineData?.goalies.length
    ? lineData.goalies
        .map(
          (id, i) =>
            `<div class="goalie-slot"><small>${i === 0 ? "Starter" : "Backup"}</small>${card(id)}</div>`,
        )
        .join("")
    : noLines(unavailable);
  $("#special-lines").classList.toggle("powerplay-units", mode === "pp");
  $("#special-heading").textContent =
    mode === "pk" ? "Shorthanded units" : "Power Play units";
  $("#special-symbol").textContent = mode === "pk" ? "PK" : "PP";
  $("#special-lines").classList.toggle("penalty-kill-units", mode === "pk");
  const units =
    mode === "pk"
      ? lineData?.pk?.length
        ? lineData.pk
        : pkData?.units
      : lineData?.pp;
  const pkNote =
    mode === "pk" && !lineData?.pk?.length
      ? `<p class="pk-source-note">${pkData?.units?.length ? `Source: <a href="${PenaltyKill.sourceUrl}" target="_blank" rel="noopener">RotoWire</a> · Retrieved: ${dateLabel(pkData.fetchedAt)}. The source does not publish an update time.` : pkState === "loading" ? "Loading penalty-kill units…" : pkData?.restricted ? "RotoWire restricts this team's PK units to subscribers. Public line combinations are not currently available." : esc(pkError || "Verified penalty-kill units are unavailable.")}</p>`
      : "";
  $("#special-lines").innerHTML =
    mode === "even"
      ? ""
      : units?.length
        ? pkNote + units.map(specialUnit).join("")
        : mode === "pk"
          ? pkNote
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
      " <small>players</small>";
  const hot = players.filter((p) => statsFor(p).kind === "hot").length,
    available = players.some((p) => statsFor(p).count);
  $("#hot-count").innerHTML = available
    ? `${hot} <small>${hot === 1 ? "player" : "players"}</small>`
    : "— <small>no data</small>";
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
  $("#forwards-heading").textContent = "Forward lines";
  const age = lineData ? Date.now() - Date.parse(lineData.updated) : 0;
  $("#line-source-status").textContent =
    linesState === "loading"
      ? "Loading published line combinations…"
      : lineData
        ? `${linesState === "live" ? "Feed updated" : "Saved feed"}: ${dateLabel(lineData.updated)} · Between the Lines, original source: Daily Faceoff. ${age > 36 * 3600000 ? "Warning: data is more than 36 hours old. " : ""}${linesState === "error" ? linesError : "Updated several times daily; not live game tracking."}`
        : linesError;
  $("#line-source-status").title = $("#line-source-status").textContent;
  if (lineData && linesState !== "loading") {
    $("#line-source-status").textContent =
      `${linesState === "live" ? "Feed updated" : "Saved feed"}: ${dateLabel(lineData.updated)} · DFO${age > 36 * 3600000 ? " · Older data" : ""}${linesState === "error" ? " · Refresh failed" : ""}`;
  }
  $("#line-source-link").href =
    lineData?.sourceUrl ||
    "https://github.com/hg913488/nhl-line-combos-app/blob/main/data/lines.json";
  $("#line-source-link").textContent = "Lineup source ↗";
  if (formTooltipAnchor && !formTooltipAnchor.isConnected) hideFormHelp();
  window.LineMotion?.refresh();
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
  renderHeaderScorer();
  drawLines();
  $("#leaders-status").textContent =
    leadersState === "live"
      ? "🔝 Team and NHL scoring leaders · current season"
      : leadersState === "loading"
        ? "Loading NHL scoring leaders…"
        : "NHL scoring leaders unavailable";
  $("#injury-status").textContent =
    injuryState === "live"
      ? `🩹 Injury report: ESPN · ${dateLabel(injuryCheckedAt)}`
      : injuryState === "loading"
        ? "Loading injury report…"
        : "Injury data unavailable · an absent marker does not confirm a healthy status";
  if ($("#player-dialog").open && players.some((p) => p.id === selected))
    renderDetail();
}
let nhlRetryAt = 0,
  nhlRetryTimer = null;
function limitedNhlError() {
  const error = Error("The NHL is temporarily rate-limiting requests.");
  error.rateLimited = true;
  return error;
}
async function getNhl(path, signal) {
  const valid = (data) =>
    data &&
    !data.error &&
    (path.startsWith("roster/") || path.startsWith("prospects/")
      ? ["forwards", "defensemen", "goalies"].every((key) =>
          Array.isArray(data[key]),
        )
      : path.startsWith("club-stats/")
        ? Array.isArray(data.skaters)
        : path.startsWith("player/")
          ? Array.isArray(data.gameLog)
          : Array.isArray(data.points));
  try {
    const data = await DailyPlayerCache.get(
      "nhl:" + path,
      () => getNhlUncached(path, signal),
      valid,
    );
    signal?.throwIfAborted();
    return data;
  } catch (error) {
    // A team switch may abort another caller sharing this request.
    if (error.name === "AbortError" && !signal?.aborted)
      return getNhl(path, signal);
    throw error;
  }
}
async function getNhlUncached(path, signal) {
  if (Date.now() < nhlRetryAt) throw limitedNhlError();
  const res = await fetch("/api/nhl?path=" + encodeURIComponent(path), {
    signal,
  });
  if (res.headers.get("X-Upstream-Status") === "429" || res.status === 429) {
    const seconds = Number(res.headers.get("Retry-After"));
    nhlRetryAt =
      Date.now() +
      (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60) *
        1000;
    clearTimeout(nhlRetryTimer);
    nhlRetryTimer = setTimeout(
      () => {
        if (!document.hidden && !loading) loadTeam();
      },
      Math.max(0, nhlRetryAt - Date.now()) + 200,
    );
    throw limitedNhlError();
  }
  if (!res.ok)
    throw Error("The NHL data source is unavailable (" + res.status + ").");
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
      "The published lineup feed is temporarily unavailable (HTTP " +
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
  pkData = null;
  pkState = "loading";
  pkError = "";
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
  if (lineData) lineData = PublishedLines.reconcile(lineData, players);
  linesFetchedAt = previous?.linesFetchedAt || null;
  applyTheme();
  loadInjuries(token, signal);
  loadLeaders(token, signal);
  loadHeaderScorer(token, signal);
  render();
  // Restore saved statistics while the independently refreshed lineup loads.
  if (players.length)
    restoreForms(players, token, signal).then(() => {
      if (token === loadToken && !signal.aborted) render();
    });
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
    lineData = PublishedLines.reconcile(lineData, players);
    const unresolved = new Set(lineData.extra.map((p) => p.id));
    players = players.filter((p) => !p.unmatched || unresolved.has(p.id));
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
  loading = false;
  persist();
  render();
  const forms = loadForms(token, signal);
  loadPenaltyKill(token, signal);
  loadProspectMatches(token, signal, forms);
}
async function loadProspectMatches(token, signal, initialForms) {
  if (!lineData?.extra.length) return;
  try {
    const roster = parseRoster(await getNhl(`prospects/${team[0]}`, signal));
    if (token !== loadToken || signal.aborted || !lineData) return;
    const resolved = PublishedLines.reconcile(lineData, [
      ...players,
      ...roster,
    ]);
    const ids = new Set(sourcePlayers(resolved));
    const known = new Set(players.map((p) => p.id));
    const matches = roster.filter((p) => ids.has(p.id) && !known.has(p.id));
    if (!matches.length) return;
    const unresolved = new Set(resolved.extra.map((p) => p.id));
    players = players.filter((p) => !p.unmatched || unresolved.has(p.id));
    players.push(...matches.map((p) => ({ ...p, prospect: true })));
    lineData = resolved;
    persist();
    render();
    await initialForms;
    if (token === loadToken && !signal.aborted)
      await loadForms(token, signal, matches);
  } catch {
    // Keep the published name when no verified prospect record is available.
  }
}
async function loadPenaltyKill(token, signal) {
  try {
    const response = await fetch("/api/penalty-kill", { signal });
    if (!response.ok)
      throw Error("The PK data source is temporarily unavailable.");
    const html = await response.text();
    if (token !== loadToken) return;
    if (html.length > 2000000)
      throw Error("The PK source response is too large.");
    pkData = {
      ...PenaltyKill.parse(html, players, team[0]),
      fetchedAt: Date.now(),
    };
    pkState = "live";
  } catch (error) {
    if (token !== loadToken) return;
    pkState = "error";
    pkError = error.message;
  }
  if (token === loadToken) drawLines();
}
async function restoreForms(roster, token, signal) {
  await Promise.all(
    roster
      .filter((p) => Number.isSafeInteger(p.id))
      .map(async (p) => {
        const raw = await DailyPlayerCache.read(
          `nhl:player/${p.id}/game-log/now`,
          (data) => Array.isArray(data?.gameLog),
        );
        if (raw && token === loadToken && !signal.aborted)
          gameCache.set(p.id, { games: raw.gameLog, at: Date.now() });
      }),
  );
}
async function loadForms(token, signal, candidates = players) {
  await restoreForms(candidates, token, signal);
  if (token !== loadToken || signal.aborted) return;
  const queue = candidates
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
        if (!Array.isArray(raw.gameLog)) throw Error("Invalid game log");
        if (token === loadToken)
          gameCache.set(p.id, { games: raw.gameLog, at: Date.now() });
      } catch (e) {
        if (e.rateLimited) {
          queue.length = 0;
          pendingForms.clear();
        }
      } finally {
        running.delete(p.id);
        if (token === loadToken) {
          pendingForms.delete(p.id);
          render();
        }
      }
      if (queue.length && !signal.aborted)
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker));
}
function selectPlayer(id) {
  selected = id;
  renderDetail();
  $("#player-dialog").showModal();
}
function renderDetail() {
  const p = players.find((p) => p.id === selected);
  if (!p) return;
  const s = statsFor(p);
  $("#dialog-role").textContent =
    p.group === "G" ? "GOALIE PROFILE" : "PLAYER PROFILE";
  const empty = `<div class="detail-empty">No game log is currently available for this player. The next refresh will try the NHL source again.</div>`;
  const summary = s.count
    ? s.goalie
      ? `<div class="detail-stats"><div><strong>${s.count}</strong><span>GAMES</span></div><div><strong>${s.pct === null ? "—" : (s.pct * 100).toFixed(1) + "%"}</strong><span>SAVE PERCENTAGE</span></div><div><strong>${s.gaa === null ? "—" : s.gaa.toFixed(2)}</strong><span>GOALS ALLOWED / 60 MIN</span></div></div>`
      : `<div class="detail-stats"><div><strong>${s.goals}</strong><span>GOALS</span></div><div><strong>${s.assists}</strong><span>ASSISTS</span></div><div><strong>${s.points}</strong><span>POINTS</span></div></div>`
    : empty;
  const rows = s.games
    .map(
      (g) =>
        `<tr><td>${esc(g.gameDate)}</td><td>${esc(g.opponentAbbrev || "—")}</td>${s.goalie ? `<td>${esc(g.shotsAgainst ?? "—")}</td><td>${esc(g.goalsAgainst ?? "—")}</td><td>${Number.isFinite(g.savePctg) ? (g.savePctg * 100).toFixed(1) + "%" : "—"}</td>` : `<td>${g.goals}</td><td>${g.assists}</td><td class="point-cell">${g.goals + g.assists}</td>`}</tr>`,
    )
    .join("");
  $("#player-detail").innerHTML =
    `<div class="detail-identity">${portraitBlock(p, s)}<div><span class="player-meta">#${esc(p.number)} · ${esc(displayPosition(p.pos))} · ${esc(team[0])}</span><h2 id="player-title">${esc(p.name)} ${countryFlag(p)} ${topMark(p)}</h2>${handText(p)}${injuryLine(p)}</div></div><div class="detail-label">LAST ${s.count || 5} GAMES <span>${s.kind === "stale" ? "Previous results" : "NHL game log"}</span></div>${summary}${s.count ? `<table class="game-log"><thead><tr><th>DATE</th><th>OPPONENT</th><th>${s.goalie ? "SHOTS" : "G"}</th><th>${s.goalie ? "GOALS ALLOWED" : "A"}</th><th>${s.goalie ? "SV%" : "P"}</th></tr></thead><tbody>${rows}</tbody></table>` : ""}<p class="small-muted">${s.streak >= 3 ? `${s.streak} consecutive games with a point. ` : ""}Source: NHL. ${p.image ? "Portrait: NHL." : "Portrait unavailable."}</p>`;
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
for (const [id, offset] of [
  ["previous-mode", -1],
  ["next-mode", 1],
]) {
  $("#" + id).addEventListener("click", () => {
    const modes = ["even", "pp", "pk"];
    chooseMode(
      modes[(modes.indexOf(mode) + offset + modes.length) % modes.length],
    );
  });
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
  const index = teams.findIndex((t) => t[0] === team[0]);
  for (const [id, offset, label] of [
    ["previous-team", -1, "Previous team"],
    ["next-team", 1, "Next team"],
  ]) {
    const name = teams[(index + offset + teams.length) % teams.length][1];
    $("#" + id).setAttribute("aria-label", `${label}: ${name}`);
    $("#" + id).title = `${label}: ${name}`;
  }
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
for (const [id, offset] of [
  ["previous-team", -1],
  ["next-team", 1],
]) {
  $("#" + id).addEventListener("click", (event) => {
    const index = teams.findIndex((t) => t[0] === team[0]);
    selectTeam(teams[(index + offset + teams.length) % teams.length][0]);
    event.currentTarget.focus({ preventScroll: true });
  });
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
window.addEventListener("resize", fitTeamTitle);
if (typeof ResizeObserver !== "undefined") {
  let previousTitleWidth = -1;
  new ResizeObserver(([entry]) => {
    if (Math.abs(entry.contentRect.width - previousTitleWidth) > 0.5) {
      previousTitleWidth = entry.contentRect.width;
      fitTeamTitle();
    }
  }).observe($(".team-title-row"));
}
function positionTeamMenu() {
  const menu = $("#team-menu");
  if (!menu.open) return;
  const anchor = menu.querySelector("summary").getBoundingClientRect();
  const panel = menu.querySelector(".picker-content");
  const width = Math.min(640, innerWidth - 32);
  const top = Math.max(8, Math.min(anchor.bottom + 8, innerHeight - 180));
  panel.style.width = width + "px";
  panel.style.left =
    Math.max(16, Math.min(anchor.left, innerWidth - width - 16)) + "px";
  panel.style.top = top + "px";
  panel.style.maxHeight = Math.max(160, innerHeight - top - 16) + "px";
}
$("#team-menu").addEventListener("toggle", positionTeamMenu);
window.addEventListener("resize", positionTeamMenu);
window.addEventListener("scroll", positionTeamMenu, { passive: true });
document.addEventListener("click", (event) => {
  if (!event.target.closest("#team-menu")) $("#team-menu").open = false;
});
$("#team-menu").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("#team-menu").open = false;
    $("#team-menu summary").focus();
  }
});
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
