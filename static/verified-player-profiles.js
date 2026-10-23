/* Small verified metadata supplement, fetched only for unresolved source names. */
(function (root) {
  let pending;
  function parse(data, team) {
    if (
      data?.version !== 1 ||
      !Number.isFinite(Date.parse(data.checkedAt)) ||
      !Array.isArray(data.players)
    )
      throw Error("Invalid player data.");
    return data.players
      .filter(
        (p) =>
          p.sourceTeams?.includes(team) &&
          Number.isSafeInteger(p.id) &&
          ["F", "D", "G"].includes(p.group) &&
          p.name &&
          p.first &&
          p.last &&
          p.sourceUrl === `https://api-web.nhle.com/v1/player/${p.id}/landing`,
      )
      .map((p) => ({ ...p, supplemental: true }));
  }
  async function load(team) {
    if (!pending) {
      pending = fetch("/verified-players.json", { cache: "force-cache", signal: AbortSignal.timeout?.(6000) })
        .then((r) => {
          if (!r.ok) throw Error("Player data unavailable.");
          return r.json();
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return parse(await pending, team);
  }
  root.VerifiedPlayerProfiles = { load, parse };
})(globalThis);
