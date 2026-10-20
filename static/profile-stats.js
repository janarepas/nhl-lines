/* Only official NHL season/career totals; never sum rates or other leagues. */
(function (root) {
  const skaterFields = [
    ["gamesPlayed", "Games"],
    ["goals", "Goals"],
    ["assists", "Assists"],
    ["points", "Points"],
    ["plusMinus", "+/−", "signed"],
    ["shots", "Shots"],
    ["shootingPctg", "Shooting %", "percent"],
    ["powerPlayGoals", "PP goals"],
    ["powerPlayPoints", "PP points"],
    ["shorthandedGoals", "SH goals"],
    ["shorthandedPoints", "SH points"],
    ["gameWinningGoals", "Winning goals"],
    ["otGoals", "OT goals"],
    ["pim", "Penalty minutes"],
    ["faceoffWinningPctg", "Faceoffs won", "percent"],
    ["avgToi", "Avg. ice time", "time"],
  ];
  const goalieFields = [
    ["gamesPlayed", "Games"],
    ["gamesStarted", "Starts"],
    ["wins", "Wins"],
    ["losses", "Losses"],
    ["otLosses", "OT losses"],
    ["savePctg", "Save %", "percent"],
    ["goalsAgainstAvg", "GAA", "decimal"],
    ["shutouts", "Shutouts"],
    ["shotsAgainst", "Shots faced"],
    ["goalsAgainst", "Goals allowed"],
    ["goals", "Goals"],
    ["assists", "Assists"],
    ["pim", "Penalty minutes"],
    ["timeOnIce", "Ice time", "time"],
  ];
  function seasonLabel(value) {
    const season = String(value);
    return /^\d{8}$/.test(season)
      ? season.slice(0, 4) + "/" + season.slice(6)
      : "Unknown season";
  }
  function metrics(stats, goalie) {
    return (goalie ? goalieFields : skaterFields).flatMap(
      ([key, label, format]) => {
        const value = stats?.[key];
        if (format === "time")
          return typeof value === "string" && /^\d+:\d{2}$/.test(value)
            ? [{ key, label, value }]
            : [];
        if (!Number.isFinite(value) || (key !== "plusMinus" && value < 0))
          return [];
        if (format === "percent" && value > 1) return [];
        return [
          {
            key,
            label,
            value:
              format === "percent"
                ? (value * 100).toFixed(1) + "%"
                : format === "decimal"
                  ? value.toFixed(2)
                  : format === "signed" && value > 0
                    ? "+" + value
                    : String(value),
          },
        ];
      },
    );
  }
  function parse(data, id, season, goalie = false) {
    if (data?.playerId !== id || !Array.isArray(data.seasonTotals))
      throw Error("Invalid NHL player profile.");
    const rows = data.seasonTotals.filter(
      (row) =>
        row &&
        row.leagueAbbrev === "NHL" &&
        Number.isInteger(row.season) &&
        [2, 3].includes(row.gameTypeId),
    );
    const seasonStats = (gameType) => {
      const relevant = rows.filter(
        (row) => row.season === season && row.gameTypeId === gameType,
      );
      const featured =
        data.featuredStats?.season === season
          ? data.featuredStats[gameType === 2 ? "regularSeason" : "playoffs"]
              ?.subSeason
          : null;
      // A single team row can supply extra fields; traded-player rates are never averaged.
      return metrics(
        { ...(relevant.length === 1 ? relevant[0] : {}), ...featured },
        goalie,
      );
    };
    const awards = (Array.isArray(data.awards) ? data.awards : []).flatMap(
      (award) => {
        const title = award?.trophy?.default;
        const seasons = [
          ...new Set(
            (Array.isArray(award?.seasons) ? award?.seasons : [])
              .map((row) => row?.seasonId)
              .filter(
                (value) =>
                  Number.isInteger(value) && /^\d{8}$/.test(String(value)),
              ),
          ),
        ].sort((a, b) => b - a);
        return typeof title === "string" && seasons.length
          ? [{ title, seasons: seasons.map(seasonLabel) }]
          : [];
      },
    );
    return {
      seasonLabel: seasonLabel(season),
      current: seasonStats(2),
      currentPlayoffs: seasonStats(3),
      career: metrics(
        data.careerTotals?.regularSeason ||
          data.featuredStats?.regularSeason?.career,
        goalie,
      ),
      careerPlayoffs: metrics(data.careerTotals?.playoffs, goalie),
      awards,
      history: rows
        .slice()
        .sort(
          (a, b) =>
            b.season - a.season ||
            a.gameTypeId - b.gameTypeId ||
            (a.sequence || 0) - (b.sequence || 0),
        )
        .map((row) => ({
          season: seasonLabel(row.season),
          playoffs: row.gameTypeId === 3,
          team: row.teamName?.default || row.teamCommonName?.default || "NHL",
          metrics: metrics(row, goalie),
        })),
    };
  }
  root.PlayerProfileStats = { parse, metrics, seasonLabel };
})(globalThis);
