import { DEFAULT_ALERT_THRESHOLDS } from './budgets';
import type { LocalDate } from './dates';
import { parseMoneyInput, type CurrencyCode } from './money';
import type { BudgetInput } from './schemas';
import { amountToInput } from './transactionForm';
import type { BudgetPeriod, BudgetWithCategories } from './types';

export const ALERT_THRESHOLD_OPTIONS = [50, 80, 90, 100] as const;

export interface BudgetFormState {
  name: string;
  amount: string;
  period: BudgetPeriod;
  startOn: LocalDate;
  endOn: LocalDate | null;
  rollover: boolean;
  categoryIds: string[];
  alertThresholds: number[];
}

export type BudgetFormField = 'name' | 'amount' | 'endOn' | 'categoryIds';
export type BudgetFormErrorCode =
  | 'required'
  | 'must_be_positive'
  | 'end_before_start'
  | 'invalid'
  | 'too_many_decimals'
  | 'too_large';
export type BudgetFormErrors = Partial<Record<BudgetFormField, BudgetFormErrorCode>>;

export function emptyBudgetForm(startOn: LocalDate): BudgetFormState {
  return {
    name: '',
    amount: '',
    period: 'monthly',
    startOn,
    endOn: null,
    rollover: false,
    categoryIds: [],
    alertThresholds: [...DEFAULT_ALERT_THRESHOLDS],
  };
}

export function budgetFormFromBudget(budget: BudgetWithCategories): BudgetFormState {
  return {
    name: budget.name,
    amount: amountToInput(budget.amountMinor, budget.currency),
    period: budget.period,
    startOn: budget.startOn,
    endOn: budget.endOn,
    rollover: budget.rollover,
    categoryIds: [...budget.categoryIds],
    alertThresholds: [...budget.alertThresholds],
  };
}

export function buildBudgetInput(
  state: BudgetFormState,
  currency: CurrencyCode,
): { ok: true; input: BudgetInput } | { ok: false; errors: BudgetFormErrors } {
  const errors: BudgetFormErrors = {};
  if (state.name.trim() === '') errors.name = 'required';
  if (state.categoryIds.length === 0) errors.categoryIds = 'required';

  const parsed = parseMoneyInput(state.amount, currency);
  let amountMinor = 0;
  if (!parsed.ok) errors.amount = parsed.error === 'empty' ? 'required' : parsed.error;
  else if (parsed.money.amountMinor <= 0) errors.amount = 'must_be_positive';
  else amountMinor = parsed.money.amountMinor;

  const custom = state.period === 'custom';
  if (custom && !state.endOn) errors.endOn = 'required';
  else if (custom && state.endOn && state.endOn < state.startOn) errors.endOn = 'end_before_start';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      name: state.name.trim(),
      period: state.period,
      startOn: state.startOn,
      endOn: custom ? state.endOn : null,
      amountMinor,
      currency,
      rollover: custom ? false : state.rollover,
      alertThresholds: state.alertThresholds,
      categoryIds: state.categoryIds,
    },
  };
}
