# Browser performance review — 2026-10-20

The production bundle was checked with deterministic NHL/source fixtures in
Chromium. These results measure browser work, not live API latency or battery
consumption.

## Changes and measured results

- Ten concurrent requests for the same stored player response now share one
  IndexedDB read instead of performing ten. Each caller still receives its own
  copy. The 24-hour expiry and retry behavior for failed/invalid data are retained.
- Ten unchanged updates of an open player profile now produce zero DOM mutations
  instead of thirty. Portrait nodes, keyboard focus and expanded history remain
  intact. A real metric change still updates the displayed value.
- Scoring-leader updates use the same incremental DOM patcher. The rotating
  leader remains visible after its outgoing animation is released.
- Date/time formatters are reused for source timestamps and scheduled games.
  Timezone-specific score formatters use a bounded cache.
- Touch devices retain the scrolling-edge gradient without its fixed backdrop
  blur. The requested 20px player-dialog backdrop blur remains available.

## Validation

- `npm test`: 49 passing unit tests, including production asset reproducibility,
  SEO metadata, source validation, player identity and statistics.
- Eight passing browser suites: `dfo`, `scoreboard`, `profile`, `player-cache`,
  `dom`, `motion`, `identity-cache`, `prospects`.
- Viewports 320, 393, 820 and 1440 checked for page overflow; goalie fallback
  cards stay separate. Profile widths 320, 393 and 820 checked for modal overflow.
- Hidden-page polling pause, daily cache restoration, failure states, real
  profile metric updates and scoring-leader rotation covered by browser tests.

## Remaining external limitation

Update: the dependency below has subsequently been replaced by the official,
cached [NHL.com projection adapter](nhl-lineup-source.md), with dated previews
verified for all 32 teams. The following describes the pre-replacement state.

Published line combinations still depend on a working source. The configured
public feed has returned HTTP 404, and the direct Daily Faceoff route has returned
HTTP 403. This review does not restore those services or invent line/pair order.
The explicitly labelled NHL roster fallback remains available.
