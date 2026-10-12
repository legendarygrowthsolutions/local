/**
 * Time helpers pinned to India Standard Time (UTC+05:30, no DST).
 * Dates are passed around as "YYYY-MM-DD" strings plus minutes-from-midnight,
 * and serialised as ISO strings with an explicit +05:30 offset.
 */
export const IST_OFFSET_MINS = 330;

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock parts in IST for an instant. */
export function istParts(date: Date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINS * 60_000);
  return {
    ymd: shifted.toISOString().slice(0, 10),
    mins: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

export function todayIST(now: Date = new Date()) {
  return istParts(now).ymd;
}

export function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string) {
  return Math.round(
    (new Date(toYmd + "T00:00:00Z").getTime() - new Date(fromYmd + "T00:00:00Z").getTime()) / 86_400_000,
  );
}

export function weekdayOf(ymd: string) {
  return new Date(ymd + "T00:00:00Z").getUTCDay();
}

export function toISO(ymd: string, mins: number) {
  const dayShift = Math.floor(mins / 1440);
  const m = ((mins % 1440) + 1440) % 1440;
  return `${addDays(ymd, dayShift)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00+05:30`;
}

/** Parse an ISO string into IST date + minutes. */
export function fromISO(iso: string) {
  return istParts(new Date(iso));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMins(mins: number, opts: { compact?: boolean } = {}) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (opts.compact && mm === 0) return `${h12} ${suffix}`;
  return `${h12}:${pad(mm)} ${suffix}`;
}

export function formatDay(ymd: string, now: Date = new Date()) {
  const today = todayIST(now);
  const diff = daysBetween(today, ymd);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const d = new Date(ymd + "T00:00:00Z");
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatDate(ymd: string, withYear = false) {
  const d = new Date(ymd + "T00:00:00Z");
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? " " + d.getUTCFullYear() : ""}`;
}

export function dateStripParts(ymd: string) {
  const d = new Date(ymd + "T00:00:00Z");
  return { weekday: WEEKDAYS[d.getUTCDay()], day: String(d.getUTCDate()), month: MONTHS[d.getUTCMonth()] };
}

/** Poster chip: one day → "SAT / 18"; a span → "17–26 / OCT" (or "28 OCT / –2 NOV" across months). */
export function dateBadge(firstYmd: string, lastYmd = firstYmd) {
  const a = dateStripParts(firstYmd);
  if (firstYmd === lastYmd) return { top: a.weekday.toUpperCase(), bottom: a.day };
  const b = dateStripParts(lastYmd);
  if (a.month === b.month) return { top: `${a.day}–${b.day}`, bottom: a.month.toUpperCase() };
  return { top: `${a.day} ${a.month.toUpperCase()}`, bottom: `–${b.day} ${b.month.toUpperCase()}` };
}

/** "Sat, 18 Oct · 8 PM" */
export function formatWhen(iso: string, now: Date = new Date()) {
  const { ymd, mins } = fromISO(iso);
  return `${formatDay(ymd, now)} · ${formatMins(mins, { compact: true })}`;
}

export function formatRange(startIso: string, endIso: string) {
  const a = fromISO(startIso);
  const b = fromISO(endIso);
  return `${formatMins(a.mins, { compact: true })} – ${formatMins(b.mins, { compact: true })}`;
}

export function isWeekend(ymd: string) {
  const wd = weekdayOf(ymd);
  return wd === 0 || wd === 6;
}

/** "Sat, 24 Oct · 3 PM – 11 PM", or "Sat, 24 Oct – Sun, 25 Oct" when it spans days. */
export function formatSpan(startIso: string, endIso: string) {
  const a = fromISO(startIso);
  const b = fromISO(endIso);
  if (a.ymd === b.ymd) return `${formatDate(a.ymd)} · ${formatRange(startIso, endIso)}`;
  return `${formatDate(a.ymd)} – ${formatDate(b.ymd)}`;
}
