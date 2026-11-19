// Static demo engine: runs the whole mock monitor inside the browser.
// Used automatically when there is no Node server behind the page (e.g. GitHub Pages).
// Mirrors the server's mock logic: simulated checks, UP/WARN/DOWN/CLOSED, history, test menu actions.
(function () {
  const THRESHOLD = 3;
  const INTERVAL_MS = 10000;        // static demo checks every 10 s so changes show quickly
  const SEED_STEP_MS = 5 * 60000;   // seeded history uses the real 5-minute rhythm
  const DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  let offices = [];
  const live = new Map();
  let history = [];
  const overrides = new Map();
  const outages = new Map();
  let ignoreHours = false;

  function isOpen(o, date = new Date()) {
    if (!o.hours) return true;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: o.timezone, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(date);
    const weekday = DAY[parts.find((p) => p.type === 'weekday').value];
    const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
    return o.hours.days.includes(weekday) && hour >= o.hours.open && hour < o.hours.close;
  }

  function check(o) {
    const forced = overrides.get(o.id);
    if (forced === 'down') return { ok: false };
    if (forced === 'up') return { ok: true };
    let remaining = outages.get(o.id) || 0;
    if (remaining === 0 && Math.random() < 0.02) remaining = 3 + Math.floor(Math.random() * 6);
    if (remaining > 0) { outages.set(o.id, remaining - 1); return { ok: false }; }
    return { ok: Math.random() >= 0.03 };
  }

  function record(id, result, open) {
    const now = Date.now();
    const prev = live.get(id) || { status: 'UNKNOWN', consecutiveFails: 0, lastSeen: null, lastChange: now };
    const consecutiveFails = result.ok ? 0 : prev.consecutiveFails + 1;
    let status;
    if (!open) status = 'CLOSED';
    else if (result.ok) status = 'UP';
    else if (consecutiveFails >= THRESHOLD) status = 'DOWN';
    else status = 'WARN';
    live.set(id, { status, consecutiveFails, lastSeen: result.ok ? now : prev.lastSeen, lastChange: status !== prev.status ? now : prev.lastChange });
    history.push({ t: now, id, ok: result.ok, open });
  }

  function cycle() {
    for (const o of offices) record(o.id, check(o), ignoreHours || isOpen(o));
    const cutoff = Date.now() - 25 * 36e5;
    history = history.filter((h) => h.t >= cutoff);
  }

  function seed(hours = 24) {
    const now = Date.now();
    const entries = [];
    for (const o of offices) {
      let down = 0;
      for (let at = now - hours * 36e5; at < now; at += SEED_STEP_MS) {
        if (down === 0 && Math.random() < 0.004) down = 6 + Math.floor(Math.random() * 18);
        const ok = down > 0 ? false : Math.random() > 0.02;
        if (down > 0) down--;
        entries.push({ t: at, id: o.id, ok, open: isOpen(o, new Date(at)) });
      }
    }
    history = entries.sort((a, b) => a.t - b.t);
  }

  function diagnose() {
    const get = (id) => live.get(id) || { status: 'UNKNOWN' };
    const open = offices.filter((o) => get(o.id).status !== 'CLOSED');
    const down = open.filter((o) => get(o.id).status === 'DOWN');
    if (!down.length) return [];
    if (open.length >= 3 && down.length / open.length >= 0.5) {
      return [`${down.length} of ${open.length} open VACs are down at once: likely a shared problem on the path to Toppan, not the VACs themselves`];
    }
    return down.map((o) => `${o.name}: link to Toppan down (other VACs are fine, so likely local to this VAC)`);
  }

  function status() {
    return {
      generatedAt: Date.now(),
      mock: true,
      static: true,
      intervalMs: INTERVAL_MS,
      offices: offices.map((o) => ({
        id: o.id, name: o.name, country: o.country, region: o.region, timezone: o.timezone, lat: o.lat, lon: o.lon,
        ...(live.get(o.id) || { status: 'UNKNOWN' }),
      })),
      diagnosis: diagnose(),
    };
  }

  function historyPayload(hours = 24) {
    const bucketStart = Math.floor((Date.now() - hours * 36e5) / 36e5) * 36e5;
    const buckets = Array.from({ length: hours + 1 }, (_, i) => bucketStart + i * 36e5);
    const cells = {};
    for (const h of history) {
      if (h.t < bucketStart) continue;
      const key = `${h.id}:${Math.floor((h.t - bucketStart) / 36e5)}`;
      const c = cells[key] || (cells[key] = { ok: 0, fail: 0 });
      if (h.open) { if (h.ok) c.ok++; else c.fail++; }
    }
    const rows = {};
    for (const o of offices) {
      rows[o.id] = buckets.map((_, i) => {
        const c = cells[`${o.id}:${i}`];
        if (!c) return null;
        if (c.ok + c.fail === 0) return 'closed';
        if (c.fail === 0) return 'up';
        return c.ok === 0 ? 'down' : 'warn';
      });
    }
    return { buckets, rows };
  }

  function test(body) {
    const setMode = (id, mode) => (mode === 'up' || mode === 'down' ? overrides.set(id, mode) : overrides.delete(id));
    if (body) {
      switch (body.action) {
        case 'set': if (offices.some((o) => o.id === body.id)) setMode(body.id, body.mode); break;
        case 'all': offices.forEach((o) => setMode(o.id, body.mode)); break;
        case 'ignoreHours': ignoreHours = Boolean(body.value); break;
        case 'runNow': cycle(); break;
        case 'reseed': live.clear(); seed(24); break;
        case 'reset': live.clear(); history = []; break;
        default: break;
      }
    }
    return {
      enabled: true,
      ignoreHours,
      overrides: Object.fromEntries(overrides),
      vacs: offices.map((o) => ({ id: o.id, name: o.name, country: o.country })),
    };
  }

  async function start() {
    const data = await fetch('../config/offices.json').then((r) => r.json());
    // Keep only what the dashboard needs; host/port are never used in the browser.
    offices = data.offices.map(({ host, port, ...rest }) => rest);
    seed(24);
    cycle();
    setInterval(cycle, INTERVAL_MS);
  }

  window.MockEngine = { start, status, history: historyPayload, test };
})();
