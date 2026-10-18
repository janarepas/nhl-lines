const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const handler = import(
  "data:text/javascript;base64," +
    Buffer.from(fs.readFileSync("functions/api/nhl.js", "utf8")).toString(
      "base64",
    )
);
test("Cloudflare NHL proxy limits routes and relays upstream errors", async () => {
  const { onRequestGet } = await handler;
  const original = global.fetch;
  let fetched = "";
  global.fetch = async (url) => {
    fetched = url;
    return Response.json({ forwards: [], defensemen: [], goalies: [] });
  };
  try {
    let res = await onRequestGet({
      request: new Request("https://test/api/nhl?path=roster%2FEDM%2Fcurrent"),
    });
    assert.equal(res.status, 200);
    assert.equal(fetched, "https://api-web.nhle.com/v1/roster/EDM/current");
    assert.deepEqual((await res.json()).forwards, []);
    fetched = "";
    res = await onRequestGet({
      request: new Request(
        "https://test/api/nhl?path=" + encodeURIComponent("https://evil.com/"),
      ),
    });
    assert.equal(res.status, 400);
    assert.equal(fetched, "");
    global.fetch = async () => new Response("denied", { status: 403 });
    res = await onRequestGet({
      request: new Request(
        "https://test/api/nhl?path=player%2F8478402%2Fgame-log%2Fnow",
      ),
    });
    assert.equal(res.status, 502);
    assert.ok((await res.json()).error);
  } finally {
    global.fetch = original;
  }
});
