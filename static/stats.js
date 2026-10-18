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
      return { kind: "neutral", label: "Nincs meccsadat", games: [], count: 0 };
    const fresh = now - Date.parse(games[0].gameDate) < 15 * 86400000;
    if (goalie) {
      const complete = games.filter(
        (g) =>
          Number.isFinite(g.shotsAgainst) && Number.isFinite(g.goalsAgainst),
      );
      const shots = complete.reduce((n, g) => n + g.shotsAgainst, 0),
        against = complete.reduce((n, g) => n + g.goalsAgainst, 0);
      const pct = shots > 0 ? (shots - against) / shots : null;
      return {
        games,
        count: games.length,
        kind: fresh ? "normal" : "stale",
        label: fresh ? "Utolsó " + games.length + " meccs" : "Korábbi meccsek",
        pct,
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
        label: "Hiányos meccsadat",
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
        ? "Korábbi meccsek"
        : hot
          ? "Hot streak"
          : cold
            ? "Pontcsend"
            : "Stabil forma",
      goalie: false,
    };
  }
  if (typeof module !== "undefined") module.exports = { summarize };
  root.LineStats = { summarize };
})(typeof window !== "undefined" ? window : globalThis);
