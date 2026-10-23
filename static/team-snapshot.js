/* Static last-good identities remain useful on a first visit during API downtime. */
(function (root) {
  const requests = new Map(),
    day = 86400000;
  function parse(data, team, now = Date.now()) {
    const at = Date.parse(data?.rosterCheckedAt),
      age = now - at;
    if (
      data?.version !== 1 ||
      data.team !== team ||
      !Number.isFinite(at) ||
      age < -300000 ||
      age > 30 * day ||
      !["forwards", "defensemen", "goalies"].every((k) =>
        Array.isArray(data.roster?.[k]),
      )
    )
      throw Error("Invalid roster backup.");
    const statsAt = Date.parse(data.statsCheckedAt),
      statsAge = now - statsAt;
    const stats =
      Number.isFinite(statsAt) &&
      statsAge >= -300000 &&
      statsAge <= day &&
      /^\d{8}$/.test(String(data.stats?.season)) &&
      [2, 3].includes(data.stats?.gameType) &&
      Array.isArray(data.stats?.skaters)
        ? { ...data.stats, _nhlStaleAt: statsAt }
        : null;
    return { roster: { ...data.roster, _nhlStaleAt: at }, stats };
  }
  async function load(team, signal) {
    if (!/^[A-Z]{3}$/.test(team)) throw Error("Invalid team.");
    signal?.throwIfAborted();
    let entry = requests.get(team);
    if (!entry || Date.now() - entry.at >= 300000) {
      const request = fetch(`/team-snapshots/${team}.json`, {
        cache: "no-cache",
        signal: AbortSignal.timeout?.(6000),
      }).then((r) => {
        if (!r.ok) throw Error("Roster backup unavailable.");
        return r.json();
      });
      entry = { request, at: Date.now() };
      requests.set(team, entry);
      request.catch(() => {
        if (requests.get(team) === entry) requests.delete(team);
      });
    }
    try {
      const data = await entry.request;
      signal?.throwIfAborted();
      return parse(data, team);
    } catch (error) {
      if (!signal?.aborted && requests.get(team) === entry)
        requests.delete(team);
      throw error;
    }
  }
  root.TeamSnapshot = { load, parse };
})(globalThis);
