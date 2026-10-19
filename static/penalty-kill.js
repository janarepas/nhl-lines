/* Read only explicitly published PK depth-chart rows, never ice-time estimates. */
(function (root) {
  const sourceUrl = "https://www.rotowire.com/hockey/depth-charts-pk.php";
  const normalize = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
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
    const known = new Map(
      roster
        .filter((p) => Number.isSafeInteger(p.id))
        .map((p) => [normalize(p.name), p]),
    );
    const ids = columns.map((c, i) => {
      const links = [...c.querySelectorAll(".depth-charts__pos-list > li > a")];
      if (links.length !== 2) throw Error("Incomplete PK unit in the source.");
      return links.map((a) => {
        a.querySelectorAll(".hide-xs-up").forEach((n) => n.remove());
        const p = known.get(normalize(a.textContent));
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
  root.PenaltyKill = { parse, sourceUrl };
})(typeof window !== "undefined" ? window : globalThis);
