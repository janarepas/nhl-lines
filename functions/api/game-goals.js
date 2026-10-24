import { gameGoals } from "../../lib/game-goals.js";

const pending = new Map();
const savedMaxAge = 86400000;
async function load(gameId, cache, key, savedKey) {
  let stage = "connection",
    upstreamStatus = null,
    retryAfter = null;
  try {
    const response = await fetch(
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/landing`,
      {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json" },
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": 60, "300-599": 0 },
        },
      },
    );
    stage = "http";
    upstreamStatus = response.status;
    if (response.status === 429 || response.headers.has("Retry-After")) {
      const raw = response.headers.get("Retry-After"),
        seconds = /^\d+$/.test(raw || "")
          ? Number(raw)
          : Math.ceil((Date.parse(raw) - Date.now()) / 1000);
      retryAfter =
        Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60;
    }
    if (!response.ok) throw Error("NHL goal source unavailable.");
    stage = "schema";
    const data = gameGoals(await response.json(), gameId);
    const final = ["FINAL", "OFF"].includes(data.state),
      complete = data.away.complete && data.home.complete;
    const result = Response.json(data, {
      headers: {
        "Cache-Control":
          final && complete
            ? "public, max-age=3600, s-maxage=21600"
            : "public, max-age=30, s-maxage=60",
        "X-Data-Source": "NHL",
        "X-Data-State": "fresh",
        "X-NHL-Checked-At": new Date(Date.now()).toISOString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
    if (cache) {
      try {
        const writes = [cache.put(key, result.clone())];
        if (complete) {
          const saved = result.clone();
          saved.headers.set("Cache-Control", "public, max-age=86400");
          writes.push(cache.put(savedKey, saved));
        }
        await Promise.allSettled(writes);
      } catch {}
    }
    return result;
  } catch {
    if (
      cache &&
      (stage === "connection" || (stage === "http" && upstreamStatus >= 500))
    ) {
      try {
        const saved = await cache.match(savedKey),
          age = Date.now() - Date.parse(saved?.headers.get("X-NHL-Checked-At"));
        if (saved?.ok && age >= 0 && age <= savedMaxAge) {
          const headers = new Headers(saved.headers);
          headers.set("Cache-Control", "no-store");
          headers.set("X-Data-State", "stale");
          headers.set("Warning", '110 - "Response is stale"');
          if (retryAfter) headers.set("Retry-After", String(retryAfter));
          if (upstreamStatus !== null)
            headers.set("X-Upstream-Status", String(upstreamStatus));
          return new Response(saved.body, { headers });
        }
      } catch {}
    }
    return Response.json(
      { error: "NHL goal-scorer details are temporarily unavailable." },
      {
        status: retryAfter ? 503 : 502,
        headers: {
          "Cache-Control": "no-store",
          ...(upstreamStatus !== null
            ? { "X-Upstream-Status": String(upstreamStatus) }
            : {}),
          ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
        },
      },
    );
  }
}

export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get("game") || "";
  if (!/^20\d{8}$/.test(id))
    return Response.json({ error: "Invalid NHL game ID." }, { status: 400 });
  const key = new Request(new URL("/api/game-goals?game=" + id, request.url)),
    savedKey = new Request(
      new URL("/api/game-goals-last-good?game=" + id, request.url),
    ),
    cache = globalThis.caches?.default;
  if (cache) {
    try {
      const saved = await cache.match(key);
      if (saved) return saved;
    } catch {}
  }
  if (!pending.has(key.url)) {
    const promise = load(Number(id), cache, key, savedKey);
    pending.set(key.url, promise);
    promise
      .finally(() => {
        if (pending.get(key.url) === promise) pending.delete(key.url);
      })
      .catch(() => {});
  }
  return (await pending.get(key.url)).clone();
}
