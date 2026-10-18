import teams from "../../lib/dfo-teams.js";
export async function onRequestGet({ request }) {
  const code = new URL(request.url).searchParams.get("team") || "";
  const slug = Object.hasOwn(teams, code) ? teams[code] : null;
  if (!slug) return new Response("Érvénytelen NHL-csapat.", { status: 400 });
  const url =
    "https://www.dailyfaceoff.com/teams/" + slug + "/line-combinations";
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "text/html" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!response.ok) throw Error("Source unavailable");
    return new Response(await response.text(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "X-Line-Source": url,
      },
    });
  } catch {
    return new Response(
      "A Daily Faceoff aktuális sorai most nem tölthetők le.",
      { status: 502 },
    );
  }
}
