import teams from "../../lib/espn-teams.js";
import { rankedSpecialTeams } from "../../lib/special-teams.js";
const pending = new Map();
export async function onRequestGet({ request }) {
  const team = new URL(request.url).searchParams.get("team") || "";
  if (!Object.hasOwn(teams, team))
    return Response.json({ error: "Invalid NHL team." }, { status: 400 });
  const key = new Request(
    new URL("/api/special-teams?team=" + team, request.url),
  );
  const cache = typeof caches !== "undefined" ? caches.default : null;
  try {
    if (cache) {
      const cached = await cache.match(key);
      if (cached) return cached;
    }
  } catch {}
  try {
    if (!pending.has(team)) {
      const promise = (async () => {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teams[team]}/depthcharts`,
          {
            redirect: "manual",
            signal: AbortSignal.timeout(15000),
            headers: { Accept: "application/json" },
            cf: {
              cacheEverything: true,
              cacheTtlByStatus: { "200-299": 300, "300-599": 0 },
            },
          },
        );
        if (!response.ok) throw Error("ESPN unavailable");
        const raw = await response.json();
        return {
          team,
          source: "ESPN",
          sourceUrl: `https://www.espn.com/nhl/team/depth/_/id/${teams[team]}`,
          ...rankedSpecialTeams(raw),
        };
      })();
      pending.set(team, promise);
      promise
        .finally(() => {
          if (pending.get(team) === promise) pending.delete(team);
        })
        .catch(() => {});
    }
    const data = await pending.get(team);
    const result = Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=120, s-maxage=300",
        "X-Data-Source": "ESPN",
        "X-Content-Type-Options": "nosniff",
      },
    });
    if (cache) {
      try {
        await cache.put(key, result.clone());
      } catch {}
    }
    return result;
  } catch {
    return Response.json(
      { error: "Special-teams units are temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
