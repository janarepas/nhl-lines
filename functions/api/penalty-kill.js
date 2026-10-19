// Fixed public PK page. Subscriber-only teams remain unavailable.
export async function onRequestGet() {
  try {
    const response = await fetch(
      "https://www.rotowire.com/hockey/depth-charts-pk.php",
      {
        signal: AbortSignal.timeout(20000),
        redirect: "manual",
        headers: { Accept: "text/html" },
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: { "200-299": 300, "400-599": 0 },
        },
      },
    );
    if (!response.ok) throw Error("Upstream error");
    const html = await response.text();
    if (html.length > 2000000 || !/NHL Penalty Kill Depth Charts/i.test(html))
      throw Error("Invalid PK source");
    return new Response(html, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "X-Line-Provider": "RotoWire",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("A PK-adatforrás jelenleg nem érhető el.", {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
