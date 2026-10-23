# Static responsive portraits

The browser uses checked-in, transparent WebP portraits at 128 and 256 pixels.
This avoids per-request image conversion, a paid image-transform dependency, and
downloads of full-size NHL PNGs for small player cards. Images remain official
NHL portraits; the pipeline only resizes and encodes their pixels.

`static/portrait-images.js` maps **exact** official source URLs, including season,
team and player ID, to static files. It never maps by player ID alone: trades,
old team images and the verified archive fallback retain their correct source.
Unknown or newly added portraits use the original NHL URL. A failed optimized
image must retry its original URL once before showing the existing initials
fallback. Native lazy loading and `srcset` select only the images actually used.

## Refresh

Ordinary `npm run build` is offline and uses the checked-in snapshot. An explicit
maintenance refresh requires `curl` and ImageMagick (`magick`) on the build
machine, with WebP support:

```sh
node scripts/build-portraits.cjs
npm run build
npm test
```

The script fetches current roster JSON for all 32 fixed NHL teams through the
existing NHL proxy. It accepts only bounded, official `assets.nhle.com` PNG URLs,
downloads with six workers, and preserves alpha when creating WebP images. It
also processes the verified same-player archive portraits listed in
`static/portrait-fallbacks.js` and the supplemental headshots in
`static/verified-players.json`. Source PNGs and roster JSON stay in the
workspace cache outside this repository. `--cache-dir=/absolute/path` selects a
different cache directory. Use `--refresh-originals` to revalidate pixels at an
unchanged season/team URL; otherwise cached source PNGs are reused.

The generated helper lists only sources whose **two** widths succeeded. Failed
sources remain on their normal original-image fallback. If more than ten percent
fail, the refresh refuses to replace the existing snapshot. The snapshot path is
content-addressed from all generated image hashes, and must use immutable cache
headers. A fresh snapshot changes its URL, so old CDN objects cannot serve stale
pixels for a new build. `static/portraits/<snapshot>/summary.json` records actual
coverage, sizes and failures. Never edit the membership list by hand.

The quality setting is 78; neither the originals nor a runtime encoder ship to
the browser. `tests/portraits.test.cjs` checks exact URL identity and fallback,
every generated WebP pair, 32-team input coverage, and the ten-megabyte budget.

A completeness audit can reuse its saved official roster files rather than issue
another batch of NHL requests:

```sh
node scripts/build-portraits.cjs --roster-dir=/path/to/raw-json
```

That directory must contain all 32 valid `roster-TEAM.json` responses; retain their
fetch dates/provenance with the audit. Invalid/failed responses stop the refresh.
