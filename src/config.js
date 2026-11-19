// Loads settings from environment variables and the VAC list.
//
// VAC list: by default config/offices.json (placeholder IPs, safe for the public repo).
// In production, put the real list with the VPN tunnel endpoints in a PRIVATE file on the
// server, outside the repo, and point to it with OFFICES_FILE, e.g.
//   OFFICES_FILE=/etc/vac-monitor/offices.json
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mock = process.env.MOCK !== '0';

const officesFile = process.env.OFFICES_FILE
  ? path.resolve(process.env.OFFICES_FILE)
  : path.join(root, 'config', 'offices.json');

function loadOffices(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Cannot read the VAC list at ${file}: ${err.message}`);
    process.exit(1);
  }
  const offices = data.offices || [];
  const problems = [];
  const ids = new Set();
  offices.forEach((o, i) => {
    const where = `entry ${i + 1}${o.name ? ` (${o.name})` : ''}`;
    if (!o.id) problems.push(`${where}: missing "id"`);
    else if (ids.has(o.id)) problems.push(`${where}: duplicate id "${o.id}"`);
    ids.add(o.id);
    if (!o.name) problems.push(`${where}: missing "name"`);
    if (!mock && !o.host) problems.push(`${where}: missing "host"`);
    if (!mock && !(Number(o.port) > 0)) problems.push(`${where}: missing or invalid "port"`);
  });
  if (problems.length) {
    console.error(`Problems in the VAC list at ${file}:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  // Live mode with placeholder addresses would just show every VAC offline: warn loudly.
  const placeholders = offices.filter((o) => /^192\.0\.2\./.test(o.host || ''));
  if (!mock && placeholders.length) {
    console.warn(`WARNING: ${placeholders.length} of ${offices.length} VACs still use placeholder addresses (192.0.2.x). ` +
      'Set OFFICES_FILE to the private list with the real tunnel endpoints.');
  }
  return offices;
}

module.exports = {
  // MOCK=0 switches to real TCP checks. Only do that once network access is approved.
  mock,
  intervalMs: Number(process.env.INTERVAL_MS || 5 * 60 * 1000), // 5 minutes
  timeoutMs: Number(process.env.TIMEOUT_MS || 5000),
  failThreshold: Number(process.env.FAIL_THRESHOLD || 3),       // 3 fails in a row = DOWN
  concurrency: Number(process.env.CONCURRENCY || 20),
  retentionDays: Number(process.env.RETENTION_DAYS || 7),
  port: Number(process.env.PORT || 3000),
  alertWebhook: process.env.ALERT_WEBHOOK || '',                 // e.g. Teams/Slack incoming webhook
  historyFile: process.env.DATA_DIR
    ? path.join(path.resolve(process.env.DATA_DIR), 'history.jsonl')
    : path.join(root, 'data', 'history.jsonl'),
  officesFile,
  offices: loadOffices(officesFile),
};
