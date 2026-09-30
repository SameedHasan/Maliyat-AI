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

/** An inclusive range of calendar dates. */
export interface DateRange {
  start: LocalDate;
  end: LocalDate;
}

const DAY_MS = 86_400_000;

function parts(date: LocalDate): [number, number, number] {
  return date.split('-').map(Number) as [number, number, number];
}

function fromUtc(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parts(date);
  return fromUtc(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Moves by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = parts(date);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))));
}

/** 0 = Monday … 6 = Sunday. */
export function dayOfWeek(date: LocalDate): number {
  const [y, m, d] = parts(date);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Weeks start on Monday. */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -dayOfWeek(date));
}

/** Number of calendar days in the inclusive range. */
export function daysInRange(range: DateRange): number {
  const [ys, ms, ds] = parts(range.start);
  const [ye, me, de] = parts(range.end);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / DAY_MS) + 1;
}

/** "YYYY-MM" */
export function monthKey(date: LocalDate): string {
  return date.slice(0, 7);
}

export function dayOfMonth(date: LocalDate): number {
  return parts(date)[2];
}

/** First and last calendar day of the month containing `date`. */
export function monthRange(date: LocalDate): DateRange {
  const [y, m] = parts(date);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

export function isInRange(date: LocalDate, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** Midnight on `date` in the device's local time, for native date pickers. */
export function localDateToDate(date: LocalDate): Date {
  const [y, m, d] = parts(date);
  return new Date(y, m - 1, d);
}

/** The calendar date a native date picker selected (device-local fields). */
export function dateToLocalDate(value: Date): LocalDate {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
