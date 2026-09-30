import { TZDate } from '@date-fns/tz';

/** A calendar date in the user's timezone, formatted YYYY-MM-DD. */
export type LocalDate = string;

export const DEFAULT_TIMEZONE = 'Asia/Karachi';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): value is LocalDate {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The calendar date of `instant` as seen in `timeZone`. */
export function toLocalDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): LocalDate {
  const zoned = new TZDate(instant.getTime(), timeZone);
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, '0');
  const d = String(zoned.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** First and last calendar day of the month containing `date`. */
export function monthRange(date: LocalDate): { start: LocalDate; end: LocalDate } {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
}
