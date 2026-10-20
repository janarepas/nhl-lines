# Daily games, PK coverage and source-failure roster view

The lineup-source outage described below is historical. The old feed has now
been replaced with a cached official NHL.com adapter, verified for all 32 teams
on 2026-10-20. See [Official NHL lineup source](nhl-lineup-source.md).

## NHL games

`/api/games?date=YYYY-MM-DD` requests the fixed official NHL `score/{date}`
endpoint. It validates real calendar dates, rejects redirects, validates game
IDs/states and returns a compact subset of the response. Errors are not cached.
The selected date is the visitor's local calendar date, interpreted as an NHL
game day and explicitly labelled that way. Start times include the visitor's
local date and timezone: European starts can fall on the following morning.
The app does not label missing scores as zeroes or turn a failed request into
an empty schedule. Links open official NHL Gamecenter pages.

The score strip is below the brand and above the team selector. Its horizontal
scroll is native and confined to the strip, including at 320px. Live scores
refresh every minute; upcoming games every five minutes, completed/empty days
every fifteen minutes. There is no per-second clock. Polling stops outside the
viewport and in hidden tabs. Existing requests can complete; their result is
rendered when the user returns. It does not use the 24-hour player cache.

## Public PK sources checked 2026-10-20

- RotoWire's public `depth-charts-pk.php` page still restricts 27 teams. The
  five team charts are public. Each is used as published units only when all
  player names match the current roster; otherwise ESPN supplies the fallback.
- The public ESPN `teams/{id}/depthcharts` API includes a `Penalty Kill`
  chart for **all 32 teams**. Every team was downloaded and checked, rather
  than assuming league-wide coverage from one response.
- There are **255 PK participants** in those responses (Pittsburgh has seven;
  the other teams have eight). **254 match the current NHL roster profiles**.
  Columbus's Damon Severson does not match the current roster response; his
  published name remains visible without an invented NHL ID or statistics.
- ESPN's positional PK depth lists do not consistently specify four-player
  PK1/PK2 memberships. The fallback is therefore explicitly titled
  "Shorthanded depth chart", grouped as "PK forwards" / "PK defense", with an
  explanation. It never groups arbitrary depth entries into claimed units.
- `Elias N. Pettersson` resolves to defenseman NHL 8483678. ESPN athlete
  5238086 lists Vancouver, jersey 25, DOB 16/2/2004; the NHL defenseman has
  jersey 25 and DOB 2004-02-16. He remains distinct from forward 8480012.
- The fixed ESPN team-ID mapping accounts for LA/LAK, NJ/NJD, SJ/SJS, TB/TBL
  and UTAH/UTA. The browser requests the fallback only when the PK tab is opened
  and no published unit is available. Responses are team-scoped and cached for
  one minute in the browser / five minutes at the edge.

Repeat the saved-response coverage audit:

```sh
node scripts/audit-pk-depth.cjs /path/to/espn-charts /path/to/nhl-rosters
```

ESPN chart filenames use ESPN abbreviations (`LA.json`, `UTAH.json`, etc.);
NHL roster filenames use NHL codes (`LAK.json`, `UTA.json`). The script performs
no network requests or mutations.

Left Wing Lock, LineupExperts, Frozen Tools and FantasyHockey911 could not be
inspected because the current environment's egress allowlist rejects them.
Additional destinations were saved in the environment configuration draft,
preserving existing custom destinations. This draft has not been applied or
published. No claim is made about those sites' PK coverage or accessibility.

## Fresh/mobile roster fallback

The old published lineup feed returned HTTP 404. A desktop with a saved lineup
could continue to show it, while a new phone had no saved rows. This was a data
availability problem, rather than mobile CSS hiding the cards.

When no published lineup is available but the NHL roster is available, the
normal forward, defense and goalie sections now show an explicitly labelled
roster view with portraits, statistics and profiles. Known injuries remain in
the injured section. There are no manufactured lines, pairs, LD/RD placements,
starter/backup claims or healthy-scratch classifications. The roster notice is
shown only in the 5-on-5 view. Published/cached rows continue to use their
original source order when available; the fallback never overwrites them.

Both masthead/footer now italicize "Next"; footer explanatory copy inherits the
same grey as the footer wordmark. The production build and Rust development
server include the new score/depth routes and generated assets.
