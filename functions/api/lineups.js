// Independently published factual lineup feed; fixed URL, never an open proxy.
const feed =
  "https://raw.githubusercontent.com/hg913488/nhl-line-combos-app/main/data/lines.json";
export async function onRequestGet() {
  try {
    const response = await fetch(feed, {
      signal: AbortSignal.timeout(20000),
      redirect: "error",
      headers: { Accept: "application/json" },
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 300, "400-599": 0 },
      },
    });
    if (!response.ok) throw Error("HTTP " + response.status);
    const text = await response.text();
    if (text.length > 2000000) throw Error("Túl nagy válasz");
    const data = JSON.parse(text);
    if (
      data.source !== "dailyfaceoff.com" ||
      !data.teams ||
      typeof data.updated_at !== "string"
    )
      throw Error("Eltérő adatstruktúra");
    return new Response(text, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "X-Line-Provider": "Between the Lines",
      },
    });
  } catch {
    return new Response("A közölt soradat-feed átmenetileg nem érhető el.", {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
