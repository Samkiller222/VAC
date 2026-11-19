# Deploying the VAC monitor (production)

How to run the monitor for real: on a server inside the government network, checking each VAC's VPN tunnel every 5 minutes, with no one's PC needing to stay on.

## 1. Where it runs

| Requirement | Why |
| --- | --- |
| A small server or VM **inside the government network** (Linux or Windows Server) | Only machines inside the network can reach the VAC VPN tunnels |
| **Node.js 18 or newer** (or Docker) | The app has no other dependencies |
| **Outbound access** from the server to every VAC tunnel endpoint on its port | The checks are TCP connections from this server |
| A **fixed IP address** for the server | VFS Global allows the checks from this address only |
| An **internal web address** with HTTPS, e.g. `vac-monitor.identita.gov.mt` | How staff, Toppan and VFS Global open the dashboard |

Not suitable: GitHub Pages (static files only, cannot run checks) or outside cloud hosting (cannot reach the tunnels, and should not hold the endpoint list).

Size: 1 vCPU, 512 MB RAM and 1 GB disk is plenty for 129 VACs.

## 2. The real VAC list (tunnel endpoints)

The repo's `config/offices.json` has **placeholder addresses only** and stays that way.

1. Copy `config/offices.json` to the server, e.g. `/etc/vac-monitor/offices.json`.
2. For each VAC, set `host` (tunnel endpoint IP or hostname) and `port` from the details VFS Global provides.
3. Make the file readable only by the service account: `chmod 640`, owned by `root:vacmon`.
4. Point the app at it with `OFFICES_FILE=/etc/vac-monitor/offices.json`.

At start-up the app checks the list: missing ids, names, hosts or ports stop it with a clear message, and it warns if any VAC still has a placeholder address. Hosts and ports are never sent to the browser.

Never commit the real list. `.gitignore` already ignores `*.private.json` in case it is kept next to the code.

## 3. Install as a service

### Linux (systemd)

```bash
sudo useradd --system --home /opt/vac-monitor --shell /usr/sbin/nologin vacmon
sudo mkdir -p /opt/vac-monitor /etc/vac-monitor /var/lib/vac-monitor
sudo cp -r index.js package.json src public config /opt/vac-monitor/
sudo cp deploy/vac-monitor.env.example /etc/vac-monitor/vac-monitor.env   # then edit it
sudo chown -R vacmon:vacmon /var/lib/vac-monitor
sudo chown root:vacmon /etc/vac-monitor/*  && sudo chmod 640 /etc/vac-monitor/*
sudo cp deploy/vac-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now vac-monitor
journalctl -u vac-monitor -f      # logs: start-up summary, cycles, alerts
```

### Windows Server

1. Install Node.js LTS and copy the project to `C:\vac-monitor`.
2. Put the private list at `C:\ProgramData\vac-monitor\offices.json`.
3. Install it as a service with [NSSM](https://nssm.cc/) (or IT's preferred service wrapper):
   ```
   nssm install vac-monitor "C:\Program Files\nodejs\node.exe" C:\vac-monitor\index.js
   nssm set vac-monitor AppDirectory C:\vac-monitor
   nssm set vac-monitor AppEnvironmentExtra MOCK=0 OFFICES_FILE=C:\ProgramData\vac-monitor\offices.json DATA_DIR=C:\ProgramData\vac-monitor\data DASH_USER=... DASH_PASS=... TEST_MENU=0
   nssm start vac-monitor
   ```

### Docker

See the comments at the top of `Dockerfile`: the private list is mounted read-only and history is kept in a volume.

## 4. HTTPS in front

Run the app on `127.0.0.1:3000` and put IT's standard reverse proxy in front (nginx, IIS with URL Rewrite, or the existing load balancer) with the internal certificate. Users only ever reach the HTTPS address.

## 5. Settings

All settings are environment variables; `deploy/vac-monitor.env.example` lists the production values.

| Variable | Production value | Notes |
| --- | --- | --- |
| `MOCK` | `0` | Real checks |
| `OFFICES_FILE` | path to the private list | Real tunnel endpoints |
| `DATA_DIR` | e.g. `/var/lib/vac-monitor` | Check history (7 days) |
| `INTERVAL_MS` / `TIMEOUT_MS` / `FAIL_THRESHOLD` | `300000` / `5000` / `3` | Every 5 min; offline after 3 failures |
| `DASH_USER` / `DASH_PASS` | set both | Login on the dashboard |
| `TEST_MENU` | `0` | Also off automatically when `MOCK=0` |
| `ALERT_WEBHOOK` | optional | Teams/Slack-style webhook for alerts |

## 6. Access control

**Now:** HTTPS plus the dashboard login (`DASH_USER` / `DASH_PASS`).

**Planned, not implemented yet:** an IP allowlist so only the government network and the fixed IPs of Toppan and VFS Global can reach the dashboard. The simplest place for it is the reverse proxy or firewall in step 4, before requests reach the app. Combine it with a login: an allowlist identifies the network, not the person. Longer term, Identità's single sign-on in front of the dashboard would replace the shared login.

## 7. Before go-live checklist

- [ ] Server inside the government network, fixed IP, Node.js or Docker installed
- [ ] VFS Global has provided tunnel endpoint + port for every VAC
- [ ] VFS Global and government IT have allowed checks from the server's IP
- [ ] Private `offices.json` in place, readable only by the service account
- [ ] `MOCK=0`, login set, `TEST_MENU=0`
- [ ] HTTPS address set up and working
- [ ] First cycle in the logs shows real results (no placeholder warning)
- [ ] Alert webhook or contact set up
