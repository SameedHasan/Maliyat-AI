/** (income − expense) / income as a whole percent; null when there was no income. */
export function savingsRate(incomeMinor: number, expenseMinor: number): number | null {
  if (incomeMinor <= 0) return null;
  return Math.round(((incomeMinor - expenseMinor) * 100) / incomeMinor);
}

/** Whole-percent change from `previous` to `current`; null when there is nothing to compare. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 100) / Math.abs(previous));
}

/** Whole-percent share of `part` in `total`, never NaN. */
export function shareOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part * 100) / total);
}
