export async function onRequestGet() {
  try {
    const response = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
        cf: { cacheTtl: 300, cacheEverything: true },
      },
    );
    if (!response.ok) throw Error("Injury source unavailable");
    const data = await response.json();
    if (!Array.isArray(data.injuries)) throw Error("Unknown injury schema");
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Data-Source": "ESPN",
      },
    });
  } catch {
    return Response.json(
      { error: "The injury report is temporarily unavailable." },
      { status: 502 },
    );
  }
}
