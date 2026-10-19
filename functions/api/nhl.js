const routes =
  /^(?:roster\/[A-Z]{3}\/current|club-stats\/[A-Z]{3}\/now|player\/[0-9]{6,9}\/game-log\/now)$/;
const origin = "https://api-web.nhle.com";
function allowedRedirect(path, url) {
  if (
    url.origin !== origin ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    return false;
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
    upstreamStatus = null;
  try {
    let url = new URL(origin + "/v1/" + path);
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
          cacheTtlByStatus: { "200-299": 60, "300-399": 15, "400-599": 0 },
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
    if (!response.ok) throw Error("NHL upstream error");
    stage = "schema";
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data) || data.error)
      throw Error("Invalid NHL response");
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Data-Source": "NHL",
      },
    });
  } catch {
    return Response.json(
      { error: "Az NHL-adatforrás átmenetileg nem érhető el." },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "X-NHL-Error": stage,
          ...(upstreamStatus === null
            ? {}
            : { "X-Upstream-Status": String(upstreamStatus) }),
        },
      },
    );
  }
}
