export function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value) {
  return new Date(`${value}T00:00:00`);
}

export function computeDayNumber(startDateIso, todayIso = toIsoDate()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.floor((parseIsoDate(todayIso) - parseIsoDate(startDateIso)) / dayMs);
  return Math.max(1, diff + 1);
}

export function plannedDays(startIso, stopIso) {
  if (!stopIso) {
    return null;
  }

  return Math.max(1, computeDayNumber(startIso, stopIso));
}

export function formatShortDate(isoDate) {
  return parseIsoDate(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

export function buildTrackerLine(tracker, todayIso = toIsoDate()) {
  const day = computeDayNumber(tracker.startDate, todayIso);
  const total = tracker.stopDate ? plannedDays(tracker.startDate, tracker.stopDate) : null;
  const intervalPart = tracker.dosingInterval ? ` ${tracker.dosingInterval}` : "";
  const dayPart = total ? `Day ${day}/${total}` : `Day ${day}`;

  let suffix = `(started ${formatShortDate(tracker.startDate)})`;
  if (tracker.stopDate) {
    suffix = `(started ${formatShortDate(tracker.startDate)} → stop ${formatShortDate(tracker.stopDate)})`;
  }

  return `${tracker.antibioticName}${intervalPart} — ${dayPart} ${suffix}`;
}

export function getWeekday(isoDate = toIsoDate()) {
  return parseIsoDate(isoDate).getDay();
}

export function uuid() {
  return crypto.randomUUID();
}
