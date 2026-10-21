// ESPN explicitly marks unit membership using athlete.rank, not array position.
export function rankedSpecialTeams(raw) {
  if (!Array.isArray(raw?.depthchart))
    throw Error("Invalid special-teams chart");
  const chart = (name, pk) => {
    const charts = raw.depthchart.filter((c) => c.name === name);
    if (charts.length !== 1 || !charts[0].positions)
      throw Error("Missing special-teams chart");
    const positions = charts[0].positions;
    return [1, 2].map((rank) => {
      const members = [];
      for (const key of ["lw", "c", "rw", "f", "ld", "rd", "d"]) {
        if (!positions[key]) continue;
        const athletes = positions[key].athletes;
        if (!Array.isArray(athletes) || athletes.length > 12)
          throw Error("Invalid position list");
        for (const athlete of athletes) {
          if (athlete.rank !== rank) continue;
          const name = athlete.displayName?.trim();
          if (typeof name !== "string" || !name || name.length > 100)
            throw Error("Invalid player name");
          members.push({
            name,
            group: ["ld", "rd", "d"].includes(key) ? "D" : "F",
          });
        }
      }
      const valid = pk
        ? members.length === 4 &&
          members.filter((p) => p.group === "F").length === 2 &&
          members.filter((p) => p.group === "D").length === 2
        : members.length === 5;
      if (!valid || new Set(members.map((p) => p.name)).size !== members.length)
        return [];
      return pk
        ? [
            ...members.filter((p) => p.group === "F"),
            ...members.filter((p) => p.group === "D"),
          ]
        : members;
    });
  };
  return { pp: chart("Power Play", false), pk: chart("Penalty Kill", true) };
}
