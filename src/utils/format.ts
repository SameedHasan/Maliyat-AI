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
