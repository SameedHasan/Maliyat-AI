import { format, isSameYear, parseISO } from 'date-fns';

import type { LocalDate } from '@/domain/dates';

/** "30 Sep", or "30 Sep 2025" outside the current year. */
export function formatShortDate(date: LocalDate, today: LocalDate): string {
  const value = parseISO(date);
  return format(value, isSameYear(value, parseISO(today)) ? 'd MMM' : 'd MMM yyyy');
}

export function formatMonth(date: LocalDate): string {
  return format(parseISO(date), 'MMMM yyyy');
}

/** "Sep 26" */
export function formatMonthShort(date: LocalDate): string {
  return format(parseISO(date), 'MMM yy');
}

/** "Sep" */
export function formatMonthAbbrev(date: LocalDate): string {
  return format(parseISO(date), 'MMM');
}

/** "Wednesday, 30 September 2026" */
export function formatLongDate(date: LocalDate): string {
  return format(parseISO(date), 'EEEE, d MMMM yyyy');
}

/** "30 Sep 2026" */
export function formatDate(date: LocalDate): string {
  return format(parseISO(date), 'd MMM yyyy');
}

/** "1–30 Sep 2026", "1 Jul – 30 Sep 2026", "1 Dec 2025 – 31 Jan 2026" */
export function formatRange(start: LocalDate, end: LocalDate): string {
  const s = parseISO(start);
  const e = parseISO(end);
  if (start === end) return format(s, 'd MMM yyyy');
  if (!isSameYear(s, e)) return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`;
  if (format(s, 'MM') === format(e, 'MM')) return `${format(s, 'd')}–${format(e, 'd MMM yyyy')}`;
  return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`;
}
