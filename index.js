// Entry point: starts the dashboard server and runs a check cycle every INTERVAL_MS.
const config = require('./src/config');
const state = require('./src/state');
const { runCycle } = require('./src/monitor');
const server = require('./src/server');

state.load();
server.start();

console.log(`Mode: ${config.mock ? 'MOCK (simulated results)' : 'LIVE (real TCP checks)'} | every ${config.intervalMs / 1000}s | DOWN after ${config.failThreshold} fails`);
console.log(`VAC list: ${config.offices.length} VACs from ${config.officesFile}`);

const tick = () => runCycle().catch((err) => console.error('Cycle failed:', err));
tick();
setInterval(tick, config.intervalMs);
setInterval(() => state.prune(), 60 * 60 * 1000); // trim old history hourly
