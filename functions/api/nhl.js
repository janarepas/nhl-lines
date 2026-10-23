const routes =
  /^(?:roster\/[A-Z]{3}\/current|prospects\/[A-Z]{3}|club-stats\/[A-Z]{3}\/now|player\/[0-9]{6,9}\/(?:game-log\/now|landing)|skater-stats-leaders\/current)$/;
const origin = "https://api-web.nhle.com";
const lastGoodMaxAge = 24 * 60 * 60 * 1000;
function validPayload(path, data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.error)
    return false;
  if (path.startsWith("roster/") || path.startsWith("prospects/"))
    return ["forwards", "defensemen", "goalies"].every((key) =>
      Array.isArray(data[key]),
    );
  if (path.startsWith("club-stats/")) return Array.isArray(data.skaters);
  if (path === "skater-stats-leaders/current")
    return Array.isArray(data.points);
  if (path.endsWith("/landing"))
    return (
      data.playerId === Number(path.split("/")[1]) &&
      Array.isArray(data.seasonTotals)
    );
  return Array.isArray(data.gameLog);
}
function allowedRedirect(path, url) {
  if (url.origin !== origin || url.hash || url.username || url.password)
    return false;
  if (path === "skater-stats-leaders/current") {
    return (
      /^\/v1\/skater-stats-leaders\/(?:current|[0-9]{8}\/[23])$/.test(
        url.pathname,
      ) && url.search === "?categories=points&limit=-1"
    );
  }
  if (url.search) return false;
  const parts = path.split("/");
  if (parts[0] === "prospects") return url.pathname === "/v1/" + path;
  if (parts[0] === "player" && parts[2] === "landing")
    return url.pathname === "/v1/" + path;
  const canonical =
    parts[0] === "roster"
      ? new RegExp(`^/v1/roster/${parts[1]}/[0-9]{8}$`)
      : parts[0] === "club-stats"
        ? new RegExp(`^/v1/club-stats/${parts[1]}/[0-9]{8}/[23]$`)
        : new RegExp(`^/v1/player/${parts[1]}/game-log/[0-9]{8}/[23]$`);
  return url.pathname === "/v1/" + path || canonical.test(url.pathname);
}
export async function onRequestGet({ request }) {
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!routes.test(path))
    return Response.json({ error: "Invalid NHL endpoint." }, { status: 400 });
  let stage = "connection",
    upstreamStatus = null,
    retryAfter = null;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(
    new URL("/api/nhl?path=" + encodeURIComponent(path), request.url),
  );
  // The fallback has a separate cache key so the normal five-minute refresh
  // stays intact. It is used only after a transient origin failure.
  const lastGoodKey = new Request(
    new URL("/api/nhl-last-good?path=" + encodeURIComponent(path), request.url),
  );
  if (cache) {
    try {
      const cached = await cache.match(key);
      if (cached) return cached;
    } catch {}
  }
  try {
    let url = new URL(
      origin +
        "/v1/" +
        path +
        (path === "skater-stats-leaders/current"
          ? "?categories=points&limit=-1"
          : ""),
    );
    const signal = AbortSignal.timeout(15000);
    let response;
    for (let hop = 0; hop < 4; hop++) {
      stage = "connection";
      response = await fetch(url.href, {
        redirect: "manual",
        headers: { Accept: "application/json" },
        signal,
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": 300, "300-399": 15, "400-599": 0 },
        },
      });
      upstreamStatus = response.status;
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      stage = "redirect";
      const location = response.headers.get("Location");
      if (!location || hop === 3) throw Error("Invalid redirect");
      const next = new URL(location, url);
      if (!allowedRedirect(path, next)) throw Error("Untrusted redirect");
      url = next;
    }
    stage = "http";
    if (response.status === 429) {
      const value = response.headers.get("Retry-After");
      const seconds = /^\d+$/.test(value || "")
        ? Number(value)
        : Math.ceil((Date.parse(value) - Date.now()) / 1000);
      retryAfter =
        Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60;
    }
    if (!response.ok) throw Error("NHL upstream error");
    stage = "schema";
    const data = await response.json();
    if (!validPayload(path, data)) throw Error("Invalid NHL response");
    const result = Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Data-Source": "NHL",
        "X-Data-State": "fresh",
        "X-NHL-Checked-At": new Date().toISOString(),
      },
    });
    if (cache) {
      try {
        const lastGood = result.clone();
        lastGood.headers.set("Cache-Control", "public, max-age=86400");
        await Promise.allSettled([
          cache.put(key, result.clone()),
          cache.put(lastGoodKey, lastGood),
        ]);
      } catch {}
    }
    return result;
  } catch {
    // Do not turn denials, malformed payloads or rejected redirects into success.
    // A 429 still reaches the caller with Retry-After, preserving its backoff.
    if (
      cache &&
      (stage === "connection" || (stage === "http" && upstreamStatus >= 500))
    ) {
      try {
        const lastGood = await cache.match(lastGoodKey);
        const checkedAt = Date.parse(lastGood?.headers.get("X-NHL-Checked-At"));
        const age = Date.now() - checkedAt;
        if (lastGood?.ok && age >= 0 && age <= lastGoodMaxAge) {
          const headers = new Headers(lastGood.headers);
          headers.set("Cache-Control", "no-store");
          headers.set("X-Data-State", "stale");
          headers.set("X-NHL-Error", stage);
          headers.set("Warning", '110 - "Response is stale"');
          if (upstreamStatus !== null)
            headers.set("X-Upstream-Status", String(upstreamStatus));
          return new Response(lastGood.body, { status: 200, headers });
        }
      } catch {}
    }
    return Response.json(
      {
        error: retryAfter
          ? "The NHL is temporarily rate-limiting requests. A later refresh will try again."
          : "The NHL data source is temporarily unavailable.",
      },
      {
        status: retryAfter ? 503 : 502,
        headers: {
          "Cache-Control": "no-store",
          "X-NHL-Error": stage,
          ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
          ...(upstreamStatus === null
            ? {}
            : { "X-Upstream-Status": String(upstreamStatus) }),
        },
      },
    );
  }
}
