import { config } from '../config.js';

/** Today's date as YYYY-MM-DD in the app's time zone. */
export function today(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** Adds days to a YYYY-MM-DD date. */
export function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from today until a YYYY-MM-DD date (can be negative). */
export function daysUntil(ymd) {
  const a = new Date(`${today()}T12:00:00Z`);
  const b = new Date(`${ymd}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export const isYmd = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const isOverdue = (enrolment) => !enrolment.completedAt && !!enrolment.dueDate && enrolment.dueDate < today();

/** Timestamp formatted for CSV exports: 2026-10-13 14:05 in the app's time zone. */
export function csvDateTime(d) {
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(d));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
