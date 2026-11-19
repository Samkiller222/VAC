// One check = "can we open a TCP connection to host:port within the timeout?"
// TCP is used instead of ping because ICMP is often blocked by firewalls.
const net = require('net');

function tcpCheck(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    const finish = (ok, error) => {
      socket.destroy();
      resolve({ ok, latencyMs: ok ? Date.now() - started : null, error: error || null });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (err) => finish(false, err.code || err.message));
    socket.connect(port, host);
  });
}

// --- Mock mode: simulates outages so the dashboard can be demoed with no network access ---
const mockOutages = new Map(); // target id -> cycles remaining down

// Forced results from the test menu (or MOCK_DOWN=del,ktm at start-up).
const testControls = require('./testControls');

function mockCheck(target) {
  const forced = testControls.overrides.get(target.id);
  if (forced === 'down') return Promise.resolve({ ok: false, latencyMs: null, error: 'forced mock outage' });
  if (forced === 'up') return Promise.resolve({ ok: true, latencyMs: 50, error: null });
  let remaining = mockOutages.get(target.id) || 0;
  if (remaining === 0 && Math.random() < 0.003) remaining = 3 + Math.floor(Math.random() * 6); // start an outage
  if (remaining > 0) {
    mockOutages.set(target.id, remaining - 1);
    return Promise.resolve({ ok: false, latencyMs: null, error: 'mock outage' });
  }
  const blip = Math.random() < 0.005; // occasional single dropped check
  return Promise.resolve(blip
    ? { ok: false, latencyMs: null, error: 'mock blip' }
    : { ok: true, latencyMs: 40 + Math.floor(Math.random() * 200), error: null });
}

module.exports = { tcpCheck, mockCheck };
