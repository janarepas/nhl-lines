/* Small shared adapter for verified NHL score and game-center goal events. */
(function (root) {
  const states = ["FUT", "PRE", "LIVE", "CRIT", "FINAL", "OFF"];
  const periodTypes = ["REG", "OT", "SO"];
  function normalize(raw, gameId, scoreFeed) {
    if (
      !Number.isSafeInteger(gameId) ||
      !/^20\d{8}$/.test(String(gameId)) ||
      raw?.id !== gameId ||
      !states.includes(raw.gameState)
    )
      throw Error("Invalid NHL game identity.");
    const makeTeam = (team) => {
      if (
        !/^[A-Z]{2,3}$/.test(team?.abbrev) ||
        (team.score != null &&
          (!Number.isSafeInteger(team.score) || team.score < 0))
      )
        throw Error("Invalid NHL goal team.");
      return {
        code: team.abbrev,
        score: team.score ?? null,
        scorers: [],
        complete: false,
      };
    };
    const away = makeTeam(raw.awayTeam),
      home = makeTeam(raw.homeTeam);
    if (away.code === home.code) throw Error("Invalid NHL opponents.");
    const scoring = scoreFeed ? raw.goals : raw.summary?.scoring;
    if (scoring != null && (!Array.isArray(scoring) || scoring.length > 200))
      throw Error("Invalid NHL scoring events.");
    const periods = scoreFeed ? [] : scoring || [];
    if (periods.length > 20) throw Error("Invalid NHL scoring periods.");
    const lastPeriod =
      raw.gameOutcome?.lastPeriodType ||
      raw.periodDescriptor?.periodType ||
      periods.at(-1)?.periodDescriptor?.periodType;
    const outcome = periodTypes.includes(lastPeriod) ? lastPeriod : "";
    const shootout =
      outcome === "SO" ||
      (scoring || []).some(
        (item) => item?.periodDescriptor?.periodType === "SO",
      );
    const teams = new Map([
        [away.code, away],
        [home.code, home],
      ]),
      counts = new Map([
        [away.code, new Map()],
        [home.code, new Map()],
      ]),
      invalid = new Set(),
      events = new Set(),
      identities = new Map();
    const incomplete = () => {
      invalid.add(away.code);
      invalid.add(home.code);
    };
    const text = (value) =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= 100 &&
      !/[\u0000-\u001f\u007f]/.test(value)
        ? value.trim()
        : "";
    const started = ["LIVE", "CRIT", "FINAL", "OFF"].includes(raw.gameState),
      finished = ["FINAL", "OFF"].includes(raw.gameState);
    let goalCount = 0;
    const goals = [];
    if (started && scoreFeed) {
      for (const goal of scoring || [])
        goals.push({ goal, descriptor: goal?.periodDescriptor });
      // Published cumulative scores order events independently of response order.
      goals.sort(
        (a, b) =>
          a.goal?.awayScore +
          a.goal?.homeScore -
          (b.goal?.awayScore + b.goal?.homeScore),
      );
    } else if (started) {
      for (const period of periods) {
        if (!Array.isArray(period?.goals)) {
          incomplete();
          continue;
        }
        for (const goal of period.goals)
          goals.push({ goal, descriptor: period.periodDescriptor });
      }
    }
    let previousAway = 0,
      previousHome = 0;
    for (const { goal, descriptor } of goals) {
      if (
        !Number.isInteger(descriptor?.number) ||
        descriptor.number < 1 ||
        !periodTypes.includes(descriptor.periodType)
      ) {
        incomplete();
        continue;
      }
      // A shootout attempt and its deciding scoreboard point are not NHL goals.
      if (descriptor.periodType === "SO") continue;
      if (++goalCount > 200) throw Error("Invalid NHL goal count.");
      const code = scoreFeed ? goal?.teamAbbrev : goal?.teamAbbrev?.default;
      if (!teams.has(code)) {
        incomplete();
        continue;
      }
      if (scoreFeed) {
        if (
          !Number.isSafeInteger(goal.awayScore) ||
          goal.awayScore < 0 ||
          !Number.isSafeInteger(goal.homeScore) ||
          goal.homeScore < 0
        ) {
          incomplete();
          continue;
        }
        const awayDelta = goal.awayScore - previousAway,
          homeDelta = goal.homeScore - previousHome,
          key = goal.awayScore + ":" + goal.homeScore;
        if (events.has(key)) throw Error("Duplicate NHL scoring progression.");
        events.add(key);
        previousAway = goal.awayScore;
        previousHome = goal.homeScore;
        if (
          (code === away.code && (awayDelta !== 1 || homeDelta !== 0)) ||
          (code === home.code && (homeDelta !== 1 || awayDelta !== 0))
        ) {
          incomplete();
          continue;
        }
      } else {
        if (
          !Number.isSafeInteger(goal.eventId) ||
          goal.eventId <= 0 ||
          events.has(goal.eventId)
        ) {
          invalid.add(code);
          continue;
        }
        events.add(goal.eventId);
      }
      const first = text(goal.firstName?.default),
        last = text(goal.lastName?.default),
        name = first && last ? first + " " + last : text(goal.name?.default);
      if (
        !Number.isSafeInteger(goal.playerId) ||
        goal.playerId < 100000 ||
        goal.playerId > 999999999 ||
        !name
      ) {
        invalid.add(code);
        continue;
      }
      const identity = identities.get(goal.playerId);
      if (identity && (identity.code !== code || identity.name !== name)) {
        incomplete();
        continue;
      }
      identities.set(goal.playerId, { code, name });
      const scorers = counts.get(code),
        scorer = scorers.get(goal.playerId);
      if (scorer) scorer.goals++;
      else
        scorers.set(goal.playerId, { playerId: goal.playerId, name, goals: 1 });
    }
    const shootoutDecision =
      shootout &&
      finished &&
      away.score !== null &&
      home.score !== null &&
      Math.abs(away.score - home.score) === 1;
    for (const team of [away, home]) {
      team.scorers = [...counts.get(team.code).values()];
      const total = team.scorers.reduce((n, scorer) => n + scorer.goals, 0),
        decidingPoint =
          shootoutDecision && team.score > Math.min(away.score, home.score)
            ? 1
            : 0,
        expected = team.score === null ? null : team.score - decidingPoint;
      if (started && expected !== null && total > expected)
        throw Error("NHL scorer totals exceed the verified score.");
      team.complete =
        started &&
        Array.isArray(scoring) &&
        !invalid.has(team.code) &&
        expected !== null &&
        total === expected &&
        (!shootout || !finished || shootoutDecision);
    }
    return {
      gameId,
      state: raw.gameState,
      outcome,
      shootout,
      source: "NHL",
      sourceUrl: `https://www.nhl.com/gamecenter/${gameId}`,
      away,
      home,
    };
  }
  root.GameGoalData = {
    normalizeLanding: (raw, gameId) => normalize(raw, gameId, false),
    normalizeScore: (raw) => {
      // Bad scorer details must never hide independently verified game results.
      try {
        return normalize(raw, raw?.id, true);
      } catch {
        return null;
      }
    },
  };
})(globalThis);
