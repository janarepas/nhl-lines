/* Successful player data is reused for 24 hours, including across page loads. */
(function (root) {
  const MAX_AGE = 24 * 60 * 60 * 1000;
  const memory = new Map();
  const pending = new Map();
  let database;
  function open() {
    if (!database)
      database = new Promise((resolve) => {
        if (!root.indexedDB) return resolve(null);
        const request = root.indexedDB.open("line-combos-player-data", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("responses");
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
      }).catch(() => null);
    return database;
  }
  async function storage(mode, key, value) {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction("responses", mode);
        const store = tx.objectStore("responses");
        const request =
          mode === "readonly"
            ? store.get(key)
            : value === undefined
              ? store.clear()
              : store.put(value, key);
        let result;
        request.onsuccess = () => {
          result = request.result;
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  function fresh(record) {
    const age = Date.now() - record?.at;
    return age >= 0 && age < MAX_AGE;
  }
  async function read(key, valid = () => true, withTimestamp = false) {
    let record = memory.get(key);
    if (!fresh(record)) record = await storage("readonly", key);
    if (fresh(record) && valid(record.data)) {
      memory.set(key, record);
      const data = structuredClone(record.data);
      return withTimestamp ? { data, at: record.at } : data;
    }
    return null;
  }
  async function get(key, load, valid = () => true, shouldCache = () => true) {
    // Share the storage lookup too, not just the eventual network request.
    if (!pending.has(key)) {
      const request = (async () => {
        const cached = await read(key, valid);
        if (cached !== null) return cached;
        const data = await load();
        if (!valid(data)) throw Error("Invalid player data.");
        // Saved origin data can remain useful during an outage without being
        // persisted as a newly fetched 24-hour response on the client.
        if (shouldCache(data)) {
          const record = { at: Date.now(), data };
          memory.set(key, record);
          await storage("readwrite", key, record);
        }
        return data;
      })();
      pending.set(key, request);
      request
        .finally(() => {
          if (pending.get(key) === request) pending.delete(key);
        })
        .catch(() => {});
    }
    return structuredClone(await pending.get(key));
  }
  async function clear() {
    memory.clear();
    await storage("readwrite");
  }
  root.DailyPlayerCache = { get, read, clear, MAX_AGE };
})(globalThis);
