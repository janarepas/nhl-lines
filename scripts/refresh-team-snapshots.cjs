// Explicit maintenance command: ordinary builds and browsers never run this updater.
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  makeSnapshot,
  trimRoster,
  trimStats,
  teams,
} = require("./build-team-snapshots.cjs");

const sourceRoot = "https://api-web.nhle.com/v1/";
const outputRoot = path.join(__dirname, "../static/team-snapshots");

async function readPrevious(file) {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    // Validate each independent source without dropping a useful roster when old stats are bad.
    const previous = makeSnapshot(raw.team, raw.roster, raw.rosterCheckedAt);
    if (raw.version !== 1) return null;
    if (raw.stats) {
      try {
        return makeSnapshot(
          raw.team,
          raw.roster,
          raw.rosterCheckedAt,
          raw.stats,
          raw.statsCheckedAt,
        );
      } catch {
        /* Preserve valid roster metadata only. */
      }
    }
    return previous;
  } catch {
    return null;
  }
}

async function refresh({
  outputDirectory = outputRoot,
  teamCodes = teams,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  if (
    !teamCodes.length ||
    new Set(teamCodes).size !== teamCodes.length ||
    teamCodes.some((team) => !teams.includes(team))
  )
    throw Error("Pass distinct official NHL team codes.");
  const report = {
    requests: 0,
    updatedTeams: 0,
    rosterUpdates: 0,
    statsUpdates: 0,
    rateLimited: false,
    errors: [],
  };
  const pending = [...teamCodes];

  async function request(team, kind) {
    if (report.rateLimited) return null;
    const route =
      kind === "roster" ? `roster/${team}/current` : `club-stats/${team}/now`;
    try {
      const signal = AbortSignal.timeout(20000);
      let url = sourceRoot + route,
        data;
      for (let hop = 0; hop <= 1; hop++) {
        if (report.rateLimited)
          throw Error("NHL rate limit stopped new requests.");
        report.requests++;
        const response = await fetchImpl(url, {
          signal,
          redirect: "manual",
          headers: { Accept: "application/json" },
        });
        if (response.status === 429 || response.headers?.has("retry-after"))
          report.rateLimited = true;
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers?.get("location");
          if (hop || !location) throw Error("Invalid NHL redirect.");
          const target = new URL(location, url);
          const canonical = new RegExp(
            kind === "roster"
              ? `^/v1/roster/${team}/\\d{8}$`
              : `^/v1/club-stats/${team}/\\d{8}/[23]$`,
          );
          if (
            target.origin !== new URL(sourceRoot).origin ||
            target.username ||
            target.password ||
            target.href !== target.origin + target.pathname ||
            !canonical.test(target.pathname)
          )
            throw Error("Unsafe NHL redirect.");
          url = target.href;
          continue;
        }
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        data = await response.json();
        break;
      }
      const value = kind === "roster" ? trimRoster(data) : trimStats(data);
      // A new timestamp is earned only by a successfully retrieved and validated source.
      return { value, at: new Date(now()).toISOString() };
    } catch (error) {
      report.errors.push({ team, kind, error: error.message });
      return null;
    }
  }

  async function worker() {
    while (pending.length && !report.rateLimited) {
      const team = pending.shift();
      const file = path.join(outputDirectory, `${team}.json`);
      const loaded = await readPrevious(file);
      const previous = loaded?.team === team ? loaded : null;
      const roster = await request(team, "roster");
      const stats = await request(team, "stats");
      if ((!roster && !stats) || (!roster && !previous)) continue;
      const snapshot = makeSnapshot(
        team,
        roster?.value || previous.roster,
        roster?.at || previous.rosterCheckedAt,
        stats?.value || previous?.stats,
        stats?.at || previous?.statsCheckedAt,
      );
      const body = JSON.stringify(snapshot) + "\n";
      if (Buffer.byteLength(body) > 24000) {
        report.errors.push({
          team,
          kind: "write",
          error: "Oversized team snapshot",
        });
        continue;
      }
      await fs.mkdir(outputDirectory, { recursive: true });
      await fs.writeFile(file + ".tmp", body);
      await fs.rename(file + ".tmp", file);
      report.updatedTeams++;
      if (roster) report.rosterUpdates++;
      if (stats) report.statsUpdates++;
    }
  }
  await Promise.all([worker(), worker()]);
  return report;
}

module.exports = { refresh };
if (require.main === module) {
  refresh()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.updatedTeams) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
