const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function cacheWithoutIndexedDB(clock) {
  const context = vm.createContext({
    structuredClone,
    ...(clock
      ? {
          Date: class extends Date {
            static now() {
              return clock();
            }
          },
        }
      : {}),
  });
  vm.runInContext(fs.readFileSync("static/player-cache.js", "utf8"), context);
  return context.DailyPlayerCache;
}
const valid = (data) => Array.isArray(data?.gameLog);
const shouldCache = (data) => !data._nhlStaleAt;

test("player cache shares pending fresh loads and returns isolated copies without IndexedDB", async () => {
  const cache = cacheWithoutIndexedDB();
  let calls = 0,
    finish;
  const source = { gameLog: [{ goals: 2, assists: 3 }] };
  const load = () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const a = cache.get("player:1", load, valid, shouldCache);
  const b = cache.get("player:1", load, valid, shouldCache);
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  finish(source);
  const [first, second] = await Promise.all([a, b]);
  assert.deepEqual(first, source);
  assert.deepEqual(second, source);
  assert.notEqual(first, second);
  assert.notEqual(first.gameLog, second.gameLog);
  first.gameLog[0].goals = 99;
  assert.equal(second.gameLog[0].goals, 2);
  const cached = await cache.get("player:1", load, valid, shouldCache);
  assert.equal(calls, 1);
  assert.equal(cached.gameLog[0].goals, 2);
  cached.gameLog.push({ goals: 7 });
  assert.equal((await cache.read("player:1", valid)).gameLog.length, 1);
});

test("valid stale player data shares a pending request but is never persisted as fresh", async () => {
  const cache = cacheWithoutIndexedDB();
  let calls = 0,
    finish;
  const source = {
    gameLog: [{ goals: 1, assists: 0 }],
    _nhlStaleAt: "2026-10-22T12:00:00.000Z",
  };
  const load = () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const a = cache.get("player:2", load, valid, shouldCache);
  const b = cache.get("player:2", load, valid, shouldCache);
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  finish(source);
  const [first, second] = await Promise.all([a, b]);
  assert.deepEqual(first, source);
  first.gameLog[0].goals = 99;
  assert.equal(second.gameLog[0].goals, 1);
  assert.equal(await cache.read("player:2", valid), null);
  const next = cache.get("player:2", load, valid, shouldCache);
  await new Promise(setImmediate);
  assert.equal(
    calls,
    2,
    "The completed stale response is not reused for another 24 hours",
  );
  finish(source);
  await next;
  assert.equal(await cache.read("player:2", valid), null);
  // An eventual successful refresh is cached normally under the same key.
  const fresh = { gameLog: [{ goals: 4, assists: 1 }] };
  await cache.get("player:2", async () => fresh, valid, shouldCache);
  assert.deepEqual(await cache.read("player:2", valid), fresh);
});

test("invalid player data and loader failures are not cached and release pending requests", async () => {
  const cache = cacheWithoutIndexedDB();
  let calls = 0;
  const invalid = async () => {
    calls++;
    return { error: "Unavailable" };
  };
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      cache.get("player:3", invalid, valid, shouldCache),
      /Invalid player data/,
    );
  assert.equal(calls, 2);
  assert.equal(await cache.read("player:3", valid), null);
  await assert.rejects(
    cache.get(
      "player:3",
      async () => {
        throw Error("Network error");
      },
      valid,
      shouldCache,
    ),
    /Network error/,
  );
  const good = { gameLog: [] };
  assert.deepEqual(
    await cache.get("player:3", async () => good, valid, shouldCache),
    good,
  );
  await cache.clear();
  assert.equal(await cache.read("player:3", valid), null);
});

test("player cache exposes the original successful timestamp without renewing a restored response", async () => {
  let now = Date.parse("2026-10-22T12:00:00.000Z");
  const cache = cacheWithoutIndexedDB(() => now);
  const source = { gameLog: [{ goals: 1 }] };
  const savedAt = now;
  await cache.get("player:4", async () => source, valid, shouldCache);
  now += 23 * 60 * 60 * 1000;
  const restored = await cache.read("player:4", valid, true);
  assert.equal(restored.at, savedAt);
  assert.deepEqual(restored.data, source);
  restored.data.gameLog[0].goals = 99;
  assert.deepEqual(
    await cache.read("player:4", valid),
    source,
    "Default read remains backwards-compatible and isolated",
  );
  assert.equal((await cache.read("player:4", valid, true)).at, savedAt);
  now += 60 * 60 * 1000;
  assert.equal(
    await cache.read("player:4", valid, true),
    null,
    "A restored entry expires 24 hours after its original success",
  );
});
