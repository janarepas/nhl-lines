/* NHL game-day scores. No per-second clocks, hidden-tab polling or player-cache use. */
(function (root) {
  // Reuse locale formatters across score cards and visibility refreshes.
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formats = new Map();
  function formatter(kind, zone, options) {
    const key = kind + ":" + zone;
    if (!formats.has(key)) {
      if (formats.size >= 16) formats.delete(formats.keys().next().value);
      formats.set(
        key,
        new Intl.DateTimeFormat("en-GB", { ...options, timeZone: zone }),
      );
    }
    return formats.get(key);
  }
  function day(now = new Date(), zone = localZone) {
    const parts = formatter("day", zone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type) => parts.find((p) => p.type === type).value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  }
  function normalize(raw) {
    if (!raw?.currentDate || !Array.isArray(raw.games)) return raw;
    return {
      date: raw.currentDate,
      games: raw.games.map((g) => ({
        id: g.id,
        start: g.startTimeUTC,
        state: g.gameState,
        scheduleState: g.gameScheduleState || "OK",
        away: {
          code: g.awayTeam?.abbrev,
          score: Number.isInteger(g.awayTeam?.score) ? g.awayTeam.score : null,
        },
        home: {
          code: g.homeTeam?.abbrev,
          score: Number.isInteger(g.homeTeam?.score) ? g.homeTeam.score : null,
        },
        period: g.periodDescriptor?.number || null,
        periodType: g.periodDescriptor?.periodType || "",
        clock: g.clock?.timeRemaining || "",
        intermission: g.clock?.inIntermission === true,
        outcome: g.gameOutcome?.lastPeriodType || "",
      })),
    };
  }
  function valid(data, date) {
    return (
      data?.date === date &&
      Array.isArray(data.games) &&
      data.games.length <= 20 &&
      new Set(data.games.map((g) => g.id)).size === data.games.length &&
      data.games.every(
        (g) =>
          Number.isSafeInteger(g.id) &&
          Number.isFinite(Date.parse(g.start)) &&
          ["FUT", "PRE", "LIVE", "CRIT", "FINAL", "OFF"].includes(g.state) &&
          [g.away, g.home].every(
            (t) =>
              /^[A-Z]{2,3}$/.test(t?.code) &&
              (t.score === null || (Number.isInteger(t.score) && t.score >= 0)),
          ),
      )
    );
  }
  const live = (g) => ["LIVE", "CRIT"].includes(g.state);
  function status(game, zone) {
    if (game.scheduleState === "PPD") return "Postponed";
    if (game.scheduleState === "CNCL") return "Cancelled";
    if (["OFF", "FINAL"].includes(game.state))
      return (
        "Final" +
        (["OT", "SO"].includes(game.outcome) ? ` · ${game.outcome}` : "")
      );
    if (live(game)) {
      const period =
        game.periodType === "SO"
          ? "SO"
          : game.periodType === "OT"
            ? "OT"
            : game.period
              ? `P${game.period}`
              : "Live";
      return (
        period +
        (game.intermission
          ? " · Intermission"
          : game.clock
            ? ` · ${game.clock}`
            : "")
      );
    }
    // Include the local date: an NHL game day can start the next day in Europe.
    return formatter("start", zone, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(game.start));
  }
  function interval(data) {
    if (data?.games.some(live)) return 60000;
    if (data?.games.some((g) => ["FUT", "PRE"].includes(g.state)))
      return 300000;
    return 900000;
  }
  function mount() {
    const section = document.querySelector("#daily-games");
    if (!section) return;
    const escape = (text) =>
      String(text).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    const zone = localZone;
    let visible = true,
      timer = null,
      active = null,
      data = null,
      checked = 0,
      failed = false;
    const schedule = () => {
      clearTimeout(timer);
      timer = null;
      if (!document.hidden && visible && !active)
        timer = setTimeout(
          load,
          Math.max(
            1000,
            checked + (failed ? 300000 : interval(data)) - Date.now(),
          ),
        );
    };
    function render() {
      const date = data?.date || day();
      LineDOM.text(
        "#games-date",
        `${formatter("heading", zone, { day: "2-digit", month: "short" }).format(new Date(date + "T12:00:00"))}`,
      );
      LineDOM.text(
        "#games-updated",
        failed ? "Refresh unavailable" : "",
      );
      if (!data) {
        LineDOM.update(
          "#games-list",
          `<p class="games-message">${failed ? 'Scores unavailable.<button class="games-retry" type="button">Retry</button>' : "Loading today's games…"}</p>`,
        );
        return;
      }
      LineDOM.update(
        "#games-list",
        data.games.length
          ? data.games
              .map((g) => {
                const label = status(g, zone);
                const side = (t) =>
                  `<span class="game-team"><img src="https://assets.nhle.com/logos/nhl/svg/${t.code}_${document.documentElement.dataset.theme === "dark" ? "dark" : "light"}.svg" alt="" loading="lazy" decoding="async" width="19" height="19">${t.code}</span><strong class="game-score">${t.score === null || ["FUT", "PRE"].includes(g.state) ? "—" : t.score}</strong>`;
                return `<a class="game-card${live(g) ? " is-live" : ""}" href="https://www.nhl.com/gamecenter/${g.id}" target="_blank" rel="noopener" aria-label="${escape(`${g.away.code} at ${g.home.code}, ${g.away.score !== null && g.home.score !== null && !["FUT", "PRE"].includes(g.state) ? `${g.away.score}–${g.home.score}, ` : ""}${label}`)}">${side(g.away)}${side(g.home)}<span class="game-status">${escape(label)}</span></a>`;
              })
              .join("")
          : '<p class="games-message">No NHL games scheduled for this game day.</p>',
      );
    }
    async function load() {
      if (document.hidden || !visible || active) return;
      clearTimeout(timer);
      timer = null;
      const date = day();
      if (data && data.date !== date) {
        data = null;
        render();
      }
      const controller = new AbortController();
      active = controller;
      const timeout = setTimeout(() => controller.abort(), 18000);
      try {
        const response = await fetch(`/api/games?date=${date}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw Error("Scores unavailable");
        const result = normalize(await response.json());
        if (!valid(result, date)) throw Error("Invalid scores");
        data = result;
        failed = false;
      } catch {
        failed = true;
      } finally {
        clearTimeout(timeout);
        active = null;
        checked = Date.now();
        if (!document.hidden) render();
        schedule();
      }
    }
    section.addEventListener("click", (event) => {
      if (event.target.closest(".games-retry")) load();
    });
    const resume = () => {
      if (!document.hidden && visible) render();
      if (
        !document.hidden &&
        visible &&
        (!checked ||
          day() !== data?.date ||
          Date.now() - checked >= interval(data))
      )
        load();
      else schedule();
    };
    document.addEventListener("visibilitychange", resume);
    if (typeof IntersectionObserver === "function") {
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        resume();
      });
      observer.observe(section);
    }
    load();
  }
  root.GameScores = { day, normalize, valid, status, interval, mount };
})(globalThis);
