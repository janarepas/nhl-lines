# Saved score recovery

The default view shows the previous **America/New_York calendar day**, which is the NHL schedule's date. It does not subtract a day from the browser's local date. For example, on the morning of October 24 in Budapest, the heading is **23 Oct 2026**, while the games' actual starts are on **24 Oct in Budapest**. Both dates remain visible. Calendar arithmetic and the next date-change timer account for daylight-saving changes, year boundaries and leap days. A visible tab changes its selected NHL date at Eastern midnight even when completed scores have a long cache interval.

The score endpoint keeps settled past results for six hours; live and unplayed schedules retain the 30-second shared cache. A separate date-keyed backup lasts up to 24 hours. Only connection failures and upstream 5xx responses can use that backup. Invalid JSON, invalid game data, redirects, and upstream 4xx responses remain errors. The backup keeps its original `X-NHL-Checked-At` timestamp; serving it never renews its age. The browser refreshes completed results after six hours, active games after one minute, future games after five minutes, and failed requests after five minutes. Hidden tabs and offscreen results do not poll.

The browser stores the last verified score response locally. It restores only data for the current displayed date and no older than 24 hours. During a failed refresh, the label changes to **Saved scores**. Saved live games show **Saved score** without a live indicator or clock. A verified empty schedule has a separate saved-schedule message.

A first visit during an outage can fetch `/game-snapshot.json`. This request happens only after the score API fails and no usable browser data exists. The same date, schema, and 24-hour limits apply. A saved file for another date is never shown as the selected night's results.

Scores use a wrapping grid without a horizontal carousel or date-control panel. The large team scores are native buttons: hover, keyboard focus or a mobile tap reveals that team's verified per-game scorers. A second tap, Escape or an outside tap closes the details. NHL game-report links remain available. Unplayed games show a dash and their scheduled start, never a fabricated final result.

`static/game-goal-data.js` normalizes the official score response's existing goal events. In the usual complete case, displaying goal scorers makes **no extra request**. Missing or partial details may request `/api/game-goals?game=ID`, a fixed official game-center landing adapter. One coalesced request covers both teams; complete final details share a six-hour cache and incomplete/live details a one-minute cache. Original saved timestamps and upstream retry delays are retained. The browser checks the exact game, opponents and scores before listing any names, so a newer live goal list cannot appear beneath an older score. A verified zero-goal summary is distinct from unavailable details; partial lists are explicitly incomplete. Shootout attempts and the deciding scoreboard point never become player goals.

Refresh the static backup explicitly before deployment:

```sh
node scripts/build-game-snapshot.cjs 2026-10-23
```

Omit the argument to use the same previous NHL day as the browser. The script requests the fixed official NHL score endpoint, validates the complete response, and atomically replaces the file only on success. It retains normalized goal details in the compact snapshot. Normal asset builds do not fetch live scores. The daily snapshot workflow refreshes this file alongside team backups. `checkedAt` records the successful fetch time, and `sourceUrl` preserves its provenance. An expired file is safely ignored until the next refresh.

Focused checks:

```sh
node --test tests/games.test.cjs tests/game-goal-data.test.cjs tests/game-goals.test.cjs
node tests/score-recovery.browser.cjs
node tests/goal-tooltip.browser.cjs
```
