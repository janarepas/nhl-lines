/* Match a separate injury report conservatively to the current NHL roster. */
(function (root) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  function parseReport(data, teamName) {
    if (!data || !Array.isArray(data.injuries))
      throw Error("Hiányos sérülésjelentés.");
    const entries = data.injuries.filter(
      (entry) =>
        normalize(entry.displayName || entry.team?.displayName) ===
        normalize(teamName),
    );
    const result = new Map();
    // A completely empty report is valid; unrecognized populated schemas are not.
    if (
      data.injuries.length &&
      !data.injuries.some(
        (entry) => entry.displayName || entry.team?.displayName,
      )
    )
      throw Error("Ismeretlen sérülésjelentés-formátum.");
    for (const entry of entries) {
      if (!Array.isArray(entry.injuries))
        throw Error("Hiányos csapatjelentés.");
      for (const injury of entry.injuries) {
        const name = injury.athlete?.displayName || injury.athlete?.fullName;
        const status = injury.status || injury.type?.description || "";
        const reason = String(injury.details?.type || "");
        if (
          !name ||
          /suspend|suspens|personal|not.?injury|disciplin/i.test(reason)
        )
          continue;
        if (
          !/^(out|day.to.day|dtd|injured reserve|ir|long.term.*|ltir|questionable|doubtful)$/i.test(
            status,
          )
        )
          continue;
        result.set(normalize(name), {
          status,
          reason,
          date: injury.date || null,
          source: "ESPN",
        });
      }
    }
    return result;
  }
  root.LineInjuries = { normalize, parseReport };
  if (typeof module !== "undefined") module.exports = root.LineInjuries;
})(typeof window !== "undefined" ? window : globalThis);
