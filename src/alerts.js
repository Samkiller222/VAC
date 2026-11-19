// Sends an alert when a target goes DOWN or comes back UP.
// Placeholder: logs to the console and, if ALERT_WEBHOOK is set, posts a simple JSON message
// (works with Teams/Slack-style incoming webhooks). Swap in email or another channel as needed.
const config = require('./config');

async function notify(target, change) {
  const recovered = change.prev === 'DOWN' && change.next === 'UP';
  const wentDown = change.next === 'DOWN' && change.prev !== 'DOWN';
  if (!recovered && !wentDown) return;

  const text = wentDown
    ? `DOWN: ${target.label} has failed ${config.failThreshold} checks in a row.`
    : `RECOVERED: ${target.label} is reachable again.`;
  console.log(`[alert ${new Date().toISOString()}] ${text}`);

  if (!config.alertWebhook) return;
  try {
    await fetch(config.alertWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('Alert webhook failed:', err.message);
  }
}

module.exports = { notify };
