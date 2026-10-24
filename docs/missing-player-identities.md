# Verified supplemental player identities

The current NHL roster is not a complete player identity index. A published
projection or special-team depth chart can name a prospect, an injured/non-roster
player, or a player whose current NHL team differs from the published projection.
A missing current-roster match does not establish that the name is fictitious.

`static/verified-players.json` contains only the following verified identities.
Each record cites the exact official NHL landing endpoint used to verify its ID,
name, jersey number, position, shooting/catching hand, birthplace country and
headshot URL. It stores metadata, not invented season or career statistics.

| Published team  | Official player   |  NHL ID | Verified current team |
| --------------- | ----------------- | ------: | --------------------- |
| ANA             | Roger McQueen     | 8485400 | ANA                   |
| COL             | Gavin Brindley    | 8484149 | COL                   |
| CBJ             | Damon Severson    | 8476923 | CBJ                   |
| NJD             | Dawson Mercer     | 8482110 | WPG                   |
| NJD             | Nico Daws         | 8482076 | WPG                   |
| SJS             | Nolan Allan       | 8482700 | SJS                   |
| WSH             | Jonny Brodzinski  | 8477380 | WSH                   |
| WPG             | Brayden Yager     | 8484242 | WPG                   |
| NJD / saved WPG | Connor Hellebuyck | 8476945 | NJD                   |

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

## Connor Hellebuyck — October 24 follow-up

The official October 24 New Jersey projection lists Jake Allen followed by
Connor Hellebuyck. The saved New Jersey roster only contains Allen and Rémi
Poirier, so the second goalie initially became an unresolved name with initials
and no jersey number. This is missing roster metadata, not a name-alias problem.

The exact official NHL landing response for `8476945` confirms Connor Hellebuyck,
number 37, goalie, catching left, USA, born May 19, 1993, 193 cm and 94 kg. It
identifies his current team as **NJD** and publishes the current portrait at
`https://assets.nhle.com/mugs/nhl/20262027/NJD/8476945.png`. That image returned
HTTP 200 as a valid 336×336 PNG and was visually checked. No WPG portrait or
team membership is invented for his current profile.

The record is scoped to current NJD projections and saved WPG source contexts:
the earlier checked-in WPG roster contains his exact NHL identity, but the
current WPG roster and most recent WPG projection now omit him. In both source
contexts, profile metadata retains verified current team NJD. His new record
has its own `checkedAt`; the original eight records and the saved team-source
timestamps have not been stamped as newly retrieved.

The current NJD and WPG published projections both have zero unresolved players
when processed with their verified rosters and the explicit supplement. The
response evidence and verified original portrait are retained outside the repo
under `nhl-lines-artifacts/hellebuyck-2026-10-24/`. Frontend regression tests cover
fresh NJD loading and saved NJD/WPG placeholders with the live roster omitting
Hellebuyck. His photograph, number, goalie position and current-team profile are
restored without a prospect request or invented statistics.
