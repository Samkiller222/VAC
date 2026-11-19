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

async function load() {
  const [status, history] = await Promise.all([
    fetch('/api/status').then((r) => r.json()),
    fetch('/api/history?hours=24').then((r) => r.json()),
  ]);
  renderMeta(status);
  renderDiagnosis(status.diagnosis);
  renderMap(status.offices);
  renderHeatmap(status.offices, history);
}

function renderMeta(s) {
  document.getElementById('meta').textContent =
    `${s.offices.length} VACs · checked every ${Math.round(s.intervalMs / 60000) || '<1'} min · updated ${new Date(s.generatedAt).toLocaleTimeString()}` +
    (s.mock ? ' · MOCK DATA' : '');
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
// Labels only for VACs with a problem, so 100+ dots stay readable; hover any dot for its name.
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
  svg.append(svgEl('image', { href: 'world.svg', x: 0, y: 14, width: 1000, height: 400 }));

  // Draw problems last so they sit on top of nearby healthy dots
  const order = { DOWN: 3, WARN: 2, UP: 1 };
  const sorted = offices.filter((o) => o.lat != null && o.lon != null)
    .sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0));

  for (const o of sorted) {
    const x = X(o.lon), y = Y(o.lat);
    const g = svgEl('g');
    g.append(svgEl('title', {}, `${o.name}, ${o.country} · ${o.status} · last seen ${ago(o.lastSeen)}`));
    if (o.status === 'DOWN') g.append(svgEl('circle', { class: 'pulse', cx: x, cy: y, r: 9 }));
    g.append(svgEl('circle', { class: STATUS_CLASS[o.status] || 'none', cx: x, cy: y, r: o.status === 'DOWN' ? 5.5 : 4 }));
    if (o.status === 'DOWN' || o.status === 'WARN') g.append(svgEl('text', { x: x + 8, y: y + 3 }, o.name));
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
      const row = el('tr');
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

load().catch((e) => { document.getElementById('meta').textContent = `Failed to load: ${e.message}`; });
setInterval(() => load().catch(() => {}), 60000);
