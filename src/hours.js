// Opening-hours support, currently UNUSED: no VAC in config/offices.json has "hours", so every VAC
// counts as open and is simply online or offline. To use it later, add to a VAC:
//   "timezone": "Asia/Kolkata", "hours": { "days": [1,2,3,4,5], "open": 9, "close": 16 }
// and closed VACs will show as CLOSED instead of raising alerts.
const DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function isOpen(office, date = new Date()) {
  if (!office.hours) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: office.timezone, weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(date);
  const weekday = DAY[parts.find((p) => p.type === 'weekday').value];
  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const { days, open, close } = office.hours;
  return days.includes(weekday) && hour >= open && hour < close;
}

module.exports = { isOpen };
