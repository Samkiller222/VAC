# VAC → Toppan connectivity monitor (skeleton)

Checks each VFS Global VAC's link to Toppan on a schedule and shows the results as a heatmap dashboard. No dependencies, Node 18+.

**Runs in mock mode by default** (simulated outages, placeholder IPs), so it can be demoed without any network access.

## Run

```bash
npm run seed       # optional: fill 24 h of simulated history so the heatmap looks full
npm run demo       # checks every 5 seconds
npm start          # checks every 5 minutes
```

Open http://localhost:3000.

## Online demo (GitHub Pages)

https://samkiller222.github.io/VAC/ runs a **static demo**: GitHub Pages can't run the Node server, so when the dashboard finds no server behind it, `public/mock.js` runs the whole mock monitor in the visitor's browser (checks every 10 s, 24 h of seeded history, test menu included). Each visitor gets their own simulation; nothing is shared or saved.

Pages setting: deploy from branch `main`, folder `/ (root)`. The root `index.html` forwards to `public/`.

GitHub Pages lets browsers cache files for up to 10 minutes. The CSS and JS links in `public/index.html` carry a version tag (`?v=...`): **change it whenever you change those files**, so browsers never mix old and new files.

## VAC list

`config/offices.json` holds the 129 VACs listed on [Identità's visa extended service branches page](https://identita.gov.mt/central-visa-unit-visa-extended-service-branches/) (checked 19 Nov 2026), grouped into regions, with approximate city-level coordinates for the map. Opening hours are deliberately not used for now: each VAC is simply **online** or **offline**.

## Dashboard features

- **World map**: one dot per VAC, coloured by live status. Hover a dot to see the VAC's name, status and when it was last reached.
- **Search**: type a VAC name, country or region above the map. Matches are highlighted on the map and in the heatmap, everything else is dimmed. Enter jumps to the first match in the heatmap; Esc clears the search.
- **Heatmap**: last 24 hours per VAC, one cell per hour, grouped by region.

## Hidden test menu

Type **`test`** anywhere on the dashboard (or open `/#test`). Esc closes it.

- **Run check now**: runs a check cycle immediately instead of waiting for the interval
- **All offline / All online / Clear overrides**: force every VAC's result, or go back to normal mock behaviour
- **Per-VAC dropdown**: Normal, Force online or Force offline for one VAC
- **Reseed 24 h history / Wipe history**: refill the heatmap with mock data, or clear it (click twice to confirm)

A VAC goes offline after 3 failed checks in a row, so after forcing one offline press **Run check now** three times to see it straight away.

The menu and its API (`/api/test`) **only work in mock mode**. With `MOCK=0` they return 404. Set `TEST_MENU=0` to switch the menu off in mock mode too. If you host it anywhere others can reach, set `DASH_USER` / `DASH_PASS`, since anyone who opens the dashboard could otherwise use the menu.

## Settings (environment variables)

| Variable | Default | What it does |
| --- | --- | --- |
| `MOCK` | `1` | `0` = real TCP checks. **Only on an approved machine inside the work network.** |
| `INTERVAL_MS` | `300000` | Time between check cycles (5 min) |
| `TIMEOUT_MS` | `5000` | How long one check waits for a connection |
| `FAIL_THRESHOLD` | `3` | Failed checks in a row before a link is DOWN and an alert is sent |
| `CONCURRENCY` | `20` | How many checks run at once |
| `RETENTION_DAYS` | `7` | How long check history is kept |
| `PORT` | `3000` | Dashboard port |
| `ALERT_WEBHOOK` | – | Teams/Slack-style webhook URL for DOWN/RECOVERED alerts |
| `DASH_USER` / `DASH_PASS` | – | Set both to put a login on the dashboard |
| `MOCK_DOWN` | – | Mock mode only: comma-separated VAC ids to force offline at start-up, e.g. `new-delhi,dhaka` |
| `TEST_MENU` | `1` | `0` = disable the hidden test menu |

## Files

```
config/offices.json   the 129 VACs from Identità's visa extended service branches page: name, country, region,
                      rough lat/lon (city level), host, port (placeholders until VFS Global provides tunnel endpoints)
src/checker.js        TCP check (used instead of ping, which is often blocked) + mock mode
src/hours.js          opening-hours support, currently unused (every VAC is simply online or offline)
src/state.js          online / offline logic (UP, WARN, DOWN) + history file (data/history.jsonl)
src/alerts.js         DOWN / RECOVERED alerts (console + optional webhook)
src/monitor.js        one check cycle + diagnosis (one VAC down = local; most down = shared problem)
src/server.js         dashboard + JSON API (/api/status, /api/history)
public/               dashboard (world map, heatmap, diagnosis box); world.svg = offline map outline
tools/make-world-svg.js  regenerates public/world.svg from Natural Earth data (only needed if you want a different map)
```

## Notes

- Host and port are never sent to the browser; the API returns names and statuses only.
- `config/offices.json` uses documentation IP ranges. Real endpoints should stay on the approved internal machine and never go into a public repo.
- To confirm with IT / VFS Global / Toppan: which endpoint and port represents each VAC's link to Toppan.
- Not built yet: a real database, user accounts, per-VAC alert routing.
