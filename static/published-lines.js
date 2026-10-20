/* Adapt public name-based lineup rows without calculating or reordering units. */
(function (root) {
  const norm = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  // Explicit, verified source-name aliases only; never match by surname alone.
  const aliases = Object.freeze({
    nicholasrobertson: 8481582,
    jacobmiddleton: 8478136,
    gabrielperreault: 8484210,
    gabeperreault: 8484210,
    gabeperraault: 8484210,
    alexkerfoot: 8477021,
    alexanderkerfoot: 8477021,
    zackboulduc: 8482737,
    zackbolduc: 8482737,
    zachbolduc: 8482737,
    zacharybolduc: 8482737,
    jonnybrodzinski: 8477380,
    johnnybrodzinski: 8477380,
    jonathanbrodzinski: 8477380,
    jonathonbrodzinski: 8477380,
  });
  function matchingPlayer(name, roster) {
    const key = norm(name);
    return (
      roster.find(
        (p) =>
          Number.isSafeInteger(p.id) &&
          (norm(p.name) === key ||
            p.nameAliases?.some((alias) => norm(alias) === key)),
      ) ||
      roster.find((p) => Number.isSafeInteger(p.id) && p.id === aliases[key])
    );
  }
  function reconcile(data, roster) {
    if (!valid(data)) return data;
    const copy = structuredClone(data);
    const replacements = new Map();
    copy.extra = copy.extra.filter((p) => {
      const match = matchingPlayer(p.name, roster);
      if (!match) return true;
      replacements.set(p.id, match.id);
      return false;
    });
    for (const key of ["forwards", "defense", "pp", "pk"])
      copy[key] = copy[key].map((row) =>
        row.map((id) => replacements.get(id) ?? id),
      );
    copy.goalies = copy.goalies.map((id) => replacements.get(id) ?? id);
    return copy;
  }
  const sourceUrl =
    "https://github.com/hg913488/nhl-line-combos-app/blob/main/data/lines.json";
  function parse(data, roster, slug, team, now = Date.now()) {
    const updated = String(data?.updated_at || "")
      .replace(" ", "T")
      .replace(" UTC", "Z");
    const time = Date.parse(updated);
    if (
      data?.source !== "dailyfaceoff.com" ||
      !Number.isFinite(time) ||
      time > now + 600000 ||
      now - time > 7 * 86400000
    )
      throw Error("Missing or outdated published lineup data.");
    const entry = data.teams?.[slug];
    if (!entry)
      throw Error("Published line combinations are missing for this team.");
    const extra = new Map();
    const player = (name, group) => {
      if (typeof name !== "string" || !name.trim() || name.length > 100)
        throw Error("Invalid player name in the feed.");
      const match = matchingPlayer(name, roster);
      if (match) return match.id;
      const id = "dfo:" + norm(name);
      if (!extra.has(id)) {
        const words = name
          .trim()
          .toLocaleLowerCase()
          .replace(/(^|[ .'-])\p{L}/gu, (s) => s.toLocaleUpperCase())
          .split(/\s+/);
        extra.set(id, {
          id,
          name: words.join(" "),
          first: words.slice(0, -1).join(" "),
          last: words.at(-1),
          number: "—",
          pos: "—",
          group,
          image: "",
          customImage: "",
          tsn: "",
          unmatched: true,
        });
      }
      return id;
    };
    const rows = (value, width, maxRows, group) => {
      if (!Array.isArray(value) || value.length > maxRows)
        throw Error("Invalid lineup structure in the feed.");
      return value.map((row) => {
        if (!Array.isArray(row) || row.length < 1 || row.length > width)
          throw Error("Invalid unit size in the feed.");
        const ids = row.map((name) => player(name, group));
        if (new Set(ids).size !== ids.length)
          throw Error("Duplicate player in a unit.");
        return ids;
      });
    };
    const forwards = rows(entry.forwards, 3, 4, "F"),
      defense = rows(entry.defense, 2, 4, "D");
    const goalies = rows(entry.goalies, 1, 3, "G").flat();
    const pp = rows(
      [entry.pp1, entry.pp2].filter((row) => Array.isArray(row) && row.length),
      5,
      2,
      "F",
    );
    const pk = rows(
      [entry.pk1, entry.pk2].filter((row) => Array.isArray(row) && row.length),
      4,
      2,
      "F",
    );
    for (const ids of [forwards.flat(), defense.flat(), goalies])
      if (new Set(ids).size !== ids.length)
        throw Error("Duplicate player in the feed.");
    if (!forwards.length || !defense.length)
      throw Error("The feed contains no usable line combinations.");
    return {
      version: 1,
      type: "published-dfo",
      team,
      forwards,
      defense,
      goalies,
      pp,
      pk,
      extra: [...extra.values()],
      updated,
      sourceUrl,
    };
  }
  function valid(data) {
    if (
      data?.type !== "published-dfo" ||
      data.version !== 1 ||
      !Number.isFinite(Date.parse(data.updated)) ||
      !Array.isArray(data.extra)
    )
      return false;
    const id = (v) =>
      Number.isSafeInteger(v) ||
      (typeof v === "string" && /^dfo:[a-z0-9]+$/.test(v));
    return (
      [
        ["forwards", 3, 4],
        ["defense", 2, 4],
        ["pp", 5, 2],
        ["pk", 4, 2],
      ].every(
        ([key, width, max]) =>
          Array.isArray(data[key]) &&
          data[key].length <= max &&
          data[key].every(
            (row) =>
              Array.isArray(row) &&
              row.length > 0 &&
              row.length <= width &&
              row.every(id),
          ),
      ) &&
      Array.isArray(data.goalies) &&
      data.goalies.length <= 3 &&
      data.goalies.every(id)
    );
  }
  root.PublishedLines = { parse, valid, reconcile };
})(typeof window !== "undefined" ? window : globalThis);
