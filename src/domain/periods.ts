import {
  addDays,
  addMonths,
  daysInRange,
  monthKey,
  monthRange,
  startOfWeek,
  type DateRange,
  type LocalDate,
} from './dates';

export const PERIOD_PRESETS = ['week', 'month', '3m', '6m', 'year', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface Period {
  preset: PeriodPreset;
  range: DateRange;
}

function firstOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

function monthsEndingAt(anchor: LocalDate, count: number): DateRange {
  return {
    start: addMonths(firstOfMonth(anchor), -(count - 1)),
    end: monthRange(anchor).end,
  };
}

/** The period of `preset` that contains `anchor` (usually today). */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, anchor: LocalDate): DateRange {
  switch (preset) {
    case 'week': {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6) };
    }
    case 'month':
      return monthRange(anchor);
    case '3m':
      return monthsEndingAt(anchor, 3);
    case '6m':
      return monthsEndingAt(anchor, 6);
    case 'year': {
      const year = anchor.slice(0, 4);
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
  }
}

const PRESET_MONTHS: Partial<Record<PeriodPreset, number>> = {
  month: 1,
  '3m': 3,
  '6m': 6,
  year: 12,
};

/** The next (`direction = 1`) or previous (`-1`) period of the same kind. */
export function shiftPeriod(period: Period, direction: 1 | -1): Period {
  const { preset, range } = period;
  if (preset === 'week') {
    return { preset, range: presetRange('week', addDays(range.start, 7 * direction)) };
  }
  const months = PRESET_MONTHS[preset];
  if (months !== undefined) {
    const anchor = addMonths(firstOfMonth(range.end), months * direction);
    return { preset, range: presetRange(preset as Exclude<PeriodPreset, 'custom'>, anchor) };
  }
  const length = daysInRange(range);
  return {
    preset,
    range: {
      start: addDays(range.start, length * direction),
      end: addDays(range.end, length * direction),
    },
  };
}

function isWholeMonths(range: DateRange): boolean {
  return range.start === firstOfMonth(range.start) && range.end === monthRange(range.end).end;
}

function monthsSpanned(range: DateRange): number {
  const [ys, ms] = range.start.split('-').map(Number) as [number, number];
  const [ye, me] = range.end.split('-').map(Number) as [number, number];
  return (ye - ys) * 12 + (me - ms) + 1;
}

/**
 * The equally long period immediately before `range`, for "vs. previous period"
 * comparisons. Whole-month ranges compare against whole months (March vs. February,
 * not the 31 days before March 1).
 */
export function previousRange(range: DateRange): DateRange {
  const end = addDays(range.start, -1);
  if (isWholeMonths(range)) {
    return { start: addMonths(firstOfMonth(end), -(monthsSpanned(range) - 1)), end };
  }
  return { start: addDays(range.start, -daysInRange(range)), end };
}

export type Bucket = 'day' | 'month';

/** Daily buckets for up to a month, monthly buckets beyond (keeps charts ≤ ~31 points). */
export function bucketFor(range: DateRange): Bucket {
  return daysInRange(range) <= 31 ? 'day' : 'month';
}

export function bucketKeyOf(date: LocalDate, bucket: Bucket): string {
  return bucket === 'day' ? date : monthKey(date);
}

/** Every bucket key in the range, in order, so charts show empty days/months too. */
export function bucketKeys(range: DateRange, bucket: Bucket): string[] {
  const keys: string[] = [];
  if (bucket === 'day') {
    for (let date = range.start; date <= range.end; date = addDays(date, 1)) keys.push(date);
    return keys;
  }
  for (let date = firstOfMonth(range.start); date <= range.end; date = addMonths(date, 1)) {
    keys.push(monthKey(date));
  }
  return keys;
}
