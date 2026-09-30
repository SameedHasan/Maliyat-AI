import { addDays, monthRange, startOfWeek, type DateRange, type LocalDate } from './dates';
import type { BudgetPeriod } from './types';

export interface BudgetRules {
  period: BudgetPeriod;
  startOn: LocalDate;
  endOn: LocalDate | null;
  amountMinor: number;
  rollover: boolean;
  alertThresholds: readonly number[];
}

export const DEFAULT_ALERT_THRESHOLDS = [80, 100] as const;

function periodContaining(period: BudgetPeriod, date: LocalDate): DateRange {
  if (period === 'weekly') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 6) };
  }
  return monthRange(date);
}

/**
 * The budget period containing `date`, or null if the budget has not started yet
 * (or a custom budget has ended).
 */
export function budgetPeriodFor(budget: BudgetRules, date: LocalDate): DateRange | null {
  if (budget.period === 'custom') {
    if (!budget.endOn || date < budget.startOn || date > budget.endOn) return null;
    return { start: budget.startOn, end: budget.endOn };
  }
  const first = periodContaining(budget.period, budget.startOn);
  if (date < first.start) return null;
  return periodContaining(budget.period, date);
}

/**
 * Periods whose results feed the current status: just the current one, or — with
 * rollover — every period from the budget's first up to the current one.
 * Custom budgets never roll over.
 */
export function budgetPeriodsThrough(budget: BudgetRules, date: LocalDate): DateRange[] {
  const current = budgetPeriodFor(budget, date);
  if (!current) return [];
  if (!budget.rollover || budget.period === 'custom') return [current];

  const periods: DateRange[] = [];
  let range = periodContaining(budget.period, budget.startOn);
  while (range.start <= current.start) {
    periods.push(range);
    range = periodContaining(budget.period, addDays(range.end, 1));
  }
  return periods;
}

/** Selecting a parent category includes its subcategories (plan §9.8). */
export function expandCategoryScope(
  selectedIds: readonly string[],
  categories: readonly { id: string; parentId: string | null }[],
): string[] {
  const selected = new Set(selectedIds);
  const scope = new Set(selectedIds);
  for (const category of categories) {
    if (category.parentId && selected.has(category.parentId)) scope.add(category.id);
  }
  return [...scope];
}

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  range: DateRange;
  budgetMinor: number;
  /** Unused (positive) or overspent (negative) amount carried from earlier periods. */
  carryOverMinor: number;
  /** Budget plus carry-over: what may be spent this period. */
  availableMinor: number;
  spentMinor: number;
  /** Negative when overspent. */
  remainingMinor: number;
  /** Whole percent of `availableMinor` spent; ≥ 100 when nothing is available and something was spent. */
  percentUsed: number;
  crossedThresholds: number[];
  state: BudgetState;
}

/**
 * `spentByPeriod` must line up with `budgetPeriodsThrough` (oldest first, current last).
 * Spent = expense entries minus refunds in scope; transfers never count.
 */
export function computeBudgetStatus(
  budget: BudgetRules,
  periods: readonly { range: DateRange; spentMinor: number }[],
): BudgetStatus | null {
  const current = periods[periods.length - 1];
  if (!current) return null;

  let carryOverMinor = 0;
  if (budget.rollover) {
    for (const previous of periods.slice(0, -1)) {
      carryOverMinor = budget.amountMinor + carryOverMinor - previous.spentMinor;
    }
  }

  const availableMinor = budget.amountMinor + carryOverMinor;
  const spentMinor = current.spentMinor;
  const remainingMinor = availableMinor - spentMinor;
  const percentUsed =
    availableMinor > 0
      ? Math.floor((Math.max(spentMinor, 0) * 100) / availableMinor)
      : spentMinor > 0
        ? 100
        : 0;

  const crossedThresholds = [...budget.alertThresholds]
    .sort((a, b) => a - b)
    .filter((threshold) => percentUsed >= threshold);
  const state: BudgetState =
    remainingMinor < 0 || (availableMinor <= 0 && spentMinor > 0)
      ? 'over'
      : crossedThresholds.length > 0
        ? 'warning'
        : 'ok';

  return {
    range: current.range,
    budgetMinor: budget.amountMinor,
    carryOverMinor,
    availableMinor,
    spentMinor,
    remainingMinor,
    percentUsed,
    crossedThresholds,
    state,
  };
}
