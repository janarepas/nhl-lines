# Official NHL lineup source

`/api/lineups?team=ANA` replaces the removed Between the Lines JSON feed.
Only the 32 fixed NHL team codes are accepted. No browser HTML parser, external
script, new client library, account or scheduled scraping service is needed.

## Fetching and caching

1. Read the official NHL.com season's daily projected-lineup article. Parse its
   structured `NewsArticle.articleBody`; preserve published row order.
2. If that team is missing, read one shared seven-day official NHL schedule.
   Try at most its two most recent game-preview articles, using fixed team slugs
   and dates. Never fetch an arbitrary supplied URL or follow redirects.
3. Return only that team's rows, source URL, article update timestamp and game
   date as compact JSON. The browser does not receive article HTML.

The daily article, schedule, individual preview and team result share a
five-minute Cloudflare Cache API cache. Concurrent identical cold requests share
one promise. Successful team responses also have a two-minute browser HTTP cache.
Errors are not cached and do not overwrite saved lineups. Existing ten-minute
team refresh behavior is retained; no extra polling or browser timers were added.

## Honest labels and parsing boundaries

These are **projected**, not confirmed, lineups. Every projection shows its game
date and actual source timestamp. Older-game fallback has an explicit notice and
`Previous projected` goalie labels. No claim is made that an off-day projection
is today's confirmed lineup. Articles older than seven days are rejected;
otherwise a saved projection or the explicitly labelled roster fallback remains.

Source canonical URL, article type, timestamp, team heading, player names, row
widths and duplicate names within a position group are validated. No article
script is executed. Four forward rows and three/four defense rows are preserved.
An 11-forward/7-defenseman lineup keeps its short forward row and lone defender;
the latter is labelled `Additional defenseman`, not a goalie or invented pair.
The two published goalie entries remain separate. Identically named forward and
defenseman Elias Pettersson remain different NHL people, matched by position.

Official preview articles do not supply complete PP/PK units. Missing units are
not synthesized from these rows. The existing independently loaded public PK
sources continue to operate.

## Coverage verified 2026-10-20

All **32 teams** had a parsable official projection dated October 17–20. Ten
teams appeared in the daily article at the time of the audit; the remaining
teams were verified against individual official game-preview articles. Average
team JSON payload was **650 bytes**, before HTTP compression. This is a dated
coverage check, not a guarantee of publication during breaks/offseason.

The NHL roster identity audit left two names without current roster matches:
Roger McQueen and Damon Severson. Existing exact official prospect matching can
resolve McQueen; unresolved names remain visible without invented NHL IDs or
statistics. Verified nickname/typographic variants for Max Shabanov, Matt Kessel,
Gabe Perrreault, Vinni Letteri and Alaiksei Protas resolve to the corresponding
official roster identities without fuzzy surname matching.

Reproduce the read-only saved-response audit:

```sh
node scripts/audit-nhl-lineups.cjs ARTICLE_DIR SCHEDULE_JSON 2026-10-20T17:00:00Z
```

Save HTML files by the official URL's final path segment plus `.html`; include
`nhl-lineup-projections-2026-27-season.html`. The schedule is the response to
`https://api-web.nhle.com/v1/schedule/2026-10-14` for this audit date.

Unit/API tests cover parsing, short lines, the seventh defender, identical names,
schema failures, source URL validation, cold-request sharing and edge caching.
`tests/nhl-lineups.browser.cjs` covers the production bundle at 320/393/820/1440px,
separate goalies, statistics, historical date labels and saved rows after failure.
The Rust development server forwards to the production lineup adapter, avoiding
a second independent parser; it is not used by the Cloudflare deployment.
