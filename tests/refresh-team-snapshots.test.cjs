const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { refresh } = require("../scripts/refresh-team-snapshots.cjs");
const { makeSnapshot, teams } = require("../scripts/build-team-snapshots.cjs");

const oldTime = "2026-10-22T12:00:00.000Z";
const freshTime = "2026-10-23T18:00:00.000Z";
const roster = () => ({
  forwards: [
    {
      id: 8478402,
      firstName: { default: "Connor" },
      lastName: { default: "McDavid" },
      sweaterNumber: 97,
      positionCode: "C",
    },
  ],
  defensemen: [],
  goalies: [],
});
const stats = (points = 2) => ({
  season: 20262027,
  gameType: 2,
  skaters: [
    {
      playerId: 8478402,
      firstName: { default: "Connor" },
      lastName: { default: "McDavid" },
      gamesPlayed: 1,
      goals: 1,
      assists: points - 1,
      points,
    },
  ],
  goalies: [],
});
const response = (body, status = 200, retryAfter = false, location = null) => ({
  ok: status === 200,
  status,
  headers: {
    has: (key) => key === "retry-after" && retryAfter,
    get: (key) => (key === "location" ? location : null),
  },
  json: async () => structuredClone(body),
});
async function temporary(t) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nextshift-refresh-test-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
async function save(directory, snapshot) {
  const file = path.join(directory, `${snapshot.team}.json`);
  await fs.writeFile(file, JSON.stringify(snapshot) + "\n");
  return file;
}
const options = (directory, fetchImpl) => ({
  outputDirectory: directory,
  teamCodes: ["EDM"],
  fetchImpl,
  now: () => Date.parse(freshTime),
});

test("refresh failures preserve previous valid data and both source times byte for byte", async (t) => {
  const directory = await temporary(t);
  const file = await save(
    directory,
    makeSnapshot("EDM", roster(), oldTime, stats(), oldTime),
  );
  const original = await fs.readFile(file, "utf8");
  const report = await refresh(
    options(directory, async () => {
      throw Error("Source unavailable");
    }),
  );
  assert.equal(await fs.readFile(file, "utf8"), original);
  assert.equal(report.requests, 2);
  assert.equal(report.updatedTeams, 0);
  assert.equal(report.errors.length, 2);
});

test("a successful roster refresh retains failed statistics with their original timestamp", async (t) => {
  const directory = await temporary(t);
  const file = await save(
    directory,
    makeSnapshot("EDM", roster(), oldTime, stats(), oldTime),
  );
  const report = await refresh(
    options(directory, async (url) =>
      url.includes("/roster/") ? response(roster()) : response(null, 503),
    ),
  );
  const result = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(result.rosterCheckedAt, freshTime);
  assert.equal(result.statsCheckedAt, oldTime);
  assert.equal(result.stats.skaters[0].points, 2);
  assert.equal(report.rosterUpdates, 1);
  assert.equal(report.statsUpdates, 0);
});

test("fresh statistics can update independently while failed roster metadata keeps its source time", async (t) => {
  const directory = await temporary(t);
  const file = await save(
    directory,
    makeSnapshot("EDM", roster(), oldTime, stats(), oldTime),
  );
  const report = await refresh(
    options(directory, async (url) =>
      url.includes("/roster/") ? response(null, 500) : response(stats(3)),
    ),
  );
  const result = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(result.rosterCheckedAt, oldTime);
  assert.equal(result.statsCheckedAt, freshTime);
  assert.equal(result.stats.skaters[0].points, 3);
  assert.equal(report.rosterUpdates, 0);
  assert.equal(report.statsUpdates, 1);
});

test("invalid upstream data never replaces a verified snapshot or renews its timestamp", async (t) => {
  const directory = await temporary(t);
  const file = await save(
    directory,
    makeSnapshot("EDM", roster(), oldTime, stats(), oldTime),
  );
  const original = await fs.readFile(file, "utf8");
  const report = await refresh(
    options(directory, async (url) =>
      response(
        url.includes("/roster/")
          ? { forwards: [], defensemen: [], goalies: [] }
          : { ...stats(), skaters: [{ ...stats().skaters[0], points: 99 }] },
      ),
    ),
  );
  assert.equal(await fs.readFile(file, "utf8"), original);
  assert.equal(report.updatedTeams, 0);
  assert.equal(report.errors.length, 2);
});

test("new teams can save verified metadata without inventing unavailable statistics", async (t) => {
  const directory = await temporary(t);
  const report = await refresh(
    options(directory, async (url) =>
      url.includes("/roster/") ? response(roster()) : response(null, 404),
    ),
  );
  const result = JSON.parse(
    await fs.readFile(path.join(directory, "EDM.json"), "utf8"),
  );
  assert.equal(result.rosterCheckedAt, freshTime);
  assert.equal(result.stats, undefined);
  assert.equal(result.statsCheckedAt, undefined);
  assert.equal(report.updatedTeams, 1);
});

test("429 and Retry-After stop new work without retrying or touching failed teams", async (t) => {
  for (const [status, retryAfter] of [
    [429, false],
    [503, true],
  ]) {
    const directory = await temporary(t);
    const urls = [];
    const report = await refresh({
      ...options(directory, async (url) => {
        urls.push(url);
        return response(null, status, retryAfter);
      }),
      teamCodes: ["EDM", "ANA", "CGY", "BOS"],
    });
    assert.equal(report.rateLimited, true);
    assert.ok(urls.length <= 2, "Only already in-flight workers may complete");
    assert.equal(report.updatedTeams, 0);
    assert.deepEqual(await fs.readdir(directory), []);
  }
});

test("a full fixture refresh makes exactly 64 fixed official requests with at most two in flight", async (t) => {
  const directory = await temporary(t);
  let active = 0,
    maximum = 0;
  const urls = [];
  const report = await refresh({
    outputDirectory: directory,
    now: () => Date.parse(freshTime),
    fetchImpl: async (url, request) => {
      urls.push(url);
      active++;
      maximum = Math.max(maximum, active);
      assert.match(
        url,
        /^https:\/\/api-web\.nhle\.com\/v1\/(roster\/[A-Z]{3}\/current|club-stats\/[A-Z]{3}\/now)$/,
      );
      assert.equal(request.redirect, "manual");
      assert.ok(request.signal);
      await new Promise(setImmediate);
      active--;
      return response(url.includes("/roster/") ? roster() : stats());
    },
  });
  assert.equal(report.updatedTeams, 32);
  assert.equal(report.requests, 64);
  assert.equal(new Set(urls).size, 64);
  assert.equal(maximum, 2);
  assert.equal((await fs.readdir(directory)).length, 32);
  assert.equal(report.rosterUpdates, teams.length);
  assert.equal(report.statsUpdates, teams.length);
});

test("canonical official season redirects are followed once with shared timeouts and at most 128 total requests", async (t) => {
  const directory = await temporary(t);
  let active = 0,
    maximum = 0;
  const initialSignals = new Map();
  const report = await refresh({
    outputDirectory: directory,
    now: () => Date.parse(freshTime),
    fetchImpl: async (url, request) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(setImmediate);
      active--;
      const source = new URL(url),
        parts = source.pathname.split("/");
      const key = parts[2] + "/" + parts[3];
      assert.equal(request.redirect, "manual");
      if (url.endsWith("/current") || url.endsWith("/now")) {
        initialSignals.set(key, request.signal);
        const target = url.endsWith("/current")
          ? url.replace(/current$/, "20262027")
          : url.replace(/now$/, "20262027/2");
        return response(
          null,
          307,
          false,
          url.endsWith("/now") ? new URL(target).pathname : target,
        );
      }
      assert.equal(
        request.signal,
        initialSignals.get(key),
        "Both hops share a single 20-second timeout",
      );
      return response(url.includes("/roster/") ? roster() : stats());
    },
  });
  assert.equal(report.requests, 128);
  assert.equal(report.updatedTeams, 32);
  assert.equal(report.errors.length, 0);
  assert.equal(maximum, 2);
});

test("redirects cannot escape the fixed official origin, team, source type or canonical season route", async (t) => {
  for (const location of [
    "https://example.com/v1/roster/EDM/20262027",
    "http://api-web.nhle.com/v1/roster/EDM/20262027",
    "https://user:secret@api-web.nhle.com/v1/roster/EDM/20262027",
    "https://api-web.nhle.com:444/v1/roster/EDM/20262027",
    "/v1/roster/ANA/20262027",
    "/v1/club-stats/EDM/20262027/2",
    "/v1/roster/EDM/2026",
    "/v1/roster/EDM/20262027?extra=true",
    "/v1/roster/EDM/20262027?",
    "/v1/roster/EDM/20262027#fragment",
    "/v1/roster/EDM/20262027#",
    null,
  ]) {
    const directory = await temporary(t);
    const file = await save(
      directory,
      makeSnapshot("EDM", roster(), oldTime, stats(), oldTime),
    );
    const original = await fs.readFile(file, "utf8"),
      urls = [];
    const report = await refresh(
      options(directory, async (url) => {
        urls.push(url);
        return url.includes("/roster/")
          ? response(null, 307, false, location)
          : response(null, 503);
      }),
    );
    assert.equal(
      report.requests,
      2,
      `Unsafe target must not be requested: ${location}`,
    );
    assert.equal(report.updatedTeams, 0);
    assert.equal(await fs.readFile(file, "utf8"), original);
    assert.ok(
      urls.every((url) => url.endsWith("/current") || url.endsWith("/now")),
    );
  }
});

test("statistics redirects require the same team and season plus regular-season or playoff game type", async (t) => {
  for (const location of [
    "/v1/club-stats/EDM/20262027/1",
    "/v1/club-stats/EDM/20262027/4",
    "/v1/club-stats/ANA/20262027/2",
    "/v1/roster/EDM/20262027",
    "/v1/club-stats/EDM/2026/2",
  ]) {
    const directory = await temporary(t);
    const report = await refresh(
      options(directory, async (url) =>
        url.endsWith("/current")
          ? response(roster())
          : response(null, 307, false, location),
      ),
    );
    const saved = JSON.parse(
      await fs.readFile(path.join(directory, "EDM.json"), "utf8"),
    );
    assert.equal(report.requests, 2);
    assert.equal(report.rosterUpdates, 1);
    assert.equal(report.statsUpdates, 0);
    assert.equal(saved.stats, undefined);
    assert.match(report.errors[0].error, /Unsafe NHL redirect/);
  }
});

test("a second redirect is rejected without a third request", async (t) => {
  const directory = await temporary(t);
  const report = await refresh(
    options(directory, async (url) => {
      if (url.includes("/roster/"))
        return response(null, 307, false, "/v1/roster/EDM/20262027");
      return response(null, 503);
    }),
  );
  assert.equal(report.requests, 3);
  assert.equal(report.updatedTeams, 0);
  assert.match(report.errors[0].error, /Invalid NHL redirect/);
});

test("Retry-After on redirects and 429 on canonical responses stop subsequent source requests", async (t) => {
  for (const onRedirect of [true, false]) {
    const directory = await temporary(t);
    const report = await refresh(
      options(directory, async (url) => {
        if (url.endsWith("/current"))
          return response(null, 307, onRedirect, "/v1/roster/EDM/20262027");
        return response(null, 429);
      }),
    );
    assert.equal(report.rateLimited, true);
    assert.equal(report.requests, onRedirect ? 1 : 2);
    assert.equal(report.updatedTeams, 0);
    assert.deepEqual(await fs.readdir(directory), []);
  }
});
