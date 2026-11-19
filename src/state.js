// Keeps the live status of every target (offices + hops) and a rolling history of checks.
// Status rules:
//   UP       last check passed
//   WARN     1 to (threshold - 1) failures in a row (could be a blip)
//   DOWN     threshold failures in a row -> alert
//   CLOSED   office outside working hours (still checked, but not alerted)
//   UNKNOWN  not checked yet
const fs = require('fs');
const config = require('./config');

const live = new Map(); // id -> { status, consecutiveFails, lastSeen, lastChange, lastError, latencyMs }
let history = [];       // { t, id, ok }

function load() {
  fs.mkdirSync(require('path').dirname(config.historyFile), { recursive: true });
  if (!fs.existsSync(config.historyFile)) return;
  const cutoff = Date.now() - config.retentionDays * 864e5;
  history = fs.readFileSync(config.historyFile, 'utf8')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .filter((h) => h.t >= cutoff);
}

function record(id, result, { open = true } = {}) {
  const now = Date.now();
  const prev = live.get(id) || { status: 'UNKNOWN', consecutiveFails: 0, lastSeen: null, lastChange: now };
  const consecutiveFails = result.ok ? 0 : prev.consecutiveFails + 1;

  let status;
  if (!open) status = 'CLOSED';
  else if (result.ok) status = 'UP';
  else if (consecutiveFails >= config.failThreshold) status = 'DOWN';
  else status = 'WARN';

  const next = {
    status,
    consecutiveFails,
    lastSeen: result.ok ? now : prev.lastSeen,
    lastChange: status !== prev.status ? now : prev.lastChange,
    lastError: result.error,
    latencyMs: result.latencyMs,
  };
  live.set(id, next);

  const entry = { t: now, id, ok: result.ok, open };
  history.push(entry);
  fs.appendFileSync(config.historyFile, JSON.stringify(entry) + '\n');

  return { prev: prev.status, next: status };
}

function prune() {
  const cutoff = Date.now() - config.retentionDays * 864e5;
  history = history.filter((h) => h.t >= cutoff);
  fs.writeFileSync(config.historyFile, history.map((h) => JSON.stringify(h)).join('\n') + '\n');
}

// Test menu helpers: wipe everything, or replace the history (e.g. with seeded mock data).
function reset(entries = []) {
  live.clear();
  history = entries;
  fs.writeFileSync(config.historyFile, entries.map((h) => JSON.stringify(h)).join('\n') + (entries.length ? '\n' : ''));
}

const getLive = (id) => live.get(id) || { status: 'UNKNOWN' };
const getHistory = (sinceMs) => history.filter((h) => h.t >= sinceMs);

module.exports = { load, record, prune, reset, getLive, getHistory };
