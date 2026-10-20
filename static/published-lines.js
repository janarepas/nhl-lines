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
    eliasnpettersson: 8483678,
    joshmahura: 8479372,
    joshuamahura: 8479372,
    jacobmiddleton: 8478136,
    jakemiddleton: 8478136,
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
  // NHL translations can use a full first name and a transliterated surname.
  // Accept their combinations too (e.g. Alexander + Ovechkin).
  function rosterNames(player) {
    const first = Object.values(player.firstName || {}).filter(
      (v) => typeof v === "string" && v.trim(),
    );
    const last = Object.values(player.lastName || {}).filter(
      (v) => typeof v === "string" && v.trim(),
    );
    return [...new Set(first.flatMap((f) => last.map((l) => `${f} ${l}`)))];
  }
  function matchingPlayer(name, roster, group) {
    const key = norm(name);
    const candidates = roster.filter(
      (p) =>
        Number.isSafeInteger(p.id) &&
        (norm(p.name) === key ||
          p.nameAliases?.some((alias) => norm(alias) === key) ||
          p.id === aliases[key]),
    );
    const unique = [...new Map(candidates.map((p) => [p.id, p])).values()];
    if (unique.length === 1) return unique[0];
    // Identical names are not necessarily identical people. Only a known
    // lineup position can disambiguate; special teams have no reliable group.
    const positional = unique.filter((p) => group && p.group === group);
    return positional.length === 1 ? positional[0] : undefined;
  }
  function reconcile(data, roster) {
    if (!valid(data)) return data;
    const copy = structuredClone(data);
    const replacements = new Map();
    const allIds = [
      copy.forwards.flat(),
      copy.defense.flat(),
      copy.goalies,
      copy.pp.flat(),
      copy.pk.flat(),
    ].flat();
    const metadata = new Map([...roster, ...copy.extra].map((p) => [p.id, p]));
    for (const id of new Set(allIds.filter((id) => typeof id === "string"))) {
      const p = metadata.get(id);
      const groups = [
        ["forwards", "F"],
        ["defense", "D"],
        ["goalies", "G"],
      ]
        .filter(([key]) => copy[key].flat().includes(id))
        .map(([, group]) => group);
      const match = matchingPlayer(
        p?.name || id.replace(/^dfo:/, ""),
        roster,
        groups.length === 1 ? groups[0] : null,
      );
      if (match) replacements.set(id, match.id);
    }
    // Older snapshots can have source IDs in rows but no corresponding extra
    // record. Repair the rows themselves, rather than trusting that index.
    copy.extra = copy.extra.filter((p) => !replacements.has(p.id));
    for (const key of ["forwards", "defense", "pp", "pk"])
      copy[key] = copy[key].map((row) =>
        row.map((id) => replacements.get(id) ?? id),
      );
    copy.goalies = copy.goalies.map((id) => replacements.get(id) ?? id);
    return copy;
  }
  function reconcileState(data, players) {
    const lineData = reconcile(data, players);
    if (!valid(lineData)) return { lineData, players };
    const used = new Set(
      [
        lineData.forwards.flat(),
        lineData.defense.flat(),
        lineData.goalies,
        lineData.pp.flat(),
        lineData.pk.flat(),
      ].flat(),
    );
    const unique = new Map();
    for (const p of [...players, ...lineData.extra]) {
      // Provisional records are source placeholders, even in old caches that
      // did not save the unmatched flag. Do not render obsolete placeholders.
      if (typeof p.id === "string" && !used.has(p.id)) continue;
      if (!unique.has(p.id)) unique.set(p.id, p);
    }
    return { lineData, players: [...unique.values()] };
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
    const player = (name, group, matchGroup) => {
      if (typeof name !== "string" || !name.trim() || name.length > 100)
        throw Error("Invalid player name in the feed.");
      const match = matchingPlayer(name, roster, matchGroup);
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
    const rows = (value, width, maxRows, group, matchGroup = group) => {
      if (!Array.isArray(value) || value.length > maxRows)
        throw Error("Invalid lineup structure in the feed.");
      return value.map((row) => {
        if (!Array.isArray(row) || row.length < 1 || row.length > width)
          throw Error("Invalid unit size in the feed.");
        const ids = row.map((name) => player(name, group, matchGroup));
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
      null,
    );
    const pk = rows(
      [entry.pk1, entry.pk2].filter((row) => Array.isArray(row) && row.length),
      4,
      2,
      "F",
      null,
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
  root.PublishedLines = {
    parse,
    valid,
    reconcile,
    reconcileState,
    rosterNames,
    matchingPlayer,
  };
})(typeof window !== "undefined" ? window : globalThis);
