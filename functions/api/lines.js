import teams from "../../lib/dfo-teams.js";
const failure = (message, code, upstreamStatus = null) =>
  new Response(message, {
    status: 502,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Line-Error": code,
      ...(upstreamStatus === null
        ? {}
        : { "X-Upstream-Status": String(upstreamStatus) }),
    },
  });
export async function onRequestGet({ request }) {
  const code = new URL(request.url).searchParams.get("team") || "";
  const slug = Object.hasOwn(teams, code) ? teams[code] : null;
  if (!slug) return new Response("Érvénytelen NHL-csapat.", { status: 400 });
  const path = "/teams/" + slug + "/line-combinations";
  let url = new URL("https://www.dailyfaceoff.com" + path);
  const signal = AbortSignal.timeout(20000);
  try {
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(url.href, {
        redirect: "manual",
        signal,
        headers: { Accept: "text/html" },
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": 300, "300-399": 60, "400-599": 0 },
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("Location");
      if (!location || redirects === 3)
        return failure(
          "A Daily Faceoff átirányítása nem követhető.",
          "source-redirect",
          response.status,
        );
      const next = new URL(location, url);
      if (
        next.protocol !== "https:" ||
        !["www.dailyfaceoff.com", "dailyfaceoff.com"].includes(next.hostname) ||
        next.port ||
        next.username ||
        next.password ||
        next.pathname.replace(/\/$/, "") !== path
      ) {
        return failure(
          "A Daily Faceoff másik oldalra irányította a soradat-kérést.",
          "source-redirect",
          response.status,
        );
      }
      url = next;
    }
    if (!response.ok) {
      const blocked = [401, 403].includes(response.status);
      return failure(
        blocked
          ? `A Daily Faceoff aktuális sorai nem tölthetők le: a forrás ${response.status}-mal elutasítja a szerveroldali hozzáférést.`
          : `A Daily Faceoff aktuális sorai nem tölthetők le: a forrás HTTP ${response.status} hibát adott.`,
        blocked ? "source-access-denied" : "source-http-error",
        response.status,
      );
    }
    const html = await response.text();
    if (
      /<title[^>]*>\s*(?:Attention Required|Just a moment|Access Denied)/i.test(
        html,
      )
    )
      return failure(
        "A Daily Faceoff ellenőrző oldalt küldött soradatok helyett.",
        "source-challenge",
        response.status,
      );
    return new Response(html, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "X-Line-Source": url.href,
      },
    });
  } catch (error) {
    return failure(
      "A Daily Faceoff aktuális sorai nem tölthetők le: a forráskapcsolat megszakadt vagy időtúllépés történt.",
      error?.name === "TimeoutError"
        ? "source-timeout"
        : "source-network-error",
    );
  }
}
