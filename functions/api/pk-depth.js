import teams from "../../lib/espn-teams.js";
// Public ESPN PK depth chart. Depth ranks are not claimed as PK1/PK2 units.
export async function onRequestGet({ request }) {
  const team = new URL(request.url).searchParams.get("team");
  if (!Object.hasOwn(teams, team))
    return Response.json({ error: "Invalid NHL team." }, { status: 400 });
  try {
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
    const data = await response.json();
    const charts = data.depthchart?.filter((c) => c.name === "Penalty Kill");
    if (charts?.length !== 1 || !charts[0].positions)
      throw Error("Unknown depth chart schema");
    const chart = charts[0].positions;
    const names = (keys) => [
      ...new Set(
        keys.flatMap((key) => {
          if (!chart[key]) return [];
          if (
            !Array.isArray(chart[key].athletes) ||
            chart[key].athletes.length > 12
          )
            throw Error("Invalid depth chart");
          return chart[key].athletes.map((p) => {
            if (
              typeof p.displayName !== "string" ||
              !p.displayName.trim() ||
              p.displayName.length > 100
            )
              throw Error("Invalid player");
            return p.displayName.trim();
          });
        }),
      ),
    ];
    const forwards = names(["c", "lw", "rw", "f"]),
      defense = names(["d", "ld", "rd"]);
    if (
      !forwards.length ||
      !defense.length ||
      forwards.length > 12 ||
      defense.length > 12
    )
      throw Error("Incomplete PK chart");
    return Response.json(
      {
        team,
        source: "ESPN",
        forwards,
        defense,
        sourceUrl: `https://www.espn.com/nhl/team/depth/_/id/${teams[team]}`,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
          "X-Data-Source": "ESPN",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "The public PK depth chart is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
