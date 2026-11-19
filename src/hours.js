// Works out whether an office is inside its working hours, in its own time zone,
// so closed offices show grey instead of red.
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
