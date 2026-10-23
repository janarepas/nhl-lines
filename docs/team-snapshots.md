# Saved team data for API failures

`static/team-snapshots/TEAM.json` supplies a small, individually fetched emergency
copy of official NHL roster metadata. It prevents an entirely failed initial NHL
roster request from leaving every published name as initials, missing jersey
numbers and missing portraits. It does not replace normal live NHL fetching or
turn a historical projection into a confirmed current lineup.

Each file has `version:1`, an allowlisted `team`, `rosterCheckedAt`, and `roster`
with the three normal NHL groups. Only fields consumed by the browser roster
parser are retained. Official translated names, exact NHL IDs and original image
URLs remain unchanged. A separate optional `stats` object and `statsCheckedAt`
hold successfully fetched season totals. Missing or failed statistics are omitted,
never synthesized as zero values.

The consumer must enforce independent age limits for metadata and statistics,
keep their original timestamps, and label fallback data as saved rather than
fresh. A snapshot is only requested for the affected team after the corresponding
live request fails; normal successful loading costs no additional snapshot request.

## Daily refresh

`.github/workflows/refresh-team-snapshots.yml` runs daily at 07:17 UTC and can
also be started with GitHub Actions' **Run workflow** button. It uses Node 20 and
`node scripts/refresh-team-snapshots.cjs` to request the official NHL
`roster/TEAM/current` and `club-stats/TEAM/now` endpoints directly. Each of the
64 source checks may follow one NHL redirect to the same team's canonical season
endpoint (`roster/TEAM/YYYYYYYY` or `club-stats/TEAM/YYYYYYYY/2` or `/3`). The
redirect must keep the exact official origin and cannot contain credentials,
queries or fragments. Further redirects are rejected. This allows at most 128 HTTP
requests with two workers, one shared 20-second timeout per source check, and no
retry loop. A `429` or `Retry-After` response on either hop stops new requests;
already in-flight requests may complete. There is no additional browser work or
ordinary build request.

Each successful source is validated and receives its actual retrieval time.
Failed sources retain the previous valid component and its original timestamp;
when neither source succeeds, the existing file is untouched. Missing statistics
remain absent. A run with no valid team update exits unsuccessfully and reports
the source errors. The browser still enforces its independent 30-day roster and
24-hour statistics limits.

The same workflow separately runs `node scripts/build-game-snapshot.cjs` to
refresh the selected NHL game-day scores. A failed game refresh leaves its
existing file untouched and does not discard successful team updates. The
workflow commits only updated team JSON and `static/game-snapshot.json` as
`github-actions[bot]`; complete source failure makes no data commit and marks
the workflow unsuccessful. Repository Actions must permit the workflow's
`contents: write` permission so it can save verified updates.

## Importing an existing verified roster source set

```sh
node scripts/build-team-snapshots.cjs --roster-dir=/path/to/raw-json --fetch-stats
```

The input folder must contain all 32 valid `roster-TEAM.json` files. Successful
roster retrieval timestamps are taken from their saved file times, except when a
sibling `roster-provenance.json` supplies an older original `savedUTC` timestamp.
Rebuilding never gives old source data a new retrieval time. The script validates
every roster before writing a complete 32-team set. The output is deterministic
for identical input data and source times; normal `npm run build` remains offline.

`--fetch-stats` makes at most one bounded request per team through the existing NHL
proxy, with two workers. A `429` or `Retry-After` response stops new statistics
requests immediately (an already in-flight worker may complete). There is no retry
loop. Failed or unattempted stats may retain an existing successful snapshot with
its original timestamp; if no successful data exists, the stats section is absent.
Statistics use `X-NHL-Checked-At` when returned by the proxy and otherwise the actual
successful retrieval time. Source errors and rate limiting are included in the
script's report.

## October 23 source set

The initial set contains 32 teams and 799 roster identities from the official NHL
responses recorded by the player-completeness audit. Eight teams reuse the
same-day verified roster snapshot recorded in that audit's provenance file. The
set totals approximately 417 KB across all 32 files; an individual affected team
fetches roughly 13 KB uncompressed. Current statistics were verified for 29 teams.
VGK and WSH returned a rate-limit response, and the remaining WPG statistics request
was skipped. These three files contain roster metadata only. No source errors are
cached as successful empty statistics.
