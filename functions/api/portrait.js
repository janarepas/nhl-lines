export async function onRequestGet({ request }) {
  const input = new URL(request.url).searchParams.get("url");
  let page;
  try {
    page = new URL(input);
  } catch {
    return new Response("Invalid TSN profile.", { status: 400 });
  }
  if (
    page.protocol !== "https:" ||
    !["tsn.ca", "www.tsn.ca"].includes(page.hostname) ||
    page.port ||
    page.username ||
    page.password
  )
    return new Response("Only HTTPS TSN profiles are supported.", {
      status: 400,
    });
  try {
    const response = await fetch(page.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("TSN unavailable");
    let image = "";
    const rewriter = new HTMLRewriter().on('meta[property="og:image"]', {
      element(el) {
        image = el.getAttribute("content") || "";
      },
    });
    await rewriter.transform(response).text();
    if (!image.startsWith("https://")) throw new Error("No portrait");
    return new Response(image, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch {
    return new Response("No TSN image is available for this profile.", {
      status: 422,
    });
  }
}
