// Small HTTP server (no dependencies): serves the dashboard and a JSON API.
//   GET /api/status          live status of every hop and office + diagnosis
//   GET /api/history?hours=N check history, bucketed per hour for the heatmap
// Optional login: set DASH_USER and DASH_PASS to require HTTP Basic auth.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const state = require('./state');
const { diagnose, runCycle } = require('./monitor');
const testControls = require('./testControls');
const { generateHistory } = require('./seed');

const publicDir = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const USER = process.env.DASH_USER || '';
const PASS = process.env.DASH_PASS || '';

const safeEqual = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function authorised(req) {
  if (!USER || !PASS) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const [u, ...rest] = Buffer.from(header.slice(6), 'base64').toString().split(':');
  return safeEqual(u, USER) && safeEqual(rest.join(':'), PASS);
}

function sendJson(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// Public view of a VAC: never includes host/port, so IPs never reach the browser.
const publicOffice = (o) => ({ id: o.id, name: o.name, country: o.country, region: o.region, timezone: o.timezone, lat: o.lat, lon: o.lon, ...state.getLive(o.id) });

function statusPayload() {
  return {
    generatedAt: Date.now(),
    mock: config.mock,
    intervalMs: config.intervalMs,
    offices: config.offices.map(publicOffice),
    diagnosis: diagnose(),
  };
}

// Buckets checks per target per hour: 'up' | 'warn' (some fails) | 'down' (all fail) | 'closed' | null.
function historyPayload(hours) {
  const now = Date.now();
  const start = now - hours * 36e5;
  const bucketStart = Math.floor(start / 36e5) * 36e5;
  const buckets = Array.from({ length: hours + 1 }, (_, i) => bucketStart + i * 36e5);
  const cells = {};
  for (const h of state.getHistory(bucketStart)) {
    const i = Math.floor((h.t - bucketStart) / 36e5);
    const key = `${h.id}:${i}`;
    const c = cells[key] || (cells[key] = { ok: 0, fail: 0, closed: 0 });
    if (!h.open) c.closed++; else if (h.ok) c.ok++; else c.fail++;
  }
  const rows = {};
  for (const id of config.offices.map((t) => t.id)) {
    rows[id] = buckets.map((_, i) => {
      const c = cells[`${id}:${i}`];
      if (!c) return null;
      if (c.ok + c.fail === 0) return 'closed';
      if (c.fail === 0) return 'up';
      return c.ok === 0 ? 'down' : 'warn';
    });
  }
  return { buckets, rows };
}

// --- Hidden test menu API (mock mode only; 404 otherwise) ---
//   GET  /api/test   current test settings
//   POST /api/test   { action: 'set', id, mode: 'auto'|'up'|'down' }
//                    { action: 'all', mode: 'auto'|'up'|'down' }
//                    { action: 'ignoreHours', value: true|false }
//                    { action: 'runNow' } | { action: 'reseed' } | { action: 'reset' }
const testPayload = () => ({
  enabled: testControls.enabled,
  ignoreHours: testControls.ignoreHours,
  overrides: Object.fromEntries(testControls.overrides),
  vacs: config.offices.map((o) => ({ id: o.id, name: o.name, country: o.country })),
});

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
});

async function handleTest(req, res) {
  if (!testControls.enabled) { res.writeHead(404); return res.end('Not found'); }
  if (req.method === 'GET') return sendJson(res, testPayload());
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }

  const body = await readBody(req);
  const validId = (id) => config.offices.some((o) => o.id === id);
  const setMode = (id, mode) => (mode === 'up' || mode === 'down' ? testControls.overrides.set(id, mode) : testControls.overrides.delete(id));

  switch (body.action) {
    case 'set':
      if (!validId(body.id)) { res.writeHead(400); return res.end('Unknown VAC'); }
      setMode(body.id, body.mode); break;
    case 'all':
      config.offices.forEach((o) => setMode(o.id, body.mode)); break;
    case 'ignoreHours':
      testControls.ignoreHours = Boolean(body.value); break;
    case 'runNow':
      await runCycle(); break;
    case 'reseed':
      state.reset(generateHistory(24)); break;
    case 'reset':
      state.reset([]); break;
    default:
      res.writeHead(400); return res.end('Unknown action');
  }
  console.log(`[test menu] ${JSON.stringify(body)}`);
  return sendJson(res, testPayload());
}

function start() {
  const server = http.createServer((req, res) => {
    if (!authorised(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Office monitor"' });
      return res.end('Login required');
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/test') {
      return handleTest(req, res).catch(() => { res.writeHead(400); res.end('Bad request'); });
    }
    if (url.pathname === '/api/status') return sendJson(res, statusPayload());
    if (url.pathname === '/api/history') {
      const hours = Math.min(Math.max(Number(url.searchParams.get('hours')) || 24, 1), 24 * 7);
      return sendJson(res, historyPayload(hours));
    }
    const file = url.pathname === '/' ? 'index.html' : path.basename(url.pathname);
    const full = path.join(publicDir, file);
    if (!fs.existsSync(full)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'text/plain' });
    fs.createReadStream(full).pipe(res);
  });
  server.listen(config.port, () => console.log(`Dashboard on http://localhost:${config.port}${USER ? ' (login required)' : ''}`));
  return server;
}

module.exports = { start };
