import { dayOfMonth, type LocalDate } from '@/domain/dates';

export interface SpendingComparison {
  /** Cumulative spend per day of the current month; null after today. */
  current: (number | null)[];
  /** Cumulative spend per day of the previous month, cut to the current month's length. */
  previous: number[];
  /** Spend so far this month vs. the same point last month. */
  currentToDateMinor: number;
  previousToDateMinor: number;
}

function cumulative(values: readonly number[]): number[] {
  let running = 0;
  return values.map((value) => (running += value));
}

/**
 * `currentDaily` / `previousDaily` hold one expense total per calendar day of each month
 * (as returned by a daily cashflow series), oldest first.
 */
export function compareMonthlySpending(
  currentDaily: readonly number[],
  previousDaily: readonly number[],
  today: LocalDate,
): SpendingComparison {
  const todayIndex = dayOfMonth(today) - 1;
  const current = cumulative(currentDaily);
  const previousFull = cumulative(previousDaily);
  const previous = currentDaily.map(
    (_, i) => previousFull[Math.min(i, previousFull.length - 1)] ?? 0,
  );
  return {
    current: current.map((value, i) => (i <= todayIndex ? value : null)),
    previous,
    currentToDateMinor: current[Math.min(todayIndex, current.length - 1)] ?? 0,
    previousToDateMinor: previous[Math.min(todayIndex, previous.length - 1)] ?? 0,
  };
}
