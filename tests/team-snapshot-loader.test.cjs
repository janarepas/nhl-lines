const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const now = Date.parse("2026-10-23T18:00:00.000Z");
const day = 86400000;
const iso = (age = 0) => new Date(now - age).toISOString();
const fixture = (overrides = {}) => ({
  version: 1,
  team: "ANA",
  rosterCheckedAt: iso(),
  roster: { forwards: [{ id: 8479404 }], defensemen: [], goalies: [] },
  statsCheckedAt: iso(),
  stats: { season: 20262027, gameType: 2, skaters: [] },
  ...overrides,
});
function loader(fetch = async () => response(fixture()), clock = () => now) {
  const context = vm.createContext({
    fetch,
    AbortSignal: { timeout: () => new AbortController().signal },
    Date: class extends Date {
      static now() {
        return clock();
      }
    },
  });
  vm.runInContext(fs.readFileSync("static/team-snapshot.js", "utf8"), context);
  return context.TeamSnapshot;
}
const response = (data) => ({ ok: true, json: async () => data });

test("snapshot parsing preserves original independent roster and statistics times", () => {
  const parse = loader().parse;
  const data = fixture({
    rosterCheckedAt: iso(2 * day),
    statsCheckedAt: iso(day / 2),
  });
  const parsed = parse(data, "ANA", now);
  assert.equal(parsed.roster._nhlStaleAt, now - 2 * day);
  assert.equal(parsed.stats._nhlStaleAt, now - day / 2);
  assert.equal(data.roster._nhlStaleAt, undefined);
  assert.equal(data.stats._nhlStaleAt, undefined);
});

test("rosters reject expiry, excessive future dates, mismatched teams and malformed groups", () => {
  const parse = loader().parse;
  for (const change of [
    { version: 2 },
    { team: "CGY" },
    { rosterCheckedAt: "invalid" },
    { rosterCheckedAt: iso(30 * day + 1) },
    { rosterCheckedAt: iso(-300001) },
    { roster: { forwards: [], defensemen: [] } },
    { roster: { forwards: {}, defensemen: [], goalies: [] } },
  ])
    assert.throws(
      () => parse(fixture(change), "ANA", now),
      /Invalid roster backup/,
    );
  for (const age of [30 * day, -300000])
    assert.equal(
      parse(fixture({ rosterCheckedAt: iso(age) }), "ANA", now).roster
        ._nhlStaleAt,
      now - age,
    );
});

test("expired, missing, future or malformed optional statistics retain valid roster metadata", () => {
  const parse = loader().parse;
  for (const change of [
    { stats: undefined, statsCheckedAt: undefined },
    { statsCheckedAt: "invalid" },
    { statsCheckedAt: iso(day + 1) },
    { statsCheckedAt: iso(-300001) },
    { stats: { season: 2026, gameType: 2, skaters: [] } },
    { stats: { season: 20262027, gameType: 1, skaters: [] } },
    { stats: { season: 20262027, gameType: 2, skaters: null } },
  ]) {
    const parsed = parse(fixture(change), "ANA", now);
    assert.equal(parsed.stats, null);
    assert.equal(parsed.roster._nhlStaleAt, now);
  }
  for (const age of [day, -300000])
    assert.equal(
      parse(fixture({ statsCheckedAt: iso(age) }), "ANA", now).stats
        ._nhlStaleAt,
      now - age,
    );
});

test("invalid team paths are rejected before making a request", async () => {
  let calls = 0;
  const source = loader(async () => {
    calls++;
    return response(fixture());
  });
  for (const team of ["ana", "AN", "ANAA", "../ANA", "ANA/", "", null])
    await assert.rejects(source.load(team), /Invalid team/);
  assert.equal(calls, 0);
});

test("concurrent and repeated team loads share one same-origin request", async () => {
  let calls = 0,
    finish;
  const source = loader((url, options) => {
    calls++;
    assert.equal(url, "/team-snapshots/ANA.json");
    assert.equal(options.cache, "no-cache");
    assert.ok(options.signal);
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = source.load("ANA"),
    second = source.load("ANA");
  assert.equal(calls, 1);
  finish(response(fixture()));
  for (const result of await Promise.all([first, second]))
    assert.equal(result.roster._nhlStaleAt, now);
  await source.load("ANA");
  assert.equal(calls, 1);
});

test("aborting one consumer does not poison another caller or the shared request", async () => {
  let calls = 0,
    finish;
  const controller = new AbortController();
  const source = loader(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const aborted = source.load("ANA", controller.signal),
    surviving = source.load("ANA");
  const rejection = assert.rejects(aborted, { name: "AbortError" });
  controller.abort();
  finish(response(fixture()));
  await rejection;
  assert.equal((await surviving).roster._nhlStaleAt, now);
  await source.load("ANA");
  assert.equal(calls, 1);
});

test("network, timeout, HTTP and JSON errors release a failed request for retry", async () => {
  for (const failure of [
    async () => {
      throw Error("Network unavailable");
    },
    async () => {
      throw new DOMException("Timed out", "TimeoutError");
    },
    async () => ({ ok: false }),
    async () => ({
      ok: true,
      json: async () => {
        throw Error("Invalid JSON");
      },
    }),
  ]) {
    let calls = 0;
    const source = loader(() =>
      ++calls === 1 ? failure() : Promise.resolve(response(fixture())),
    );
    await assert.rejects(source.load("ANA"));
    assert.equal((await source.load("ANA")).roster._nhlStaleAt, now);
    assert.equal(calls, 2);
  }
});

test("a rejected snapshot body can be retried after a corrected response", async () => {
  let calls = 0;
  const source = loader(async () =>
    response(++calls === 1 ? fixture({ team: "CGY" }) : fixture()),
  );
  await assert.rejects(source.load("ANA"), /Invalid roster backup/);
  assert.equal((await source.load("ANA")).roster._nhlStaleAt, now);
  assert.equal(calls, 2);
});

test("long-open tabs revalidate team JSON after the five-minute coalescing window", async () => {
  let time = now,
    calls = 0;
  const source = loader(
    async () => {
      calls++;
      return response(
        fixture({ rosterCheckedAt: new Date(time).toISOString() }),
      );
    },
    () => time,
  );
  assert.equal((await source.load("ANA")).roster._nhlStaleAt, now);
  time += 299999;
  assert.equal((await source.load("ANA")).roster._nhlStaleAt, now);
  assert.equal(calls, 1);
  time++;
  assert.equal((await source.load("ANA")).roster._nhlStaleAt, time);
  assert.equal(calls, 2);
});

test("an already-aborted consumer does not start a request", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const source = loader(async () => {
    calls++;
    return response(fixture());
  });
  await assert.rejects(source.load("ANA", controller.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 0);
});
