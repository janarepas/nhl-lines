# Ranked special teams and dark mode — 2026-10-21

## Source and unit membership

The NHL projected-lineup articles do not publish PP units. The new
`/api/special-teams?team=ANA` endpoint reads ESPN's public depth-chart response
and returns both PP and PK units in a compact, team-scoped JSON response.

Each ESPN athlete entry currently has an explicit numeric `rank` identifying
unit 1 or unit 2. The adapter selects **by rank**, independently of array order.
This differs from the older fallback that flattened participant names and lost
their rank metadata. Neither ice time nor statistics determine membership.

- PP1 and PP2 require five players each.
- PK unit 1 and PK unit 2 require two forwards and two defensemen each. The
  display places the two forwards above the two defensemen in a schematic box.
- Missing ranks or incomplete groups remain unavailable; a missing fourth/fifth
  player is never filled by borrowing a player from the next unit.
- NHL roster identities and verified aliases are reused. Unresolved names keep
  an explicit placeholder without an invented NHL ID, portrait or statistics.
- Published unit ranks are source projections, not a guarantee of game-day use.

Saved live ESPN responses for all 32 teams were checked on 2026-10-21. All had
two five-player PP units and two complete 2F+2D PK units. Repeat the read-only
audit with:

```sh
node scripts/audit-special-teams.cjs CHART_DIR
```

Use team-code filenames such as `ANA.json` and `WPG.json` containing the ESPN
`teams/{id}/depthcharts` response. Team IDs are fixed in `lib/espn-teams.js`.

## Resource use

The browser requests this endpoint only when a special-teams tab first needs it.
PP and PK share the same response and in-memory result. Tab/theme changes do not
reload it. Edge caching is five minutes, browser HTTP caching two minutes, and
identical concurrent origin requests share one promise. Failed responses are
not cached. The browser no longer downloads/parses RotoWire HTML for this view.
No new library, polling timer or animation was added.

The Rust development server reuses the deployed adapter instead of introducing
a second parser. The old PK-only adapters remain for compatibility.

## Theme

The default palette is now soft dark charcoal with muted off-white text; the
icon toggles Dark / Light. Existing `vintage` preferences migrate to `dark`
before first paint. Preferences persist without data refreshes.

Status, scoring, shooting and goalie-hand badges have transparent backgrounds
and no backdrop filters or opaque white borders. Native emoji retain their
platform artwork. Vector UI icons inherit text color. NHL team logos use the
official `_dark.svg` or `_light.svg` variant appropriate to the selected theme,
including the picker and scores. New team/score renders respect the current
theme. The player-dialog backdrop keeps its requested blur.

## Verification

Unit/API tests exercise explicit ranks, deliberately reversed source arrays,
missing ranks, duplicate/malformed data, fixed routes, 32-team mapping, request
coalescing and successful/error caching. Browser coverage includes both units,
2F+2D placement, ten PP cards/eight PK cards, one shared request, transparent
badges, preference migration, theme switching and widths 320–1440px.
