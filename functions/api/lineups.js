import {
  teamSlugs,
  nhlDay,
  dailyUrl,
  parseArticle,
  previewCandidates,
} from "../../lib/nhl-lineups.js";

const pending = new Map();
// One compact shared edge snapshot, rather than parsing HTML in every browser.
async function shared(key, load, cache, base) {
  const request = new Request(new URL("/api/lineups-cache/" + key, base));
  if (cache) {
    try {
      const response = await cache.match(request);
      if (response) return await response.json();
    } catch {}
  }
  if (!pending.has(key)) {
    const promise = (async () => {
      const data = await load();
      if (cache) {
        try {
          await cache.put(
            request,
            Response.json(data, {
              headers: { "Cache-Control": "public, max-age=300" },
            }),
          );
        } catch {}
      }
      return data;
    })();
    pending.set(key, promise);
    promise
      .finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      })
      .catch(() => {});
  }
  return pending.get(key);
}
async function source(url, signal, json = false) {
  const response = await fetch(url, {
    redirect: "manual",
    signal,
    headers: { Accept: json ? "application/json" : "text/html" },
    cf: {
      cacheEverything: true,
      cacheTtlByStatus: { "200-299": 300, "300-599": 0 },
    },
  });
  if (!response.ok) throw Error("NHL source HTTP " + response.status);
  const text = await response.text();
  if (text.length > 2000000) throw Error("NHL response too large.");
  return json ? JSON.parse(text) : text;
}
export async function onRequestGet({ request }) {
  const code = new URL(request.url).searchParams.get("team") || "";
  if (!Object.hasOwn(teamSlugs, code))
    return Response.json({ error: "Invalid NHL team." }, { status: 400 });
  const now = Date.now(),
    today = nhlDay(now),
    slug = teamSlugs[code];
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const signal = AbortSignal.timeout(20000);
  try {
    const result = await shared(
      "team-" + code + "-" + today,
      async () => {
        try {
          const url = dailyUrl(now);
          const daily = await shared(
            "daily-" + today,
            async () => parseArticle(await source(url, signal), url, now),
            cache,
            request.url,
          );
          if (daily.teams[slug])
            return { ...daily, teams: { [slug]: daily.teams[slug] } };
        } catch {}
        // Off-day teams use their most recent published game preview, dated visibly.
        const start = new Date(Date.parse(today) - 6 * 86400000)
          .toISOString()
          .slice(0, 10);
        const schedule = await shared(
          "schedule-" + today,
          () =>
            source(
              "https://api-web.nhle.com/v1/schedule/" + start,
              signal,
              true,
            ),
          cache,
          request.url,
        );
        let lastFailure;
        for (const candidate of previewCandidates(schedule, code, today)) {
          try {
            const article = await shared(
              "preview-" + candidate.url.split("/").at(-1),
              async () =>
                parseArticle(
                  await source(candidate.url, signal),
                  candidate.url,
                  now,
                  candidate.date,
                ),
              cache,
              request.url,
            );
            if (article.teams[slug])
              return { ...article, teams: { [slug]: article.teams[slug] } };
          } catch (error) {
            lastFailure = error;
          }
        }
        throw (
          lastFailure ||
          Error("No recent NHL projection is published for this team.")
        );
      },
      cache,
      request.url,
    );
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, max-age=120, s-maxage=300",
        "X-Line-Provider": "NHL.com",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          "Recent NHL projected lineups are temporarily unavailable for this team.",
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "X-Line-Error": String(error.message)
            .replace(/[^\x20-\x7E]/g, "")
            .slice(0, 140),
        },
      },
    );
  }
}
