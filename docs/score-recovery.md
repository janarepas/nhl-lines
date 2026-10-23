# Saved score recovery

The score endpoint keeps a successful response for 30 seconds and a separate date-keyed backup for up to 24 hours. Only connection failures and upstream 5xx responses can use that backup. Invalid JSON, invalid game data, redirects, and upstream 4xx responses remain errors. The backup keeps its original `X-NHL-Checked-At` timestamp; serving it never renews its age.

The browser stores the last verified score response locally. It restores only data for the current displayed date and no older than 24 hours. During a failed refresh, the label changes to **Saved scores**. Saved live games show **Saved score** without a live indicator or clock. A verified empty schedule has a separate saved-schedule message.

A first visit during an outage can fetch `/game-snapshot.json`. This request happens only after the score API fails and no usable browser data exists. The same date, schema, and 24-hour limits apply. A saved file for another date is never shown as today's schedule.

Refresh the static backup explicitly before deployment:

```sh
node scripts/build-game-snapshot.cjs 2026-10-23
```

Omit the argument to use the current date in the process timezone (UTC in the daily workflow). The script requests the fixed official NHL score endpoint, validates the complete response, and atomically replaces the file only on success. Normal asset builds do not fetch live scores. The daily snapshot workflow refreshes this file alongside team backups. `checkedAt` records the successful fetch time, and `sourceUrl` preserves its provenance. An expired file is safely ignored until the next refresh.

Focused checks:

```sh
node --test tests/games.test.cjs
node tests/score-recovery.browser.cjs
```
