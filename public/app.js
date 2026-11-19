// Dashboard: fetches /api/status and /api/history and draws the VAC -> Toppan heatmap.
// Refreshes every 60 seconds. Contains no IPs or config - only what the API returns.
const STATUS_CLASS = { UP: 'up', WARN: 'warn', DOWN: 'down', CLOSED: 'closed', UNKNOWN: 'none' };

const ago = (t) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (text !== undefined) n.textContent = text;
  return n;
};

// Data source: the Node server's API if there is one, otherwise the in-browser mock engine
// (mock.js). That fallback is what makes the dashboard work on static hosting like GitHub Pages.
const Data = {
  mode: null,
  async init() {
    if (this.mode) return;
    try {
      const r = await fetch('api/status', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { this.mode = 'server'; return; }
    } catch (e) { /* no server: fall through to static mode */ }
    await window.MockEngine.start();
    this.mode = 'static';
  },
  status() { return this.mode === 'server' ? fetch('api/status').then((r) => r.json()) : Promise.resolve(window.MockEngine.status()); },
  history(hours) { return this.mode === 'server' ? fetch(`api/history?hours=${hours}`).then((r) => r.json()) : Promise.resolve(window.MockEngine.history(hours)); },
  async test(body) {
    await this.init();
    if (this.mode === 'static') return window.MockEngine.test(body);
    const r = await fetch('api/test', {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.ok ? r.json() : null;
  },
};

async function load() {
  await Data.init();
  const [status, history] = await Promise.all([Data.status(), Data.history(24)]);
  renderMeta(status);
  lastStatus = status;
  lastHistory = history;
  renderDiagnosis(status.diagnosis);
  fillSearchList(status.offices);
  renderVacs();
}

// --- Search: highlights matching VACs on the map and in the heatmap, dims the rest ---
let lastStatus = null;
let lastHistory = null;
let searchTerm = '';

const matchesSearch = (o) => {
  if (!searchTerm) return false;
  const q = searchTerm.toLowerCase();
  return [o.name, o.country, o.id, o.region].some((v) => (v || '').toLowerCase().includes(q));
};

function renderVacs() {
  if (!lastStatus) return;
  renderMap(lastStatus.offices);
  renderHeatmap(lastStatus.offices, lastHistory);
  const info = document.getElementById('search-info');
  if (!searchTerm) { info.textContent = ''; return; }
  const n = lastStatus.offices.filter(matchesSearch).length;
  info.textContent = n ? `${n} match${n === 1 ? '' : 'es'}` : 'No VAC matches';
}

function fillSearchList(offices) {
  const list = document.getElementById('vac-list');
  if (list.childElementCount === offices.length) return;
  list.replaceChildren(...offices.map((o) => el('option', { value: o.name }, `${o.country}`)));
}

function setupSearch() {
  const input = document.getElementById('vac-search');
  input.addEventListener('input', () => { searchTerm = input.value.trim(); renderVacs(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; searchTerm = ''; renderVacs(); }
    if (e.key === 'Enter' && lastStatus) {
      // Jump to the first matching row in the heatmap
      const first = lastStatus.offices.find(matchesSearch);
      const row = first && document.getElementById(`row-${first.id}`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

// --- Map hover: custom tooltip with the VAC's name (works across the 10 s refreshes) ---
function setupMapTooltip() {
  const map = document.getElementById('map');
  const tip = el('div', { id: 'map-tip', hidden: '' });
  document.body.append(tip);
  const hide = () => { tip.hidden = true; };
  map.addEventListener('mousemove', (e) => {
    const g = e.target.closest('g[data-id]');
    const o = g && lastStatus && lastStatus.offices.find((x) => x.id === g.dataset.id);
    if (!o) return hide();
    tip.replaceChildren(el('b', {}, o.name), el('span', {}, `${o.country} · ${o.status} · last seen ${ago(o.lastSeen)}`));
    tip.hidden = false;
    const pad = 14;
    const left = Math.min(e.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${e.clientY + pad}px`;
  });
  map.addEventListener('mouseleave', hide);
}

function renderMeta(s) {
  document.getElementById('meta').textContent =
    `${s.offices.length} VACs · checked every ${s.intervalMs < 60000 ? `${Math.round(s.intervalMs / 1000)} s` : `${Math.round(s.intervalMs / 60000)} min`} · updated ${new Date(s.generatedAt).toLocaleTimeString()}` +
    (s.static ? ' · STATIC DEMO (simulated in your browser)' : s.mock ? ' · MOCK DATA' : '');
}

function renderDiagnosis(lines) {
  const box = document.getElementById('diagnosis');
  box.hidden = !lines.length;
  box.replaceChildren(el('b', {}, 'Where is the break?'));
  const ul = el('ul');
  lines.forEach((l) => ul.append(el('li', {}, l)));
  box.append(ul);
}

// World map: one dot per VAC at its rough location, coloured by live status.
// Uses the same 1000x500 equirectangular grid as public/world.svg.
// Labels only for VACs with a problem or matching the search, so 100+ dots stay readable; hover any dot for its name.
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, text) => {
  const n = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  if (text !== undefined) n.textContent = text;
  return n;
};

function renderMap(offices) {
  const X = (lon) => ((lon + 180) / 360) * 1000;
  const Y = (lat) => ((90 - lat) / 180) * 500;
  const svg = svgEl('svg', { viewBox: '0 14 1000 400', role: 'img', 'aria-label': 'Map of VAC locations and status' });
  svg.append(svgEl('image', { href: 'world.svg?v=20261119c', x: 0, y: 14, width: 1000, height: 400 }));

  // Draw problems (and search matches) last so they sit on top of nearby healthy dots
  const order = { DOWN: 3, WARN: 2, UP: 1 };
  const rank = (o) => (matchesSearch(o) ? 10 : 0) + (order[o.status] || 0);
  const sorted = offices.filter((o) => o.lat != null && o.lon != null).sort((a, b) => rank(a) - rank(b));

  for (const o of sorted) {
    const x = X(o.lon), y = Y(o.lat);
    const match = matchesSearch(o);
    const g = svgEl('g', { 'data-id': o.id, class: searchTerm ? (match ? 'match' : 'dim') : '' });
    if (match) g.append(svgEl('circle', { class: 'hl', cx: x, cy: y, r: 10 }));
    if (o.status === 'DOWN') g.append(svgEl('circle', { class: 'pulse', cx: x, cy: y, r: 9 }));
    g.append(svgEl('circle', { class: STATUS_CLASS[o.status] || 'none', cx: x, cy: y, r: o.status === 'DOWN' || match ? 5.5 : 4 }));
    g.append(svgEl('circle', { class: 'hit', cx: x, cy: y, r: 10 })); // bigger invisible hover target
    if (match || o.status === 'DOWN' || o.status === 'WARN') g.append(svgEl('text', { x: x + 12, y: y + 3 }, o.name));
    svg.append(g);
  }
  document.getElementById('map').replaceChildren(svg);
}

function renderHeatmap(offices, history) {
  const table = el('table');
  // Hour labels (local time of the viewer)
  const head = el('tr');
  head.append(el('th'));
  history.buckets.forEach((b, i) => head.append(el('td', { class: 'hour' }, i % 3 === 0 ? new Date(b).getHours() : '')));
  head.append(el('td', { class: 'hour' }, 'now'));
  table.append(head);

  // Group by region so regional problems show as a block
  const regions = [...new Set(offices.map((o) => o.region))].sort();
  for (const region of regions) {
    const r = el('tr');
    r.append(el('th', { class: 'region', colspan: history.buckets.length + 2 }, region));
    table.append(r);
    for (const o of offices.filter((x) => x.region === region)) {
      const row = el('tr', { id: `row-${o.id}`, class: searchTerm ? (matchesSearch(o) ? 'match' : 'dim') : '' });
      row.append(el('th', { title: `${o.country} · ${o.timezone}` }, o.name));
      (history.rows[o.id] || []).forEach((v, i) => {
        const hour = new Date(history.buckets[i]).toLocaleString();
        row.append(el('td', { class: `cell ${v || 'none'}`, title: `${o.name} · ${hour} · ${v || 'no data'}` }));
      });
      const now = el('td', { class: 'now' });
      now.append(el('b', { class: STATUS_CLASS[o.status] }, ` ${o.status} `));
      now.append(document.createTextNode(` · last seen ${ago(o.lastSeen)}`));
      row.append(now);
      table.append(row);
    }
  }
  document.getElementById('heatmap').replaceChildren(table);
}

setupSearch();
setupMapTooltip();
load().catch((e) => { document.getElementById('meta').textContent = `Failed to load: ${e.message}`; });
setInterval(() => load().catch(() => {}), 10000);
