// Generates 24 hours of simulated checks (mock data) so the heatmap looks full in a demo.
const config = require('./config');
const { isOpen } = require('./hours');

function generateHistory(hours = 24) {
  const now = Date.now();
  const step = config.intervalMs > 60000 ? config.intervalMs : 5 * 60000;
  const entries = [];
  for (const t of config.offices) {
    let down = 0;
    for (let at = now - hours * 36e5; at < now; at += step) {
      if (down === 0 && Math.random() < 0.004) down = 6 + Math.floor(Math.random() * 18); // 30 min to 2 h outage
      const ok = down > 0 ? false : Math.random() > 0.02;
      if (down > 0) down--;
      entries.push({ t: at, id: t.id, ok, open: isOpen(t, new Date(at)) });
    }
  }
  return entries.sort((a, b) => a.t - b.t);
}

module.exports = { generateHistory };
