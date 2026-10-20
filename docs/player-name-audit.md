# Player identity audit — 2026-10-20

Checked the official `https://api-web.nhle.com/v1/roster/{TEAM}/current`
responses for all 32 teams: 796 roster records and 963 distinct-per-player
combinations of official first-name and surname translations. Every variant
resolved to its expected NHL ID when its published F/D/G group was supplied.
No duplicate NHL IDs were present within a team roster.

Findings and changes:

- Josh / Joshua Mahura resolves only to NHL ID 8479372. Existing cached
  unresolved lineup entries are reconciled as well.
- Official translated first names can now combine with the default surname,
  e.g. Alexander Ovechkin and Theodors Blueger. Previously only matching
  language pairs were accepted. No generic nickname or surname-only guesses.
- Vancouver has two distinct Elias Pettersson records: forward 8480012 and
  defenseman 8483678. Ambiguous name matches now require a unique positional
  match. Special-team names without a reliable group remain unresolved rather
  than assigning another person's stats. Cached reconciliation follows the
  same rule.
- Public penalty-kill row matching uses the same identity resolver.

Scope limitation: the published lineup feed returned HTTP 404 and the site's
lineup proxy returned HTTP 502 during this audit. Consequently this is a full
current-NHL-roster identity audit, **not** confirmation that every name in the
live or browser-cached lineup feed is resolved. There may be additional source
nicknames not present in the NHL response. Those remain unresolved until a
verified NHL-ID alias is available. Similar surnames alone are never merged.

Repeat with downloaded official roster files named `ANA.json`, `BOS.json`, etc.:

```sh
node scripts/audit-player-names.cjs /path/to/roster-json-directory
```

An optional second argument accepts a published feed file and reports unmatched
source names separately. The script performs no network requests or mutations.
