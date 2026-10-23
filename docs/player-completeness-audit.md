# Player completeness audit helper

`scripts/audit-player-completeness.cjs` examines downloaded responses using the
same name resolver, published-lineup adapter and special-teams adapter as the
browser. It performs no requests and changes no application data.

```sh
node scripts/audit-player-completeness.cjs /path/to/raw-json > completeness.json
# Explicitly include the checked-in official-player supplement:
node scripts/audit-player-completeness.cjs /path/to/raw-json --verified=static/verified-players.json > completeness-with-supplement.json
```

The directory contains `roster-ANA.json`, `lineups-ANA.json`, `special-ANA.json`,
and equivalent files for every NHL team. Optional `prospects-ANA.json` files
allow official prospect matching to be checked separately. An explicit
`--now=2026-10-23T12:00:00Z` can reproduce a historical audit while preserving the
production adapter's source-date checks.

The report records:

- Valid roster and distinct NHL-ID counts, repeated IDs within and across teams,
  invalid identity records and official localized-name variant mismatches.
- Missing jersey, position, handedness, birth data or trusted headshot fields.
- Source parsing and missing-input failures; a failed response is never treated
  as an empty verified roster.
- Provisional lineup and PP/PK names remaining after verified prospect matching,
  retaining source team, name and F/D/G group.
- Names resolved by official prospects, including their IDs and source portraits,
  so a caller can distinguish a valid prospect from a nickname/data discrepancy.

The audit checks that headshot fields are present and trusted; it does **not**
prove that the actual image request succeeds or that a valid image contains a
real face rather than the NHL silhouette. A separate image/source audit is
required for those cases. Likewise roster metadata does not prove that a player
has NHL season or career games: zero/unavailable statistics must not be invented.

`resolvedByProspects` shows the resolver's capability with supplied prospect
files. It does not, by itself, prove that the browser requested those files for a
particular tab; the browser's loading path must also be checked.

The verified supplement is **opt-in**: without `--verified`, no registry metadata
is added automatically. With it, the production supplement parser limits records
to their explicit source-team scope. `resolvedBySupplement` is reported separately
from `resolvedByProspects`, following the browser's supplement-first lookup order.
A source lineup may list a player whose official current team differs; both the
published `team` and verified `currentTeam` are retained, along with the original
portrait and official player-profile source URL. This never reassigns that player
to the source team or invents a source-team portrait.
