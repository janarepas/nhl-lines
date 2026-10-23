# October 2026 performance audit fixes

The public audit identified cold-load layout shifts, large official portrait PNGs,
optional whole-roster form-log requests, and mobile labels below 12px.

- Reserve space for games, featured scorer, loading forward lines and seasonal
  card statistics. Remove the loading reserve when actual data or the final
  unavailable state is rendered.
- Serve exact-source, transparent 128/256px static WebP portraits with responsive
  selection and immutable versioned URLs. A missing optimized file retries the
  original NHL source once, then uses the existing initials fallback. See
  `portrait-images.md` for the explicit refresh workflow; normal builds are offline.
- Fetch optional form game logs only when cards approach the viewport or a profile
  is opened. One queue caps concurrency at two, coalesces updates, respects hidden
  tabs, aborts team changes and deduplicates repeated cards. Seasonal totals remain
  independent of form data. Reused card elements are observed by player identity.
- Retain original timestamps when restoring daily data. Valid stale API fallback
  data is usable but is never persisted as a newly fetched 24-hour browser entry.
- On upstream connection errors/5xx, the NHL API can return a successful last-good
  response no older than 24 hours, with explicit stale metadata and no-store. Its
  age is never extended; 429/4xx, invalid endpoint shapes and unsafe redirects remain
  errors. No extra origin retry loop was added.
- Use natural visible accessible names on brands, games and player cards. Increase
  secondary labels to at least 12px and the footer source note to 14px. Honor reduced
  transparency after the final badge styles, preserving normal opal effects.
- Observe a top-edge marker to control scroll glass without reading scroll offsets
  after layout changes. Existing arrival animations and reduced-motion behavior
  remain intact.

Verification includes unit tests, responsive delayed-content geometry, visible-form
queue behavior, real WebP transparency and image-fallback failures, player profiles,
identity reconciliation, game scores, special teams, theme persistence and scrolling.
Before/after Lighthouse reports are retained separately with measurement settings;
lab scores are not real-user INP data or measurements of battery consumption.
