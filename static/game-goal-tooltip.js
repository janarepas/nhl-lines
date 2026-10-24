/* Goal details share the score response; missing details load only on interaction. */
(function (root) {
  const cache = new Map(),
    pending = new Map();
  let retryAt = 0;
  const escape = (value) =>
    String(value ?? "").replace(
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
  function valid(details, game) {
    if (
      !details ||
      details.gameId !== game.id ||
      !["LIVE", "CRIT", "FINAL", "OFF"].includes(details.state)
    )
      return false;
    return ["away", "home"].every((side) => {
      const team = details[side];
      if (
        team?.code !== game[side].code ||
        !Number.isInteger(team.score) ||
        team.score < 0 ||
        !Array.isArray(team.scorers) ||
        team.scorers.length > 30 ||
        typeof team.complete !== "boolean"
      )
        return false;
      const seen = new Set();
      const identitiesValid = team.scorers.every((p) => {
        if (
          !Number.isSafeInteger(p?.playerId) ||
          p.playerId <= 0 ||
          seen.has(p.playerId) ||
          typeof p.name !== "string" ||
          !p.name.trim() ||
          p.name.length > 150 ||
          !Number.isInteger(p.goals) ||
          p.goals <= 0 ||
          p.goals > 30
        )
          return false;
        seen.add(p.playerId);
        return true;
      });
      if (!identitiesValid) return false;
      const total = team.scorers.reduce((sum, p) => sum + p.goals, 0);
      const expected =
        team.score -
        (details.shootout &&
        team.score > details[side === "away" ? "home" : "away"]?.score
          ? 1
          : 0);
      return total <= expected && (!team.complete || total === expected);
    });
  }
  function matches(details, game) {
    return (
      details.away.score === game.away.score &&
      details.home.score === game.home.score
    );
  }
  async function load(game) {
    const now = Date.now(),
      previous = cache.get(game.id);
    if (
      previous &&
      now - previous.fetched < previous.ttl &&
      (!previous.saved || now - previous.at <= 86400000)
    ) {
      if (previous.error) throw Error(previous.error);
      return previous;
    }
    if (now < retryAt)
      throw Error("Goal scorers unavailable. Try again later.");
    if (!pending.has(game.id)) {
      const request = (async () => {
        try {
          const response = await fetch(`/api/game-goals?game=${game.id}`, {
            signal: AbortSignal.timeout?.(8000),
          });
          if (
            response.status === 429 ||
            response.headers.get("X-Upstream-Status") === "429" ||
            response.headers.has("Retry-After")
          ) {
            const header = response.headers.get("Retry-After"),
              seconds = /^\d+$/.test(header || "")
                ? Number(header)
                : Math.ceil((Date.parse(header) - Date.now()) / 1000);
            retryAt =
              Date.now() +
              (Number.isFinite(seconds) && seconds > 0
                ? Math.min(seconds, 3600)
                : 60) *
                1000;
          }
          if (!response.ok)
            throw Error("Goal scorers unavailable. Try again later.");
          const details = await response.json();
          if (!valid(details, game))
            throw Error("Goal scorers unavailable. Try again later.");
          const saved = response.headers.get("X-Data-State") === "stale",
            sourceAt = Date.parse(response.headers.get("X-NHL-Checked-At"));
          if (
            saved &&
            (!Number.isFinite(sourceAt) ||
              Date.now() - sourceAt > 86400000 ||
              sourceAt > Date.now())
          )
            throw Error("Saved goal details have expired.");
          const record = {
            details,
            saved,
            at: Number.isFinite(sourceAt) ? sourceAt : Date.now(),
            fetched: Date.now(),
            ttl:
              ["OFF", "FINAL"].includes(details.state) &&
              details.away.complete &&
              details.home.complete
                ? 21600000
                : 60000,
          };
          cache.set(game.id, record);
          return record;
        } catch (error) {
          cache.set(game.id, {
            error: error.message,
            fetched: Date.now(),
            ttl: Math.max(60000, retryAt - Date.now()),
          });
          throw error;
        }
      })();
      pending.set(game.id, request);
      request
        .finally(() => {
          if (pending.get(game.id) === request) pending.delete(game.id);
        })
        .catch(() => {});
    }
    return pending.get(game.id);
  }
  function mount(section, getState) {
    let anchor = null,
      timer = null,
      pinned = false,
      token = 0,
      suppressFocus = false;
    const panel = document.createElement("aside");
    panel.id = "game-goal-tooltip";
    panel.hidden = true;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Goal scorers");
    panel.setAttribute("aria-live", "polite");
    document.body.appendChild(panel);
    const gameFor = (button) =>
      getState().games.find(
        (game) =>
          game.id === Number(button.dataset.game) &&
          [game.away.code, game.home.code].includes(button.dataset.team),
      );
    const score = (target) =>
      target?.closest?.("button.game-score[data-game][data-team]");
    function position() {
      if (!anchor || panel.hidden) return;
      const box = anchor.getBoundingClientRect(),
        width = panel.offsetWidth,
        height = panel.offsetHeight,
        gap = 8,
        edge = 12;
      panel.style.left =
        Math.max(
          edge,
          Math.min(
            innerWidth - width - edge,
            box.left + box.width / 2 - width / 2,
          ),
        ) + "px";
      const top =
        box.bottom + gap + height <= innerHeight - edge
          ? box.bottom + gap
          : box.top - height - gap;
      panel.style.top =
        Math.max(edge, Math.min(innerHeight - height - edge, top)) + "px";
    }
    function close(restoreFocus = false) {
      clearTimeout(timer);
      token++;
      const previous = anchor;
      if (previous) previous.setAttribute("aria-expanded", "false");
      anchor = null;
      pinned = false;
      panel.hidden = true;
      if (restoreFocus && previous?.isConnected) {
        suppressFocus = true;
        previous.focus({ preventScroll: true });
        suppressFocus = false;
      }
    }
    function later() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (
          !pinned &&
          document.activeElement !== anchor &&
          !panel.contains(document.activeElement) &&
          !panel.matches(":hover") &&
          !anchor?.matches(":hover")
        )
          close();
      }, 160);
    }
    function draw(game, teamCode, record, message) {
      const details = record?.details,
        team =
          details &&
          [details.away, details.home].find((t) => t.code === teamCode);
      const sameScore = details && matches(details, game);
      let body = "",
        state = message || "";
      if (details && !sameScore)
        state = "Goal details are updating to match the score.";
      else if (team) {
        if (team.scorers.length)
          body = `<ul class="goal-popover-list">${team.scorers.map((p) => `<li><span>${escape(p.name)}</span><strong>${p.goals}</strong></li>`).join("")}</ul>`;
        else if (team.complete)
          state = details.shootout
            ? "No regulation or overtime goals."
            : "No goals scored.";
        if (!team.complete)
          state =
            message ||
            "Goal details incomplete. Only verified scorers are shown.";
        if (details.shootout)
          state += `${state ? " " : ""}The shootout deciding score is not a player goal.`;
      }
      if (record?.saved) state += `${state ? " " : ""}Saved NHL goal details.`;
      panel.innerHTML = `<h3 class="goal-popover-title">${escape(teamCode)} goal scorers</h3>${body}${state ? `<p class="goal-popover-state">${escape(state)}</p>` : ""}<p class="goal-popover-source"><a href="https://www.nhl.com/gamecenter/${game.id}" target="_blank" rel="noopener">NHL game report</a></p>`;
      position();
    }
    async function open(button, pin = false) {
      if (document.hidden) return;
      const game = gameFor(button);
      if (
        !game ||
        ["FUT", "PRE"].includes(game.state) ||
        ![game.away, game.home].some(
          (team) =>
            team.code === button.dataset.team && Number.isInteger(team.score),
        )
      )
        return;
      clearTimeout(timer);
      if (anchor && anchor !== button)
        anchor.setAttribute("aria-expanded", "false");
      anchor = button;
      pinned = pin;
      const current = ++token,
        state = getState(),
        embedded = game.goalDetails;
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-controls", panel.id);
      panel.hidden = false;
      const validEmbedded = valid(embedded, game) && matches(embedded, game);
      const record = validEmbedded
        ? { details: embedded, saved: state.stale, at: state.at }
        : null;
      const selected =
        validEmbedded &&
        [embedded.away, embedded.home].find(
          (team) => team.code === button.dataset.team,
        );
      draw(
        game,
        button.dataset.team,
        record,
        selected?.complete ? "" : "Loading goal scorers…",
      );
      if (selected?.complete) return;
      try {
        const loaded = await load(game);
        if (current === token && anchor === button && !panel.hidden)
          draw(gameFor(button) || game, button.dataset.team, loaded);
      } catch (error) {
        if (current === token && anchor === button && !panel.hidden)
          draw(
            game,
            button.dataset.team,
            record,
            record
              ? "Goal details incomplete. More scorers are temporarily unavailable."
              : error.message,
          );
      }
    }
    section.addEventListener("pointerover", (event) => {
      if (event.pointerType === "touch") return;
      const button = score(event.target);
      if (button && button !== score(event.relatedTarget) && !pinned)
        open(button);
    });
    section.addEventListener("pointerout", (event) => {
      if (score(event.target) && !score(event.relatedTarget)) later();
    });
    section.addEventListener("focusin", (event) => {
      const button = score(event.target);
      if (button && !suppressFocus) open(button);
    });
    section.addEventListener("focusout", later);
    section.addEventListener("click", (event) => {
      const button = score(event.target);
      if (!button) return;
      event.preventDefault();
      if (anchor === button && pinned) close();
      else open(button, true);
    });
    panel.addEventListener("pointerenter", () => clearTimeout(timer));
    panel.addEventListener("pointerleave", later);
    panel.addEventListener("focusin", () => clearTimeout(timer));
    panel.addEventListener("focusout", later);
    document.addEventListener("pointerdown", (event) => {
      if (anchor && !panel.contains(event.target) && !score(event.target))
        close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        event.preventDefault();
        close(panel.contains(document.activeElement));
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) close();
    });
    root.addEventListener("resize", position, { passive: true });
    root.addEventListener("scroll", position, { passive: true });
    return {
      close,
      refresh() {
        if (!anchor) return;
        if (!anchor.isConnected || !gameFor(anchor)) close();
        else open(anchor, pinned);
      },
    };
  }
  root.GameGoalPopover = { mount };
})(globalThis);
