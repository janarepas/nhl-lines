// Independently published factual lineup feed; fixed URL, never an open proxy.
const feed =
  "https://raw.githubusercontent.com/hg913488/nhl-line-combos-app/main/data/lines.json";
export async function onRequestGet() {
  let upstreamStatus = null;
  let stage = "connection";
  try {
    const response = await fetch(feed, {
      signal: AbortSignal.timeout(20000),
      redirect: "manual",
      headers: { Accept: "application/json" },
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 300, "400-599": 0 },
      },
    });
    upstreamStatus = response.status;
    stage = "http";
    if (!response.ok) throw Error("HTTP " + response.status);
    stage = "body";
    const text = await response.text();
    if (text.length > 2000000) throw Error("Response too large");
    stage = "schema";
    const data = JSON.parse(text);
    if (
      data.source !== "dailyfaceoff.com" ||
      !data.teams ||
      typeof data.updated_at !== "string"
    )
      throw Error("Unexpected data structure");
    return new Response(text, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "X-Line-Provider": "Between the Lines",
      },
    });
  } catch {
    return new Response(
      "The published lineup feed is temporarily unavailable.",
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Line-Error": "feed-" + stage,
          ...(upstreamStatus === null
            ? {}
            : { "X-Upstream-Status": String(upstreamStatus) }),
        },
      },
    );
  }
}
