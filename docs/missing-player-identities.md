# Verified supplemental player identities — 2026-10-23

The current NHL roster is not a complete player identity index. A published
projection or special-team depth chart can name a prospect, an injured/non-roster
player, or a player whose current NHL team differs from the published projection.
A missing current-roster match does not establish that the name is fictitious.

`static/verified-players.json` contains only the following verified identities.
Each record cites the exact official NHL landing endpoint used to verify its ID,
name, jersey number, position, shooting/catching hand, birthplace country and
headshot URL. It stores metadata, not invented season or career statistics.

| Published team | Official player | NHL ID | Verified current team |
|---|---|---:|---|
| ANA | Roger McQueen | 8485400 | ANA |
| COL | Gavin Brindley | 8484149 | COL |
| CBJ | Damon Severson | 8476923 | CBJ |
| NJD | Dawson Mercer | 8482110 | WPG |
| NJD | Nico Daws | 8482076 | WPG |
| SJS | Nolan Allan | 8482700 | SJS |
| WSH | Jonny Brodzinski | 8477380 | WSH |
| WPG | Brayden Yager | 8484242 | WPG |

Identity evidence:

- McQueen, Brodzinski and Yager also appear in the official current-team
  prospects responses downloaded during this audit.
- Brindley's ID was obtained from the official Columbus 2023/24 club-statistics
  response, then his current landing response confirmed the full name and COL.
- Severson's ID appears in the official Columbus historical roster and his
  current landing response confirms CBJ.
- Mercer and Daws have NHL IDs in official New Jersey historical club statistics;
  their current landing responses identify WPG. The registry preserves that
  distinction and must never be used to claim they are currently on NJD's roster.
- The source name "Nolan Allen" is a verified spelling error for Nolan Allan:
  the current San Jose roster and official 2021 first-round draft response name
  Nolan Allan. His exact current landing confirms NHL ID 8482700. This requires
  an explicit reviewed alias; surname similarity alone is insufficient.

All eight cited headshot URLs returned HTTP 200, nonempty PNGs with the correct
PNG signatures during the audit. The downloaded originals were placed in the
workspace portrait build cache so the normal explicit optimizer can generate
small static WebP variants without another source download.

The complete fetched source JSON and PNG responses are retained outside the
repository under `nhl-lines-artifacts/player-audit-2026-10-23/identity-sources/`.
The official player search domain was blocked by the environment, so identities
were established through accessible official roster, prospect, club-statistics,
draft and player-landing endpoints instead.

The frontend should load this small registry only when a published source name
remains unmatched. It must select records by the source team and exact verified
name/alias, avoid adding unrelated players to the roster, and keep the registry
metadata separate from live NHL statistics. Unknown names should remain explicit
placeholders until a verified identity is available.
