// Fills data/history.jsonl with 24 hours of simulated checks so the heatmap looks full in a demo.
// Mock data only. Run: npm run seed  (then npm run demo)
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const { generateHistory } = require('./src/seed');

const entries = generateHistory(24);
fs.mkdirSync(path.dirname(config.historyFile), { recursive: true });
fs.writeFileSync(config.historyFile, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
console.log(`Wrote ${entries.length} simulated checks to ${config.historyFile}`);
