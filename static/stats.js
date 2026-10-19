/* Shared, deterministic form calculation. No synthetic performance data. */
(function (root) {
  function summarize(raw, goalie = false, now = Date.now()) {
    const games = (Array.isArray(raw) ? raw : [])
      .filter(
        (g) =>
          typeof g.gameDate === "string" &&
          Number.isFinite(Date.parse(g.gameDate)) &&
          Date.parse(g.gameDate) <= now,
      )
      .sort((a, b) => b.gameDate.localeCompare(a.gameDate))
      .slice(0, 5);
    if (!games.length)
      return {
        kind: "neutral",
        label: "No game data",
        games: [],
        count: 0,
        goalie,
      };
    const fresh = now - Date.parse(games[0].gameDate) < 15 * 86400000;
    if (goalie) {
      const complete = games.filter(
        (g) =>
          Number.isInteger(g.shotsAgainst) &&
          Number.isInteger(g.goalsAgainst) &&
          g.shotsAgainst >= 0 &&
          g.goalsAgainst >= 0 &&
          g.goalsAgainst <= g.shotsAgainst,
      );
      const shots = complete.reduce((n, g) => n + g.shotsAgainst, 0),
        against = complete.reduce((n, g) => n + g.goalsAgainst, 0);
      const totalsComplete = complete.length === games.length;
      const pct =
        totalsComplete && shots > 0 ? (shots - against) / shots : null;
      const duration = (value) => {
        const match =
          typeof value === "string" && value.match(/^(\d+):([0-5]\d)$/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
      };
      const times = games.map((g) => duration(g.toi));
      const seconds = times.every((t) => t !== null)
        ? times.reduce((a, b) => a + b, 0)
        : null;
      const gaa =
        totalsComplete && seconds > 0 ? (against * 3600) / seconds : null;
      const enough = games.length >= 3 && pct !== null;
      const kind = !fresh
        ? "stale"
        : !enough
          ? "neutral"
          : pct >= 0.93
            ? "hot"
            : pct < 0.89
              ? "cold"
              : "normal";
      const label = !fresh
        ? "Previous games"
        : pct === null
          ? "Incomplete goalie data"
          : !enough
            ? "Not enough games"
            : kind === "hot"
              ? "Hot streak"
              : kind === "cold"
                ? "Cold streak"
                : "Steady form";
      const recordComplete = games.every((g) =>
        ["W", "L", "O"].includes(g.decision),
      );
      return {
        games,
        count: games.length,
        kind,
        label,
        pct,
        gaa,
        wins: recordComplete
          ? games.filter((g) => g.decision === "W").length
          : null,
        losses: recordComplete
          ? games.filter((g) => g.decision === "L").length
          : null,
        overtimeLosses: recordComplete
          ? games.filter((g) => g.decision === "O").length
          : null,
        goalie: true,
      };
    }

    if (
      games.some(
        (g) => !Number.isFinite(g.goals) || !Number.isFinite(g.assists),
      )
    )
      return {
        kind: "neutral",
        label: "Incomplete game data",
        games: [],
        count: 0,
      };
    const goals = games.reduce((n, g) => n + g.goals, 0),
      assists = games.reduce((n, g) => n + g.assists, 0);
    let streak = 0;
    for (const g of games) {
      if (g.goals + g.assists > 0) streak++;
      else break;
    }
    const hot =
      fresh && (streak >= 3 || (games.length === 5 && goals + assists >= 7));
    const cold =
      fresh &&
      games.length >= 3 &&
      games.slice(0, 3).every((g) => g.goals + g.assists === 0);
    return {
      games,
      count: games.length,
      goals,
      assists,
      points: goals + assists,
      streak,
      kind: !fresh ? "stale" : hot ? "hot" : cold ? "cold" : "normal",
      label: !fresh
        ? "Previous games"
        : hot
          ? "Hot streak"
          : cold
            ? "Point drought"
            : "Steady form",
      goalie: false,
    };
  }
  function leaders(data, team) {
    if (!Array.isArray(data?.points))
      throw Error("Incomplete NHL scoring leaderboard.");
    if (
      data.points.some(
        (p) => !Number.isSafeInteger(p.id) || !Number.isFinite(p.value),
      )
    )
      throw Error("Invalid NHL scoring leaderboard.");
    const max = Math.max(0, ...data.points.map((p) => p.value));
    const club = team ? data.points.filter((p) => p.teamAbbrev === team) : [];
    const teamPoints = Math.max(0, ...club.map((p) => p.value));
    return {
      teamPoints,
      teamIds: new Set(
        teamPoints > 0
          ? club.filter((p) => p.value === teamPoints).map((p) => p.id)
          : [],
      ),
      points: max,
      ids: new Set(
        max > 0
          ? data.points.filter((p) => p.value === max).map((p) => p.id)
          : [],
      ),
    };
  }
  function teamScorers(data) {
    if (
      !Array.isArray(data?.skaters) ||
      !/^\d{8}$/.test(String(data.season)) ||
      ![2, 3].includes(data.gameType)
    )
      throw Error("Incomplete team statistics.");
    if (
      data.skaters.some(
        (p) =>
          !Number.isSafeInteger(p.playerId) ||
          !p.firstName?.default ||
          !p.lastName?.default ||
          [p.gamesPlayed, p.goals, p.assists, p.points].some(
            (v) => !Number.isInteger(v) || v < 0,
          ) ||
          p.goals + p.assists !== p.points,
      )
    )
      throw Error("Invalid team statistics.");
    const max = Math.max(0, ...data.skaters.map((p) => p.points));
    return {
      season: String(data.season),
      gameType: data.gameType,
      players: max > 0 ? data.skaters.filter((p) => p.points === max) : [],
    };
  }
  if (typeof module !== "undefined")
    module.exports = { summarize, leaders, teamScorers };
  root.LineStats = { summarize, leaders, teamScorers };
})(typeof window !== "undefined" ? window : globalThis);
