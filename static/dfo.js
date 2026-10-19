/* Read semantic sections of the source HTML in an inert document. Never execute it. */
(function (root) {
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const section = (value) => {
    const s = norm(value);
    if (["forwards", "forwardlines", "offensivelines"].includes(s))
      return "forwards";
    if (
      [
        "defense",
        "defence",
        "defensivepairings",
        "defensivepairs",
        "defensepairings",
      ].includes(s)
    )
      return "defense";
    if (["goalies", "goaltenders", "goalkeepers"].includes(s)) return "goalies";
    for (const [key, word] of [
      ["pp", "powerplay"],
      ["pk", "penaltykill"],
      ["pk", "shorthanded"],
    ]) {
      if ([word, word + "units", word + "combinations"].includes(s)) return key;
      for (const n of [1, 2])
        if (
          [
            word + n,
            word + "unit" + n,
            n + word,
            n + word + "unit",
            n + (n === 1 ? "st" : "nd") + word + "unit",
            n + (n === 1 ? "st" : "nd") + word,
          ].includes(s)
        )
          return key + n;
    }
    return null;
  };
  function parse(html, roster, sourceUrl) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (
      doc
        .querySelector("title")
        ?.textContent.match(/just a moment|access denied|attention required/i)
    )
      throw Error("The source page is unavailable in this environment.");
    const byName = new Map(roster.map((p) => [norm(p.name), p]));
    const buckets = {},
      extra = new Map();
    let current = null;
    for (const el of doc.querySelectorAll(
      '[id], h1,h2,h3,h4,h5,h6, a[href*="/players/"]',
    )) {
      const marker =
        section(el.id) ||
        (/^H[1-6]$/.test(el.tagName) ? section(el.textContent) : null);
      if (marker) {
        current = marker;
        buckets[current] ??= [];
        continue;
      }
      if (el.tagName !== "A" || !current) continue;
      let path;
      try {
        const url = new URL(el.getAttribute("href"), sourceUrl);
        if (
          !["www.dailyfaceoff.com", "dailyfaceoff.com"].includes(url.hostname)
        )
          continue;
        path = url.pathname;
      } catch {
        continue;
      }
      const parts = path.split("/").filter(Boolean),
        start = parts.indexOf("players");
      if (start < 0) continue;
      const slug = parts
        .slice(start + 1)
        .find((s) => s.includes("-") && !/^\d/.test(s));
      if (!slug) continue;
      const candidates = [
        el.getAttribute("data-player-name"),
        el.getAttribute("title"),
        el.textContent,
        el.querySelector("img")?.alt,
        slug.replace(/-/g, " "),
      ].filter(Boolean);
      const found = candidates.map((c) => byName.get(norm(c))).find(Boolean);
      let player = found;
      if (!player) {
        const text =
          candidates.find(
            (c) =>
              /^[\p{L} .’'\-]{3,80}$/u.test(c.trim()) &&
              c.trim().split(/\s+/).length >= 2,
          ) || slug.replace(/-/g, " ");
        const words = text.trim().split(/\s+/);
        const id = "dfo:" + slug;
        player = {
          id,
          name: text.trim(),
          first: words.slice(0, -1).join(" "),
          last: words.at(-1),
          number: "—",
          pos: "—",
          group:
            current === "goalies" ? "G" : current === "defense" ? "D" : "F",
          image: "",
          customImage: "",
          tsn: "",
          unmatched: true,
        };
        if (extra.has(id)) player = extra.get(id);
        else extra.set(id, player);
      }
      const entries = buckets[current];
      if (entries.at(-1) !== player.id) entries.push(player.id);
    }
    const rows = (key, width, min, max) => {
      const ids = buckets[key] || [];
      if (ids.length < min || ids.length > max || ids.length % width) return [];
      return Array.from({ length: ids.length / width }, (_, i) =>
        ids.slice(i * width, (i + 1) * width),
      );
    };
    const units = (key) => {
      if (buckets[key + "1"] || buckets[key + "2"])
        return [1, 2].flatMap((n) => {
          const ids = buckets[key + n] || [],
            expected = key === "pp" ? 5 : 4;
          return ids.length === expected && new Set(ids).size === ids.length
            ? [ids]
            : [];
        });
      return rows(
        key,
        key === "pp" ? 5 : 4,
        key === "pp" ? 5 : 4,
        key === "pp" ? 10 : 8,
      );
    };
    const forwards = rows("forwards", 3, 9, 15),
      defense = rows("defense", 2, 4, 8),
      goalies = buckets.goalies || [];
    if (
      !forwards.length &&
      !defense.length &&
      !units("pp").length &&
      !units("pk").length
    )
      throw Error("The Daily Faceoff lineup structure could not be verified.");
    for (const [key, values] of [
      ["forwards", forwards.flat()],
      ["defense", defense.flat()],
      ["goalies", goalies],
    ])
      if (new Set(values).size !== values.length)
        throw Error("Duplicate player in source section " + key + ".");
    const times = [...doc.querySelectorAll("time[datetime]")].filter(
      (el) =>
        el.getAttribute("itemprop") === "dateModified" ||
        el.hasAttribute("data-lineup-updated") ||
        el.closest('[class*="updated" i], [id*="updated" i]'),
    );
    const updated =
      times.length === 1 && Number.isFinite(Date.parse(times[0].dateTime))
        ? times[0].dateTime
        : null;
    return {
      forwards,
      defense,
      goalies: goalies.length <= 3 ? goalies : [],
      pp: units("pp"),
      pk: units("pk"),
      extra: [...extra.values()],
      updated,
      sourceUrl,
      version: 1,
    };
  }
  function valid(data) {
    if (data?.version !== 1) return false;
    for (const [key, width] of [
      ["forwards", 3],
      ["defense", 2],
      ["pp", 5],
      ["pk", 4],
    ])
      if (
        !Array.isArray(data[key]) ||
        !data[key].every(
          (row) =>
            Array.isArray(row) &&
            row.length === width &&
            row.every(
              (id) =>
                Number.isSafeInteger(id) ||
                (typeof id === "string" && id.startsWith("dfo:")),
            ),
        )
      )
        return false;
    return (
      Array.isArray(data.goalies) &&
      data.goalies.every(
        (id) =>
          Number.isSafeInteger(id) ||
          (typeof id === "string" && id.startsWith("dfo:")),
      ) &&
      Array.isArray(data.extra)
    );
  }
  root.DfoLines = { parse, valid };
})(typeof window !== "undefined" ? window : globalThis);
