import { onRequestGet as nhl } from "./nhl.js";
export async function onRequestGet({ request }) {
  const url = new URL(
    "/api/nhl?path=skater-stats-leaders%2Fcurrent",
    request.url,
  );
  const response = await nhl({ request: new Request(url) });
  if (!response.ok) return response;
  const data = await response.clone().json();
  if (!Array.isArray(data.points))
    return Response.json(
      { error: "Az NHL-pontlista most nem érhető el." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  return response;
}
