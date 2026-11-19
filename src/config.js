// Loads settings from environment variables and the JSON files in /config.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, 'config', file), 'utf8'));

module.exports = {
  // MOCK=0 switches to real TCP checks. Only do that once network access is approved.
  mock: process.env.MOCK !== '0',
  intervalMs: Number(process.env.INTERVAL_MS || 5 * 60 * 1000), // 5 minutes
  timeoutMs: Number(process.env.TIMEOUT_MS || 5000),
  failThreshold: Number(process.env.FAIL_THRESHOLD || 3),       // 3 fails in a row = DOWN
  concurrency: Number(process.env.CONCURRENCY || 20),
  retentionDays: Number(process.env.RETENTION_DAYS || 7),
  port: Number(process.env.PORT || 3000),
  alertWebhook: process.env.ALERT_WEBHOOK || '',                 // e.g. Teams/Slack incoming webhook
  historyFile: path.join(root, 'data', 'history.jsonl'),
  offices: readJson('offices.json').offices,
};
