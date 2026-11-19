// Shared test settings, changed from the hidden test menu (mock mode only).
//   overrides:   VAC id -> 'up' | 'down'   (anything not listed behaves normally)
const config = require('./config');

const overrides = new Map();
for (const id of (process.env.MOCK_DOWN || '').split(',').filter(Boolean)) overrides.set(id, 'down');

module.exports = {
  // The menu only works in mock mode, and can be switched off with TEST_MENU=0.
  enabled: config.mock && process.env.TEST_MENU !== '0',
  overrides,
};
