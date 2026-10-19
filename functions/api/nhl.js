const routes =
  /^(?:roster\/[A-Z]{3}\/current|club-stats\/[A-Z]{3}\/now|player\/[0-9]{6,9}\/game-log\/now)$/;
export async function onRequestGet({ request }) {
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!routes.test(path))
    return Response.json(
      { error: "Érvénytelen NHL-végpont." },
      { status: 400 },
    );
  try {
    const response = await fetch("https://api-web.nhle.com/v1/" + path, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!response.ok) throw new Error("NHL upstream " + response.status);
    const data = await response.json();
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "X-Data-Source": "NHL",
      },
    });
  } catch {
    return Response.json(
      { error: "Az NHL-adatforrás átmenetileg nem érhető el." },
      { status: 502 },
    );
  }
}
