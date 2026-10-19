/* Match a separate injury report conservatively to the current NHL roster. */
(function (root) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return false;
    const time = Date.parse(value + "T00:00:00Z");
    return (
      Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === value
    );
  }
  const types = {
    "upper body": "Upper-body injury",
    "lower body": "Lower-body injury",
    undisclosed: "Undisclosed injury",
    "not specified": "Injury type unknown",
    illness: "Illness",
    concussion: "Concussion",
    head: "Head injury",
    knee: "Knee injury",
    hip: "Hip injury",
    shoulder: "Shoulder injury",
    ankle: "Ankle injury",
    foot: "Foot injury",
    hand: "Hand injury",
    wrist: "Wrist injury",
    back: "Back injury",
    neck: "Neck injury",
    groin: "Groin injury",
    abdomen: "Abdominal injury",
    elbow: "Elbow injury",
    leg: "Leg injury",
    face: "Face injury",
    ribs: "Rib injury",
    personal: "Personal reasons",
    surgery: "Surgery",
  };
  function describe(injury, now = Date.now()) {
    const reason = String(injury.reason || "").trim();
    const detail = String(injury.detail || "").trim();
    let type = Object.hasOwn(types, reason.toLowerCase())
      ? types[reason.toLowerCase()]
      : reason || "Injury type unknown";
    if (
      detail.toLowerCase() === "surgery" &&
      reason.toLowerCase() !== "surgery"
    )
      type += " · surgery";
    const unknown = /day.to.day|dtd/i.test(injury.status || "")
      ? "Day-to-day · return unknown"
      : "Return: unknown";
    if (!validDate(injury.returnDate))
      return { type, returnLabel: unknown, days: null };
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en", {
        timeZone: "Europe/Budapest",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date(now))
        .map((p) => [p.type, p.value]),
    );
    const today = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
    );
    const target = Date.parse(injury.returnDate + "T00:00:00Z");
    const days = Math.round((target - today) / 86400000);
    if (days < 0)
      return {
        type,
        returnLabel: "Previous estimate has passed · new date unknown",
        days: null,
      };
    const date = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      ...(injury.returnDate.slice(0, 4) !== parts.year
        ? { year: "numeric" }
        : {}),
    }).format(new Date(target));
    return {
      type,
      returnLabel:
        days === 0
          ? "Expected return: today (estimated)"
          : `Expected: ${date} · approx. ${days} day${days === 1 ? "" : "s"}`,
      days,
    };
  }
  function parseReport(data, teamName) {
    if (!data || !Array.isArray(data.injuries))
      throw Error("Incomplete injury report.");
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
      throw Error("Unknown injury report format.");
    for (const entry of entries) {
      if (!Array.isArray(entry.injuries))
        throw Error("Incomplete team injury report.");
      for (const injury of entry.injuries) {
        const name = injury.athlete?.displayName || injury.athlete?.fullName;
        const status = injury.status || injury.type?.description || "";
        const reason = String(injury.details?.type || "");
        if (
          !name ||
          /suspend|suspens|personal|(?:not|non).?injury|disciplin|contract dispute/i.test(
            reason,
          )
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
          detail:
            typeof injury.details?.detail === "string"
              ? injury.details.detail
              : "",
          returnDate: validDate(injury.details?.returnDate)
            ? injury.details.returnDate
            : null,
          date: injury.date || null,
          source: "ESPN",
        });
      }
    }
    return result;
  }
  root.LineInjuries = { normalize, parseReport, describe };
  if (typeof module !== "undefined") module.exports = root.LineInjuries;
})(typeof window !== "undefined" ? window : globalThis);
