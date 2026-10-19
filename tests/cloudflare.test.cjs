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
    res = await onRequestGet({
      request: new Request("https://test/api/nhl?path=club-stats%2FSJS%2Fnow"),
    });
    assert.equal(res.status, 200);
    assert.equal(fetched, "https://api-web.nhle.com/v1/club-stats/SJS/now");

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

test("Daily Faceoff proxy uses fixed team mapping and never masks a blocked source", async () => {
  const teamsCode = fs.readFileSync("lib/dfo-teams.js", "utf8");
  const source = fs
    .readFileSync("functions/api/lines.js", "utf8")
    .replace(
      "../../lib/dfo-teams.js",
      "data:text/javascript;base64," +
        Buffer.from(teamsCode).toString("base64"),
    );
  const { onRequestGet } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const original = global.fetch;
  let called = "";
  global.fetch = async (url) => {
    called = url;
    return new Response("<h2>Forwards</h2>", {
      headers: { "Content-Type": "text/html" },
    });
  };
  try {
    let res = await onRequestGet({
      request: new Request("https://test/api/lines?team=TBL"),
    });
    assert.equal(res.status, 200);
    assert.equal(
      called,
      "https://www.dailyfaceoff.com/teams/tampa-bay-lightning/line-combinations",
    );
    assert.match(await res.text(), /Forwards/);
    called = "";
    res = await onRequestGet({
      request: new Request("https://test/api/lines?team=../../evil"),
    });
    assert.equal(res.status, 400);
    assert.equal(called, "");
    global.fetch = async () => new Response("blocked", { status: 403 });
    res = await onRequestGet({
      request: new Request("https://test/api/lines?team=TBL"),
    });
    assert.equal(res.status, 502);
    assert.match(await res.text(), /nem tölthetők/);
  } finally {
    global.fetch = original;
  }
});

test("Daily Faceoff canonical redirects work and denial remains explicit", async () => {
  const teamsCode = fs.readFileSync("lib/dfo-teams.js", "utf8");
  const source = fs
    .readFileSync("functions/api/lines.js", "utf8")
    .replace(
      "../../lib/dfo-teams.js",
      "data:text/javascript;base64," +
        Buffer.from(teamsCode).toString("base64"),
    );
  const { onRequestGet } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const original = global.fetch;
  const request = new Request("https://test/api/lines?team=TBL");
  let count = 0;
  try {
    global.fetch = async (url) =>
      ++count === 1
        ? new Response(null, {
            status: 301,
            headers: {
              Location:
                "https://www.dailyfaceoff.com/teams/tampa-bay-lightning/line-combinations/",
            },
          })
        : new Response("<h2>Forwards</h2>");
    let response = await onRequestGet({ request });
    assert.equal(response.status, 200);
    assert.equal(count, 2);
    global.fetch = async () => new Response("denied", { status: 403 });
    response = await onRequestGet({ request });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("X-Upstream-Status"), "403");
    assert.equal(response.headers.get("X-Line-Error"), "source-access-denied");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(await response.text(), /403/);
    global.fetch = async () =>
      new Response("<title>Attention Required! | Cloudflare</title>");
    response = await onRequestGet({ request });
    assert.equal(response.headers.get("X-Line-Error"), "source-challenge");
    count = 0;
    global.fetch = async () => {
      count++;
      return new Response(null, {
        status: 302,
        headers: { Location: "https://example.com/" },
      });
    };
    response = await onRequestGet({ request });
    assert.equal(response.status, 502);
    assert.equal(count, 1);
  } finally {
    global.fetch = original;
  }
});

test("PK proxy fetches only public fixed page and reports denied or malformed responses", async () => {
  const { onRequestGet } = await import(
    "data:text/javascript;base64," +
      Buffer.from(
        fs.readFileSync("functions/api/penalty-kill.js", "utf8"),
      ).toString("base64")
  );
  const original = global.fetch;
  try {
    let options;
    global.fetch = async (url, init) => {
      assert.equal(url, "https://www.rotowire.com/hockey/depth-charts-pk.php");
      options = init;
      return new Response("<h1>NHL Penalty Kill Depth Charts</h1>");
    };
    const success = await onRequestGet();
    assert.equal(success.status, 200);
    assert.match(success.headers.get("Content-Type"), /text\/plain/);
    assert.equal(options.redirect, "manual");
    for (const response of [
      new Response("Denied", { status: 403 }),
      new Response("Wrong page"),
      new Response("NHL Penalty Kill Depth Charts" + "x".repeat(2000000)),
    ]) {
      global.fetch = async () => response;
      const error = await onRequestGet();
      assert.equal(error.status, 502);
      assert.equal(error.headers.get("Cache-Control"), "no-store");
    }
  } finally {
    global.fetch = original;
  }
});

test("NHL proxy manually follows only canonical same-player/team season redirects", async () => {
  const { onRequestGet } = await handler;
  const original = global.fetch;
  const cases = [
    ["roster/CHI/current", "/v1/roster/CHI/20262027"],
    ["club-stats/CHI/now", "/v1/club-stats/CHI/20262027/2"],
    ["player/8478402/game-log/now", "/v1/player/8478402/game-log/20262027/2"],
  ];
  try {
    for (const [path, location] of cases) {
      const calls = [];
      global.fetch = async (url, options) => {
        calls.push(url);
        assert.equal(options.redirect, "manual");
        assert.equal(options.cf.cacheTtlByStatus["400-599"], 0);
        return calls.length === 1
          ? new Response(null, { status: 307, headers: { Location: location } })
          : Response.json({ valid: true });
      };
      const response = await onRequestGet({
        request: new Request(
          "https://test/api/nhl?path=" + encodeURIComponent(path),
        ),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(calls, [
        "https://api-web.nhle.com/v1/" + path,
        "https://api-web.nhle.com" + location,
      ]);
    }
    for (const location of [
      "https://evil.com/v1/roster/CHI/20262027",
      "/v1/roster/EDM/20262027",
      "http://api-web.nhle.com/v1/roster/CHI/20262027",
      "/v1/roster/CHI/20262027?url=evil",
    ]) {
      let count = 0;
      global.fetch = async () => {
        count++;
        return new Response(null, {
          status: 307,
          headers: { Location: location },
        });
      };
      const response = await onRequestGet({
        request: new Request(
          "https://test/api/nhl?path=roster%2FCHI%2Fcurrent",
        ),
      });
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("X-NHL-Error"), "redirect");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(count, 1);
    }
    global.fetch = async () => {
      throw Error("Connection failure");
    };
    const error = await onRequestGet({
      request: new Request("https://test/api/nhl?path=roster%2FCHI%2Fcurrent"),
    });
    assert.equal(error.headers.get("X-NHL-Error"), "connection");
  } finally {
    global.fetch = original;
  }
});

test("NHL success cache prevents duplicate origin requests; 429 is not cached and preserves retry delay", async () => {
  const { onRequestGet } = await handler;
  const originalFetch = global.fetch,
    originalCaches = global.caches;
  const saved = new Map();
  global.caches = {
    default: {
      match: async (key) => saved.get(key.url)?.clone(),
      put: async (key, response) => saved.set(key.url, response.clone()),
    },
  };
  let calls = 0;
  try {
    global.fetch = async () => {
      calls++;
      return Response.json({ forwards: [], defensemen: [], goalies: [] });
    };
    const request = new Request(
      "https://test/api/nhl?path=roster%2FCHI%2Fcurrent",
    );
    assert.equal((await onRequestGet({ request })).status, 200);
    const cached = await onRequestGet({ request });
    assert.equal(cached.status, 200);
    assert.match(cached.headers.get("Cache-Control"), /s-maxage=300/);
    assert.equal(calls, 1);
    global.fetch = async () => {
      calls++;
      return new Response("Too many requests", {
        status: 429,
        headers: { "Retry-After": "91" },
      });
    };
    const other = new Request(
      "https://test/api/nhl?path=roster%2FTOR%2Fcurrent",
    );
    for (let i = 0; i < 2; i++) {
      const response = await onRequestGet({ request: other });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Retry-After"), "91");
      assert.equal(response.headers.get("X-Upstream-Status"), "429");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
    assert.equal(calls, 3);
    assert.equal(saved.size, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalCaches === undefined) delete global.caches;
    else global.caches = originalCaches;
  }
});

test("League leaders share explicit canonical redirect handling", async () => {
  const { onRequestGet } = await handler;
  const original = global.fetch;
  const calls = [];
  try {
    global.fetch = async (url) => {
      calls.push(url);
      return calls.length === 1
        ? new Response(null, {
            status: 307,
            headers: {
              Location:
                "https://api-web.nhle.com/v1/skater-stats-leaders/20262027/2?categories=points&limit=-1",
            },
          })
        : Response.json({ points: [{ id: 8478402, points: 10 }] });
    };
    const response = await onRequestGet({
      request: new Request(
        "https://test/api/nhl?path=skater-stats-leaders%2Fcurrent",
      ),
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(
      calls[0],
      "https://api-web.nhle.com/v1/skater-stats-leaders/current?categories=points&limit=-1",
    );
    assert.equal((await response.json()).points.length, 1);
  } finally {
    global.fetch = original;
  }
});
