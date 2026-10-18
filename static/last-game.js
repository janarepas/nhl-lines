/* NHL fallback: measured shared ice time, not projected or official named lines. */
(function (root) {
  function lastCompleted(schedule, code, now = Date.now()) {
    if (!Array.isArray(schedule?.games)) throw Error("Hiányos NHL-menetrend.");
    return (
      schedule.games
        .filter(
          (g) =>
            Number.isSafeInteger(g.id) &&
            ["OFF", "FINAL"].includes(g.gameState) &&
            (g.homeTeam?.abbrev === code || g.awayTeam?.abbrev === code) &&
            Date.parse(g.startTimeUTC || g.gameDate) <= now,
        )
        .sort(
          (a, b) =>
            Date.parse(b.startTimeUTC || b.gameDate) -
            Date.parse(a.startTimeUTC || a.gameDate),
        )[0] || null
    );
  }
  function seconds(s) {
    if (typeof s !== "string" || !/^\d{1,2}:\d{2}$/.test(s)) return null;
    const [m, t] = s.split(":").map(Number);
    return t < 60 ? m * 60 + t : null;
  }
  function fromShifts(box, chart, code, roster = []) {
    const side =
      box.homeTeam?.abbrev === code
        ? "homeTeam"
        : box.awayTeam?.abbrev === code
          ? "awayTeam"
          : null;
    if (
      !side ||
      !["OFF", "FINAL"].includes(box.gameState) ||
      !Number.isSafeInteger(box.id)
    )
      throw Error("Nem befejezett csapatmérkőzés.");
    if (
      !Array.isArray(chart?.data) ||
      !chart.data.length ||
      (Number.isFinite(chart.total) && chart.total > chart.data.length)
    )
      throw Error("Hiányos NHL-cserenapló.");
    const meta = new Map(),
      ownId = box[side].id;
    for (const key of ["homeTeam", "awayTeam"])
      for (const [field, group] of [
        ["forwards", "F"],
        ["defense", "D"],
        ["goalies", "G"],
      ]) {
        const list = box.playerByGameStats?.[key]?.[field];
        if (!Array.isArray(list)) throw Error("Hiányos meccskeret.");
        for (const p of list) {
          if (!Number.isSafeInteger(p.playerId))
            throw Error("Hiányos játékosazonosító.");
          meta.set(p.playerId, {
            id: p.playerId,
            teamId: box[key].id,
            group,
            pos: p.position || group,
            number: p.sweaterNumber ?? "—",
            shortName: p.name?.default || "",
            starter: p.starter === true,
          });
        }
      }
    const periods = new Map(),
      seen = new Set();
    for (const row of chart.data) {
      if (row.typeCode !== 517) continue;
      if (row.gameId !== box.id || !meta.has(row.playerId))
        throw Error("Eltérő cserenapló és meccskeret.");
      if (!Number.isInteger(row.period) || row.period < 1 || row.period > 4)
        continue;
      const a = seconds(row.startTime),
        b = seconds(row.endTime);
      if (a === null || b === null || b <= a) continue;
      if (b > 1200) throw Error("Érvénytelen csereidő.");
      const unique = [row.playerId, row.period, a, b].join(":");
      if (seen.has(unique)) continue;
      seen.add(unique);
      const p = meta.get(row.playerId);
      if (row.firstName && row.lastName) {
        p.first = row.firstName;
        p.last = row.lastName;
      }
      if (!periods.has(row.period)) periods.set(row.period, new Map());
      const events = periods.get(row.period);
      for (const [time, delta] of [
        [a, 1],
        [b, -1],
      ]) {
        if (!events.has(time)) events.set(time, []);
        events.get(time).push([row.playerId, delta]);
      }
    }
    const groups = {
      forwards: new Map(),
      defense: new Map(),
      pp: new Map(),
      pk: new Map(),
    };
    let coverage = 0;
    const add = (group, ids, sec, strength) => {
      ids = [...ids].sort((a, b) => a - b);
      const key = strength + ":" + ids.join(",");
      const row = groups[group].get(key) || { ids, seconds: 0, strength };
      row.seconds += sec;
      groups[group].set(key, row);
    };
    for (const events of periods.values()) {
      const times = [...events.keys()].sort((a, b) => a - b),
        active = new Map();
      for (let i = 0; i < times.length - 1; i++) {
        for (const [id, delta] of events.get(times[i])) {
          const n = (active.get(id) || 0) + delta;
          if (n > 0) active.set(id, n);
          else active.delete(id);
        }
        const sec = times[i + 1] - times[i];
        if (sec <= 0) continue;
        const onIce = [...active.keys()].map((id) => meta.get(id)),
          ours = onIce.filter((p) => p.teamId === ownId),
          theirs = onIce.filter((p) => p.teamId !== ownId);
        if (
          ours.filter((p) => p.group === "G").length !== 1 ||
          theirs.filter((p) => p.group === "G").length !== 1
        )
          continue;
        const own = ours.filter((p) => p.group !== "G"),
          opp = theirs.filter((p) => p.group !== "G");
        if (
          Math.min(own.length, opp.length) < 3 ||
          Math.max(own.length, opp.length) > 5
        )
          continue;
        coverage += sec;
        const strength = own.length + "v" + opp.length;
        if (own.length === 5 && opp.length === 5) {
          const f = own.filter((p) => p.group === "F"),
            d = own.filter((p) => p.group === "D");
          if (f.length === 3 && d.length === 2) {
            add(
              "forwards",
              f.map((p) => p.id),
              sec,
              strength,
            );
            add(
              "defense",
              d.map((p) => p.id),
              sec,
              strength,
            );
          }
        } else if (own.length > opp.length)
          add(
            "pp",
            own.map((p) => p.id),
            sec,
            strength,
          );
        else if (own.length < opp.length)
          add(
            "pk",
            own.map((p) => p.id),
            sec,
            strength,
          );
      }
    }
    if (!coverage) throw Error("Nincs ellenőrizhető közös jégidő.");
    const measured = Object.fromEntries(
      Object.entries(groups).map(([key, map]) => [
        key,
        [...map.values()]
          .filter((r) => r.seconds >= 10)
          .sort(
            (a, b) =>
              b.seconds - a.seconds ||
              a.ids.join(",").localeCompare(b.ids.join(",")),
          ),
      ]),
    );
    const people = [...meta.values()].filter((p) => p.teamId === ownId),
      rosterById = new Map(roster.map((p) => [p.id, p]));
    const extra = people
      .filter((p) => !rosterById.has(p.id))
      .map((p) => ({
        ...p,
        first: p.first || "",
        last: p.last || p.shortName,
        name: p.first ? p.first + " " + p.last : p.shortName,
        image: `https://assets.nhle.com/mugs/nhl/latest/${p.id}.png`,
        customImage: "",
        tsn: "",
      }));
    const goalies = people
      .filter((p) => p.group === "G")
      .sort((a, b) => Number(b.starter) - Number(a.starter))
      .map((p) => p.id);
    const ordered = (key) =>
      measured[key].map((row) =>
        [...row.ids].sort((a, b) => {
          const pa = meta.get(a),
            pb = meta.get(b);
          const rank = (p) =>
            (p.group === "D" ? 10 : 0) + ({ L: 0, C: 1, R: 2 }[p.pos] ?? 3);
          return rank(pa) - rank(pb) || a - b;
        }),
      );
    return {
      version: 1,
      type: "nhl-last-game",
      team: code,
      forwards: ordered("forwards").slice(0, 4),
      defense: ordered("defense").slice(0, 3),
      goalies,
      pp: ordered("pp").slice(0, 2),
      pk: ordered("pk").slice(0, 2),
      extra,
      measured,
      coverage,
      game: {
        id: box.id,
        date: box.gameDate,
        home: box.homeTeam.abbrev,
        away: box.awayTeam.abbrev,
        homeScore: box.homeTeam.score,
        awayScore: box.awayTeam.score,
      },
      sourceUrl: "https://www.nhl.com/gamecenter/" + box.id,
      updated: null,
    };
  }
  function valid(data) {
    if (
      data?.type !== "nhl-last-game" ||
      data.version !== 1 ||
      !Number.isSafeInteger(data.game?.id)
    )
      return false;
    for (const key of ["forwards", "defense", "pp", "pk"])
      if (
        !Array.isArray(data[key]) ||
        !data[key].every(
          (row) =>
            Array.isArray(row) &&
            row.length >= 2 &&
            row.length <= 5 &&
            row.every(Number.isSafeInteger),
        )
      )
        return false;
    return (
      Array.isArray(data.goalies) &&
      data.goalies.every(Number.isSafeInteger) &&
      Array.isArray(data.extra)
    );
  }
  root.LastGame = { lastCompleted, fromShifts, valid };
  if (typeof module !== "undefined") module.exports = root.LastGame;
})(typeof window !== "undefined" ? window : globalThis);
