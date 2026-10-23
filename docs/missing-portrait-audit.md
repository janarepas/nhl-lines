# Missing official portrait audit — 2026-10-23

The previous responsive-portrait build found four current-season NHL image URLs
whose HTTP success bodies were empty rather than PNG images. Official player
landing responses nevertheless contain complete identity and biographical data
for all four IDs: missing images do not mean that these players lack NHL profiles.

| Player | Current missing image | Verified same-player archive | Archive bytes |
|---|---|---|---:|
| Andreas Englund, 8477971 | `20262027/DET/8477971.png` | `20252026/NSH/8477971.png` | 162118 |
| William Trudeau, 8482806 | `20262027/NSH/8482806.png` | `20252026/MTL/8482806.png` | 174197 |
| Luke Glendening, 8476822 | `20262027/NYR/8476822.png` | `20252026/PHI/8476822.png` | 119399 |
| Justin Barron, 8482111 | `20262027/STL/8482111.png` | `20252026/NSH/8482111.png` | 185959 |

All image paths above are under `https://assets.nhle.com/mugs/nhl/`. The archives
returned nonempty, valid PNG images and were visually inspected as actual player
photographs. They remain official archive pictures; no face, uniform or player
identity was generated or replaced. The archive team and season are disclosed in
the image title/alternative text when integrated by the application.

Identity verification used official
`https://api-web.nhle.com/v1/player/{ID}/landing` responses (also accessible via
the existing site NHL proxy). Englund's, Glendening's and Barron's NHL season
histories identify the corresponding 2025/26 archive teams. Trudeau's official
landing identifies his 2021 Montréal draft and 2024/25–2025/26 Laval AHL history;
his official 2025/26 Montréal NHL-ID asset exists even though he was not in the
historical NHL roster response. A 2025/26 Nashville roster response explicitly
supplies the Barron archive URL. Other historical roster responses do not
necessarily retain every player who appeared for that organization during the
season, so roster absence alone was not treated as disproving an NHL-ID photo.

The existing Filip Hallander archive fallback remains verified and unchanged:
current `20262027/EDM/8480842.png` uses official
`20222023/PIT/8480842.png`, labelled as an archive portrait.

`static/portrait-fallbacks.js` resolves only exact current source URLs **and** NHL
IDs. A future season, different team or another player's ID does not inherit a
fallback. Records are copied so callers cannot mutate future resolutions. Its
`sources()` list lets the explicit responsive-image refresh include all verified
archives without browser-time lookup requests. Newly available/current images
can replace an entry after a verified refresh; this is a dated list of confirmed
missing sources, not a claim that these source URLs can never be repaired by NHL.

Checks:

```sh
node --test tests/portrait-fallbacks.test.cjs
```

The two tests cover all five exact identities, wrong IDs/team/season rejection,
immutable resolution results, unique official source URLs and unknown-player
fallback behavior. Source PNGs were cached outside git in
`/workspace/.nextshift-portrait-cache` for the next explicit WebP build.
