# Browser performance and technical SEO

## Runtime changes

- Lineup markup is patched in place. Unchanged cards, portraits, focus and event
  handlers survive statistics updates; no-op renders do not mutate lineup DOM.
- Player statistics summaries are memoized per game-log record and minute.
- Player clicks and portrait failures use delegated listeners.
- Scrolling uses the browser's native wheel/touch implementation. Row arrivals
  use opacity/transforms rather than an animated blur. Reduced motion remains
  supported; animation bookkeeping is bounded.
- Scoring-leader rotation runs only while visible, on screen, and when reduced
  motion / data-saving preferences permit. Hidden tabs have no refresh or
  rotation timers, defer renders, and pause new game-log requests until visible.
  Requests already in flight are allowed to complete and populate the cache.
- The public PK chart is fetched when its tab is opened, rather than on every
  team load. Roster, profile and game-log success caching remains 24 hours;
  failures are never cached as successful data.
- The featured portrait is eager/high priority; roster portraits and closed
  team-picker logos use native lazy loading, asynchronous decoding and explicit
  dimensions. No extra font service, analytics or runtime framework is added.

## Production build

Edit `src/index.html`, `static/style.css` and the readable `static/*.js` sources.
Run `npm ci` then `npm run build`. Commit generated `static/index.html` and
`static/assets/site-*.{css,js}` alongside source changes. Deployment needs no
Node runtime or separate build step. The build uses pinned esbuild, preserves
CSS rule order, combines the runtime JavaScript into one deferred script, and
omits the diagnostic DFO HTML parser. Content hashes allow one-year immutable
asset caching; changed code receives a new URL. HTML is revalidated normally.

The Rust development server serves the same generated assets and SEO files.

## Measurements and limits

A synthetic roster browser fixture measured ten consecutive unchanged renders:

| Metric                                 |        Before |              After |
| -------------------------------------- | ------------: | -----------------: |
| Lineup child-list mutations            |           140 |                  0 |
| First player card retained             |            No |                Yes |
| Ten renders, one local run             |         31 ms |         about 8 ms |
| JavaScript before transfer compression |  98,940 bytes | about 63,350 bytes |
| CSS before transfer compression        | 114,112 bytes |       87,187 bytes |
| Initial runtime script requests        |             9 |                  1 |

Timing is machine-dependent and is not a real-device battery or Core Web Vitals
measurement. The browser regression asserts zero no-op mutations and retained
card identity, not a fragile timing threshold. DOM patching additionally tests
changed statistics, focus, listeners, images, animation state and structural
changes. Hidden-tab tests exercise timer cancellation, rendering deferral and
worker resumption. Functional suites run against the production assets.

## SEO

The public origin remains `https://nhl-lines.pages.dev/`. HTML includes an
explicit canonical URL, description, Open Graph / Twitter metadata, favicon,
visible explanatory copy, a no-JavaScript message and truthful WebSite /
WebApplication JSON-LD. `robots.txt` points to a sitemap of the actual public
page. API resources are not blocked from crawlers because Google needs them to
render the application. Unknown Pages URLs get a proper 404 document.

This improves technical discovery and presentation; it does not guarantee
indexing or rankings. Live lineups remain client-rendered and depend on the
upstream feed's availability. The feed returned 404 in the earlier identity
audit; no invented lineups or misleading "live"/freshness claims are added.
There are no fabricated ratings, thin team pages, keyword stuffing or false
update dates. Search Console registration and live Core Web Vitals collection
have not been performed. If the public domain changes, update the canonical,
structured-data URLs, social URL, robots and sitemap together, then rebuild.
