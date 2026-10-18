export async function onRequestGet() {
  try {
    const response = await fetch(
      "https://api-web.nhle.com/v1/skater-stats-leaders/current?categories=points&limit=-1",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
        cf: { cacheTtl: 300, cacheEverything: true },
      },
    );
    if (!response.ok) throw Error("NHL leaderboard unavailable");
    const data = await response.json();
    if (!Array.isArray(data.points)) throw Error("Unknown leaderboard schema");
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Data-Source": "NHL",
      },
    });
  } catch {
    return Response.json(
      { error: "Az NHL-pontlista most nem érhető el." },
      { status: 502 },
    );
  }
}
