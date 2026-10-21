/* Read only explicitly published PK depth-chart rows, never ice-time estimates. */
(function (root) {
  const sourceUrl = "https://www.rotowire.com/hockey/depth-charts-pk.php";
  function parse(html, roster, team) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (
      !/NHL Penalty Kill Depth Charts/i.test(
        doc.querySelector("h1")?.textContent || "",
      )
    )
      throw Error("The PK source format has changed.");
    const blocks = [...doc.querySelectorAll(".depth-charts__block")].filter(
      (b) => b.querySelector(".depth-charts__team img")?.alt === team,
    );
    if (blocks.length !== 1)
      throw Error("This team's PK chart is unavailable.");
    const block = blocks[0];
    if (block.querySelector(".depth-charts__paywall-text"))
      return { units: [], restricted: true, sourceUrl };
    const columns = [...block.querySelectorAll(".depth-charts__pos")];
    if (
      columns.length !== 4 ||
      columns.some(
        (c, i) =>
          c.querySelector(".depth-charts__pos-head")?.textContent.trim() !==
          (i < 2 ? "Forward" : "Defenseman"),
      )
    )
      throw Error("The PK source positions could not be verified.");
    const ids = columns.map((c, i) => {
      const links = [...c.querySelectorAll(".depth-charts__pos-list > li > a")];
      if (links.length !== 2) throw Error("Incomplete PK unit in the source.");
      return links.map((a) => {
        a.querySelectorAll(".hide-xs-up").forEach((n) => n.remove());
        const p = root.PublishedLines.matchingPlayer(
          a.textContent,
          roster,
          i < 2 ? "F" : "D",
        );
        if (!p || p.group !== (i < 2 ? "F" : "D"))
          throw Error(
            "A PK player could not be matched to the current NHL roster.",
          );
        return p.id;
      });
    });
    const units = [0, 1].map((row) => ids.map((column) => column[row]));
    if (units.some((row) => new Set(row).size !== 4))
      throw Error("Duplicate player in the PK unit.");
    return { units, restricted: false, sourceUrl };
  }
  function parseDepth(data, roster, team) {
    if (data?.raw && data.team === team) {
      const chart = data.raw.depthchart?.filter(
        (c) => c.name === "Penalty Kill",
      );
      if (chart?.length !== 1) throw Error("Invalid PK depth chart.");
      const names = (keys) => [
        ...new Set(
          keys.flatMap(
            (key) =>
              chart[0].positions?.[key]?.athletes?.map((p) => p.displayName) ||
              [],
          ),
        ),
      ];
      data = {
        team,
        source: "ESPN",
        forwards: names(["c", "lw", "rw", "f"]),
        defense: names(["d", "ld", "rd"]),
        sourceUrl: data.sourceUrl,
      };
    }
    if (
      !/^https:\/\/www\.espn\.com\/nhl\/team\/depth\/_\/id\/\d+$/.test(
        data?.sourceUrl || "",
      )
    )
      throw Error("Invalid PK source URL.");
    if (
      data?.team !== team ||
      data.source !== "ESPN" ||
      ![data.forwards, data.defense].every(
        (names) =>
          Array.isArray(names) &&
          names.length > 0 &&
          names.length <= 12 &&
          names.every(
            (name) =>
              typeof name === "string" && name.trim() && name.length <= 100,
          ),
      )
    )
      throw Error("Invalid PK depth chart.");
    const depth = {},
      unmatched = {};
    for (const [key, group] of [
      ["forwards", "F"],
      ["defense", "D"],
    ]) {
      depth[key] = [];
      unmatched[key] = [];
      for (const name of data[key]) {
        const player = root.PublishedLines.matchingPlayer(name, roster, group);
        if (player?.group === group) depth[key].push(player.id);
        else unmatched[key].push(name);
      }
      depth[key] = [...new Set(depth[key])];
    }
    return {
      units: [],
      depth,
      unmatched,
      provider: "ESPN",
      sourceUrl: data.sourceUrl,
    };
  }
  function parseSpecial(data, roster, team) {
    if (
      data?.team !== team ||
      data.source !== "ESPN" ||
      !/^https:\/\/www\.espn\.com\/nhl\/team\/depth\/_\/id\/\d+$/.test(
        data.sourceUrl || "",
      )
    )
      throw Error("Invalid special-teams source.");
    const extra = new Map();
    const resolve = (row, kind) => {
      if (
        !Array.isArray(row) ||
        (row.length && row.length !== (kind === "pk" ? 4 : 5))
      )
        throw Error("Invalid special-teams unit.");
      if (
        kind === "pk" &&
        row.length &&
        (row.filter((p) => p.group === "F").length !== 2 ||
          row.filter((p) => p.group === "D").length !== 2)
      )
        throw Error("Invalid PK formation.");
      const ids = row.map((entry) => {
        if (
          typeof entry.name !== "string" ||
          !entry.name.trim() ||
          entry.name.length > 100 ||
          !["F", "D"].includes(entry.group)
        )
          throw Error("Invalid unit member.");
        const match = root.PublishedLines.matchingPlayer(
          entry.name,
          roster,
          entry.group,
        );
        if (match && (kind !== "pk" || match.group === entry.group))
          return match.id;
        const id =
          "dfo:" +
          entry.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        if (!extra.has(id)) {
          const words = entry.name.trim().split(/\s+/);
          extra.set(id, {
            id,
            name: entry.name.trim(),
            first: words.slice(0, -1).join(" "),
            last: words.at(-1),
            number: "—",
            pos: "—",
            group: entry.group,
            image: "",
            unmatched: true,
            specialOnly: true,
          });
        }
        return id;
      });
      if (new Set(ids).size !== ids.length)
        throw Error("Duplicate unit member.");
      return ids;
    };
    const units = (kind) => {
      if (!Array.isArray(data[kind]) || data[kind].length !== 2)
        throw Error("Missing special-teams units.");
      return data[kind].map((row) => resolve(row, kind));
    };
    const pp = units("pp"),
      pk = units("pk");
    return {
      pp,
      pk,
      extra: [...extra.values()],
      sourceUrl: data.sourceUrl,
      provider: "ESPN",
    };
  }
  root.PenaltyKill = { parse, parseDepth, parseSpecial, sourceUrl };
})(typeof window !== "undefined" ? window : globalThis);
