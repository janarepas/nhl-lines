// Fixed official NHL score endpoint; never a user-supplied upstream URL.
export async function onRequestGet({ request }) {
  const date = new URL(request.url).searchParams.get("date") || "";
  if (
    !/^20\d{2}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    return Response.json({ error: "Invalid game date." }, { status: 400 });
  try {
    const response = await fetch(`https://api-web.nhle.com/v1/score/${date}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json" },
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 30, "300-599": 0 },
      },
    });
    if (!response.ok) throw Error("NHL score source unavailable");
    const raw = await response.json();
    if (
      raw.currentDate !== date ||
      !Array.isArray(raw.games) ||
      raw.games.length > 20
    )
      throw Error("Invalid NHL score response");
    const seen = new Set();
    const games = raw.games.map((g) => {
      if (
        !Number.isSafeInteger(g.id) ||
        seen.has(g.id) ||
        !Number.isFinite(Date.parse(g.startTimeUTC)) ||
        !["FUT", "PRE", "LIVE", "CRIT", "FINAL", "OFF"].includes(g.gameState)
      )
        throw Error("Invalid NHL game");
      seen.add(g.id);
      const team = (t) => {
        if (!/^[A-Z]{2,3}$/.test(t?.abbrev)) throw Error("Invalid NHL team");
        return {
          code: t.abbrev,
          score: Number.isInteger(t.score) && t.score >= 0 ? t.score : null,
        };
      };
      return {
        id: g.id,
        start: g.startTimeUTC,
        state: g.gameState,
        scheduleState: g.gameScheduleState || "OK",
        away: team(g.awayTeam),
        home: team(g.homeTeam),
        period: Number.isInteger(g.periodDescriptor?.number)
          ? g.periodDescriptor.number
          : null,
        periodType: g.periodDescriptor?.periodType || "",
        clock:
          typeof g.clock?.timeRemaining === "string" &&
          /^\d{1,2}:\d{2}$/.test(g.clock.timeRemaining)
            ? g.clock.timeRemaining
            : "",
        intermission: g.clock?.inIntermission === true,
        outcome: g.gameOutcome?.lastPeriodType || "",
      };
    });
    return Response.json(
      { date, games },
      {
        headers: {
          "Cache-Control": "public, max-age=15, s-maxage=30",
          "X-Data-Source": "NHL",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "NHL scores are temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
