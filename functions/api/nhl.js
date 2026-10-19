const routes =
  /^(?:roster\/[A-Z]{3}\/current|club-stats\/[A-Z]{3}\/now|player\/[0-9]{6,9}\/game-log\/now|skater-stats-leaders\/current)$/;
const origin = "https://api-web.nhle.com";
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
    return Response.json(
      { error: "Érvénytelen NHL-végpont." },
      { status: 400 },
    );
  let stage = "connection",
    upstreamStatus = null,
    retryAfter = null;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(
    new URL("/api/nhl?path=" + encodeURIComponent(path), request.url),
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
    if (!data || typeof data !== "object" || Array.isArray(data) || data.error)
      throw Error("Invalid NHL response");
    const result = Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Data-Source": "NHL",
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
      {
        error: retryAfter
          ? "Az NHL átmenetileg korlátozza a lekéréseket. A frissítést később újrapróbáljuk."
          : "Az NHL-adatforrás átmenetileg nem érhető el.",
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
