// Read-only production-parser audit of saved official player and lineup responses.
// Usage: node scripts/audit-player-completeness.cjs RAW_DIR [--now=ISO_DATE] [--verified=FILE]
const fs = require("node:fs");
const path = require("node:path");
require("../static/published-lines.js");
require("../static/penalty-kill.js");
require("../static/verified-player-profiles.js");
const teamNames = new Map(
  [
    ...fs
      .readFileSync(path.join(__dirname, "../static/app.js"), "utf8")
      .matchAll(/^  \["([A-Z]{3})", "([^"]+)"/gm),
  ].map((m) => [m[1], m[2]]),
);
const slug = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "assets.nhle.com"
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function parseRoster(raw, team, kind, report) {
  const groups = [
    ["forwards", "F"],
    ["defensemen", "D"],
    ["goalies", "G"],
  ];
  if (groups.some(([key]) => !Array.isArray(raw?.[key])))
    throw Error("Invalid NHL roster groups");
  const seen = new Set();
  return groups.flatMap(([key, group]) =>
    raw[key]
      .map((p) => {
        if (
          !Number.isSafeInteger(p.id) ||
          !p.firstName?.default ||
          !p.lastName?.default
        ) {
          report.invalidIdentities.push({
            team,
            kind,
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
          });
          return null;
        }
        if (seen.has(p.id))
          report.duplicates.push({
            team,
            kind,
            id: p.id,
            name: p.firstName.default + " " + p.lastName.default,
          });
        seen.add(p.id);
        const name = p.firstName.default + " " + p.lastName.default;
        const image = safeImage(p.headshot);
        const missing = [];
        if (p.sweaterNumber === undefined || p.sweaterNumber === null)
          missing.push("number");
        if (!p.positionCode) missing.push("position");
        if (!["L", "R"].includes(p.shootsCatches))
          missing.push("shootsCatches");
        if (!p.birthCountry) missing.push("birthCountry");
        if (!p.birthDate) missing.push("birthDate");
        if (!image) missing.push("headshot");
        if (missing.length)
          report.missingMetadata.push({
            team,
            kind,
            id: p.id,
            name,
            fields: missing,
            headshot: p.headshot || null,
          });
        return {
          id: p.id,
          name,
          nameAliases: PublishedLines.rosterNames(p),
          first: p.firstName.default,
          last: p.lastName.default,
          number: p.sweaterNumber ?? "—",
          pos: p.positionCode || group,
          shootsCatches: ["L", "R"].includes(p.shootsCatches)
            ? p.shootsCatches
            : null,
          group,
          image,
          birth: p.birthDate,
          birthCountry:
            typeof p.birthCountry === "string"
              ? p.birthCountry.toUpperCase()
              : null,
        };
      })
      .filter(Boolean),
  );
}
function audit(directory, now = Date.now(), options = {}) {
  const report = {
    checkedAt: new Date(now).toISOString(),
    teams: 0,
    rosterPlayers: 0,
    prospectPlayers: 0,
    supplementChecked: Boolean(options.verified),
    supplementPlayers: 0,
    uniqueRosterIds: 0,
    publishedTeams: 0,
    specialTeams: 0,
    prospectFiles: 0,
    identityVariants: 0,
    identityMismatches: [],
    invalidIdentities: [],
    duplicates: [],
    crossTeamIds: [],
    missingMetadata: [],
    unresolved: [],
    resolvedByProspects: [],
    resolvedBySupplement: [],
    parserErrors: [],
    missingInputs: [],
    teamsDetail: [],
  };
  const identities = new Map();
  const read = (kind, team, required = true) => {
    const file = path.join(directory, `${kind}-${team}.json`);
    if (!fs.existsSync(file)) {
      if (required) report.missingInputs.push({ team, kind });
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      report.parserErrors.push({ team, kind, error: error.message });
      return null;
    }
  };
  for (const [team, name] of teamNames) {
    const raw = read("roster", team);
    if (!raw) continue;
    let roster;
    try {
      roster = parseRoster(raw, team, "roster", report);
    } catch (error) {
      report.parserErrors.push({ team, kind: "roster", error: error.message });
      continue;
    }
    report.teams++;
    report.rosterPlayers += roster.length;
    for (const p of roster) {
      for (const name of p.nameAliases) {
        report.identityVariants++;
        const resolved = PublishedLines.matchingPlayer(name, roster, p.group);
        if (resolved?.id !== p.id)
          report.identityMismatches.push({
            team,
            id: p.id,
            name,
            group: p.group,
            resolvedId: resolved?.id || null,
          });
      }
      const teams = identities.get(p.id) || [];
      teams.push({ team, name: p.name });
      identities.set(p.id, teams);
    }
    let prospects = [];
    const rawProspects = read("prospects", team, false);
    if (rawProspects) {
      try {
        prospects = parseRoster(rawProspects, team, "prospects", report);
        report.prospectFiles++;
        report.prospectPlayers += prospects.length;
      } catch (error) {
        report.parserErrors.push({
          team,
          kind: "prospects",
          error: error.message,
        });
      }
    }
    let supplement = [];
    if (options.verified) {
      try {
        supplement = VerifiedPlayerProfiles.parse(options.verified, team);
        report.supplementPlayers += supplement.length;
      } catch (error) {
        report.parserErrors.push({
          team,
          kind: "verified",
          error: error.message,
        });
      }
    }
    const withSupplement = [
      ...new Map([...roster, ...supplement].map((p) => [p.id, p])).values(),
    ];
    const fullRoster = [
      ...new Map(
        [...withSupplement, ...prospects].map((p) => [p.id, p]),
      ).values(),
    ];
    const recordResolved = (extras, candidates, source, destination) => {
      for (const extra of extras) {
        const resolved = PublishedLines.matchingPlayer(
          extra.name,
          candidates,
          extra.group,
        );
        if (resolved)
          destination.push({
            team,
            source,
            name: extra.name,
            id: resolved.id,
            group: resolved.group,
            image: resolved.image,
            ...(resolved.supplemental
              ? {
                  currentTeam: resolved.currentTeam,
                  sourceTeams: resolved.sourceTeams,
                  sourceUrl: resolved.sourceUrl,
                }
              : {}),
          });
      }
    };
    const details = {
      team,
      rosterPlayers: roster.length,
      prospects: prospects.length,
      unresolvedLineup: 0,
      unresolvedSpecial: 0,
    };
    const lineup = read("lineups", team);
    if (lineup) {
      try {
        const parsed = PublishedLines.parse(
          lineup,
          roster,
          slug(name),
          team,
          now,
        );
        const intermediate = PublishedLines.reconcile(parsed, withSupplement);
        const fixed = PublishedLines.reconcile(intermediate, fullRoster);
        report.publishedTeams++;
        recordResolved(
          parsed.extra,
          withSupplement,
          "lineup",
          report.resolvedBySupplement,
        );
        recordResolved(
          intermediate.extra,
          fullRoster,
          "lineup",
          report.resolvedByProspects,
        );
        for (const extra of fixed.extra)
          report.unresolved.push({ team, source: "lineup", ...extra });
        details.unresolvedLineup = fixed.extra.length;
      } catch (error) {
        report.parserErrors.push({
          team,
          kind: "lineups",
          error: error.message,
        });
      }
    }
    const special = read("special", team);
    if (special) {
      try {
        const before = PenaltyKill.parseSpecial(special, roster, team);
        const intermediate = PenaltyKill.parseSpecial(
          special,
          withSupplement,
          team,
        );
        const parsed = PenaltyKill.parseSpecial(special, fullRoster, team);
        report.specialTeams++;
        recordResolved(
          before.extra,
          withSupplement,
          "special",
          report.resolvedBySupplement,
        );
        recordResolved(
          intermediate.extra,
          fullRoster,
          "special",
          report.resolvedByProspects,
        );
        for (const extra of parsed.extra)
          report.unresolved.push({ team, source: "special", ...extra });
        details.unresolvedSpecial = parsed.extra.length;
      } catch (error) {
        report.parserErrors.push({
          team,
          kind: "special",
          error: error.message,
        });
      }
    }
    report.teamsDetail.push(details);
  }
  report.uniqueRosterIds = identities.size;
  for (const [id, entries] of identities)
    if (entries.length > 1) report.crossTeamIds.push({ id, entries });
  return report;
}
module.exports = { audit, parseRoster };
if (require.main === module) {
  const directory = process.argv[2];
  if (!directory)
    throw Error(
      "Provide a saved response directory; this helper performs no network requests.",
    );
  const time = process.argv.find((x) => x.startsWith("--now="))?.slice(6);
  const now = time ? Date.parse(time) : Date.now();
  if (!Number.isFinite(now)) throw Error("Invalid audit date");
  const verifiedFile = process.argv
    .find((x) => x.startsWith("--verified="))
    ?.slice(11);
  const verified = verifiedFile
    ? JSON.parse(fs.readFileSync(verifiedFile, "utf8"))
    : undefined;
  const report = audit(directory, now, { verified });
  console.log(JSON.stringify(report, null, 2));
  if (
    report.identityMismatches.length ||
    report.invalidIdentities.length ||
    report.duplicates.length ||
    report.parserErrors.length ||
    report.missingInputs.length
  )
    process.exitCode = 1;
}
