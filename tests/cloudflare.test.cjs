const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const handler = import(
  "data:text/javascript;base64," +
    Buffer.from(fs.readFileSync("functions/api/nhl.js", "utf8")).toString(
      "base64",
    )
);
function nhlFixture(path) {
  if (path.startsWith("roster/") || path.startsWith("prospects/"))
    return { forwards: [], defensemen: [], goalies: [] };
  if (path.startsWith("club-stats/")) return { skaters: [], goalies: [] };
  if (path.endsWith("/landing"))
    return { playerId: Number(path.split("/")[1]), seasonTotals: [] };
  return { gameLog: [] };
}
test("Cloudflare NHL proxy limits routes and relays upstream errors", async () => {
  const { onRequestGet } = await handler;
  const original = global.fetch;
  let fetched = "";
  global.fetch = async (url) => {
    fetched = url;
    return Response.json(nhlFixture(new URL(url).pathname.slice(4)));
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
    res = await onRequestGet({
      request: new Request("https://test/api/nhl?path=prospects%2FANA"),
    });
    assert.equal(res.status, 200);
    assert.equal(fetched, "https://api-web.nhle.com/v1/prospects/ANA");
    res = await onRequestGet({
      request: new Request(
        "https://test/api/nhl?path=prospects%2FANA%3Furl%3Devil",
      ),
    });
    assert.equal(res.status, 400);

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
    assert.match(await res.text(), /unavailable/);
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
    ["player/8478402/landing", "/v1/player/8478402/landing"],
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
          : Response.json(nhlFixture(path));
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
    assert.equal(saved.size, 2);
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

test("NHL last-good data survives transient failures without extending its age or masking permanent errors", async () => {
  const { onRequestGet } = await handler;
  const originalFetch = global.fetch,
    originalCaches = global.caches;
  const saved = new Map();
  let puts = 0,
    calls = 0;
  global.caches = {
    default: {
      match: async (key) => saved.get(key.url)?.clone(),
      put: async (key, response) => {
        puts++;
        saved.set(key.url, response.clone());
      },
    },
  };
  const request = new Request(
    "https://test/api/nhl?path=player%2F8478402%2Fgame-log%2Fnow",
  );
  const expected = {
    gameLog: [{ gameDate: "2026-10-22", goals: 1, assists: 2 }],
  };
  try {
    global.fetch = async () => {
      calls++;
      return Response.json(expected);
    };
    const fresh = await onRequestGet({ request });
    assert.equal(fresh.headers.get("X-Data-State"), "fresh");
    const checkedAt = fresh.headers.get("X-NHL-Checked-At");
    assert.ok(Number.isFinite(Date.parse(checkedAt)));
    assert.equal(puts, 2);
    // Simulate the normal cache entry reaching its five-minute expiry.
    saved.delete(request.url);
    const backupKey = [...saved.keys()][0];
    assert.equal(new URL(backupKey).pathname, "/api/nhl-last-good");
    assert.equal(
      saved.get(backupKey).headers.get("Cache-Control"),
      "public, max-age=86400",
    );
    for (const failure of [
      () => new Response("Unavailable", { status: 503 }),
      () => {
        throw Error("Connection failure");
      },
    ]) {
      global.fetch = async () => {
        calls++;
        return failure();
      };
      const response = await onRequestGet({ request });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Data-State"), "stale");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("X-NHL-Checked-At"), checkedAt);
      assert.match(response.headers.get("Warning"), /stale/);
      assert.deepEqual(await response.json(), expected);
      assert.equal(
        puts,
        2,
        "Serving saved data never resets its timestamp or stores the failure",
      );
    }
    assert.equal(
      calls,
      3,
      "One origin attempt per request, with no retry storm",
    );
    for (const failure of [
      () => new Response("Denied", { status: 403 }),
      () =>
        new Response("Rate limited", {
          status: 429,
          headers: { "Retry-After": "91" },
        }),
      () => Response.json({ error: "Invalid source data" }),
      () => new Response("{bad json"),
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.example/" },
        }),
    ]) {
      global.fetch = async () => failure();
      const response = await onRequestGet({ request });
      assert.ok(response.status >= 500);
      assert.equal(response.headers.get("X-Data-State"), null);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.ok((await response.json()).error);
    }
    // Cache APIs may return an old stored response; check its original timestamp too.
    const expired = saved.get(backupKey).clone();
    expired.headers.set(
      "X-NHL-Checked-At",
      new Date(Date.now() - 86400001).toISOString(),
    );
    saved.set(backupKey, expired);
    global.fetch = async () => new Response("Unavailable", { status: 503 });
    const expiredResult = await onRequestGet({ request });
    assert.equal(expiredResult.status, 502);
    assert.equal(expiredResult.headers.get("X-Upstream-Status"), "503");
    assert.equal(expiredResult.headers.get("X-Data-State"), null);
    // No cross-player fallback and no invented empty payload on a first-visit failure.
    const unknown = await onRequestGet({
      request: new Request(
        "https://test/api/nhl?path=player%2F8478403%2Fgame-log%2Fnow",
      ),
    });
    assert.equal(unknown.status, 502);
    assert.ok((await unknown.json()).error);
  } finally {
    global.fetch = originalFetch;
    if (originalCaches === undefined) delete global.caches;
    else global.caches = originalCaches;
  }
});

test("NHL proxy rejects wrong endpoint shapes before either success cache is written", async () => {
  const { onRequestGet } = await handler;
  const originalFetch = global.fetch,
    originalCaches = global.caches;
  let puts = 0;
  global.caches = {
    default: {
      match: async () => undefined,
      put: async () => {
        puts++;
      },
    },
  };
  try {
    for (const [path, payload] of [
      ["roster/ANA/current", { skaters: [] }],
      ["prospects/ANA", { forwards: [], defensemen: [] }],
      ["club-stats/ANA/now", { forwards: [], defensemen: [], goalies: [] }],
      ["player/8478402/game-log/now", { gameLog: "not an array" }],
      ["player/8478402/landing", { playerId: 8478403, seasonTotals: [] }],
      ["player/8478402/landing", { playerId: 8478402 }],
      ["skater-stats-leaders/current", { points: {} }],
    ]) {
      global.fetch = async () => Response.json(payload);
      const response = await onRequestGet({
        request: new Request(
          "https://test/api/nhl?path=" + encodeURIComponent(path),
        ),
      });
      assert.equal(response.status, 502, path);
      assert.equal(response.headers.get("X-NHL-Error"), "schema", path);
      assert.equal(response.headers.get("Cache-Control"), "no-store", path);
      assert.ok((await response.json()).error);
    }
    assert.equal(puts, 0, "Wrong-shape JSON never becomes last-good data");
  } finally {
    global.fetch = originalFetch;
    if (originalCaches === undefined) delete global.caches;
    else global.caches = originalCaches;
  }
});
