// Runs one check cycle over every VAC's link to Toppan.
const config = require('./config');
const { tcpCheck, mockCheck } = require('./checker');
const { isOpen } = require('./hours');
const state = require('./state');
const alerts = require('./alerts');
const testControls = require('./testControls');

const targets = config.offices.map((o) => ({ ...o, label: `${o.name} (${o.country}) -> Toppan` }));

// Runs async jobs with a cap on how many run at once (100+ VACs).
async function runLimited(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

async function runCycle() {
  const started = Date.now();
  await runLimited(targets, config.concurrency, async (target) => {
    const result = config.mock
      ? await mockCheck(target)
      : await tcpCheck(target.host, target.port, config.timeoutMs);
    const open = testControls.ignoreHours || isOpen(target);
    const change = state.record(target.id, result, { open });
    if (open) await alerts.notify(target, change);
  });
  console.log(`Cycle done: ${targets.length} VAC links in ${Date.now() - started} ms${config.mock ? ' (mock)' : ''}`);
}

// Plain-language hint: many VACs down at once points to a shared problem, one or two to a local one.
function diagnose() {
  const open = config.offices.filter((o) => state.getLive(o.id).status !== 'CLOSED');
  const down = open.filter((o) => state.getLive(o.id).status === 'DOWN');
  if (!down.length) return [];
  if (open.length >= 3 && down.length / open.length >= 0.5) {
    return [`${down.length} of ${open.length} open VACs are down at once: likely a shared problem on the path to Toppan, not the VACs themselves`];
  }
  return down.map((o) => `${o.name}: link to Toppan down (other VACs are fine, so likely local to this VAC)`);
}

module.exports = { targets, runCycle, diagnose };
