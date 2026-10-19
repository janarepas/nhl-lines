const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const handler = import(
  "data:text/javascript;base64," +
    Buffer.from(fs.readFileSync("functions/api/lineups.js")).toString("base64")
);
test("published feed uses fixed attributed source and refuses errors or wrong schema", async () => {
  const { onRequestGet } = await handler;
  const original = global.fetch;
  try {
    let url, options;
    global.fetch = async (u, o) => {
      url = u;
      options = o;
      return Response.json({
        source: "dailyfaceoff.com",
        updated_at: "2026-10-19 14:45:21 UTC",
        teams: {},
      });
    };
    let response = await onRequestGet();
    assert.equal(response.status, 200);
    assert.equal(
      url,
      "https://raw.githubusercontent.com/hg913488/nhl-line-combos-app/main/data/lines.json",
    );
    assert.equal(options.redirect, "error");
    assert.equal(response.headers.get("X-Line-Provider"), "Between the Lines");
    for (const result of [
      new Response("denied", { status: 403 }),
      Response.json({}),
      new Response("<html>challenge</html>"),
    ]) {
      global.fetch = async () => result;
      response = await onRequestGet();
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
  } finally {
    global.fetch = original;
  }
});
