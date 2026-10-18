export async function onRequestGet({ request }) {
  const game = new URL(request.url).searchParams.get("game") || "";
  if (!/^\d{10}$/.test(game))
    return Response.json({ error: "Érvénytelen mérkőzés." }, { status: 400 });
  try {
    const response = await fetch(
      "https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId%3D" +
        game +
        "&limit=-1",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
        cf: {
          cacheTtlByStatus: { "200-299": 300, "400-599": 0 },
          cacheEverything: true,
        },
      },
    );
    if (!response.ok)
      return Response.json(
        {
          error: "Az NHL cserenapló nem érhető el.",
          upstreamStatus: response.status,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    const data = await response.json();
    if (!Array.isArray(data.data)) throw Error("Invalid schema");
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return Response.json(
      { error: "Az NHL cserenapló nem érhető el." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
