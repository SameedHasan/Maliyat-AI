import type { LocalDate } from './dates';
import {
  abs,
  money,
  parseMoneyInput,
  subtract,
  sum,
  toDecimalString,
  type CurrencyCode,
  type Money,
  type ParseMoneyError,
} from './money';
import type { TransactionInput } from './schemas';
import type { TransactionWithEntries } from './types';

/** Kinds a user creates through the transaction form. */
export const FORM_KINDS = ['expense', 'income', 'transfer', 'refund'] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export interface SplitLine {
  /** Stable key for list rendering; not persisted. */
  key: string;
  categoryId: string | null;
  amount: string;
}

export interface TransactionFormState {
  kind: FormKind;
  /** Total as typed by the user, always entered as a positive number. */
  amount: string;
  /** Expense/income/refund account, or the "from" account of a transfer. */
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  split: boolean;
  splits: SplitLine[];
  /** Optional transfer fee, charged to the "from" account. */
  fee: string;
  feeCategoryId: string | null;
  occurredOn: LocalDate;
  payee: string;
  notes: string;
  refundOfId: string | null;
}

export type FormErrorCode =
  | 'required'
  | 'must_be_positive'
  | 'same_account'
  | 'split_mismatch'
  | 'split_too_few'
  | ParseMoneyError;

export type FormField =
  | 'amount'
  | 'accountId'
  | 'toAccountId'
  | 'categoryId'
  | 'fee'
  | 'feeCategoryId'
  | 'splits'
  | `splits.${number}.amount`
  | `splits.${number}.categoryId`;

export type FormErrors = Partial<Record<FormField, FormErrorCode>>;

export type BuildResult = { ok: true; input: TransactionInput } | { ok: false; errors: FormErrors };

function parsePositive(
  text: string,
  currency: CurrencyCode,
): { ok: true; value: Money } | { ok: false; error: FormErrorCode } {
  const parsed = parseMoneyInput(text, currency);
  if (!parsed.ok) return { ok: false, error: parsed.error === 'empty' ? 'required' : parsed.error };
  if (parsed.money.amountMinor <= 0) return { ok: false, error: 'must_be_positive' };
  return { ok: true, value: parsed.money };
}

/** Total minus the split amounts entered so far (invalid lines count as zero). */
export function splitRemaining(state: TransactionFormState, currency: CurrencyCode): Money | null {
  const total = parseMoneyInput(state.amount, currency);
  if (!total.ok) return null;
  const allocated = state.splits.map((line) => {
    const parsed = parseMoneyInput(line.amount, currency);
    return parsed.ok ? parsed.money : money(0, currency);
  });
  return subtract(total.money, sum(allocated, currency));
}

/**
 * Turns form fields into a ledger input. Field-level checks happen here so the form
 * can point at the exact problem; ledger invariants are enforced again by the
 * repository (`validateTransaction`).
 */
export function buildTransactionInput(
  state: TransactionFormState,
  currency: CurrencyCode,
): BuildResult {
  const errors: FormErrors = {};
  const total = parsePositive(state.amount, currency);
  if (!total.ok) errors.amount = total.error;
  if (!state.accountId) errors.accountId = 'required';

  const base = {
    kind: state.kind,
    occurredOn: state.occurredOn,
    payee: state.payee,
    notes: state.notes,
    source: 'manual' as const,
    refundOfId: state.kind === 'refund' ? state.refundOfId : null,
  };

  if (state.kind === 'transfer') {
    if (!state.toAccountId) errors.toAccountId = 'required';
    else if (state.toAccountId === state.accountId) errors.toAccountId = 'same_account';

    let fee: Money | null = null;
    if (state.fee.trim() !== '') {
      const parsedFee = parsePositive(state.fee, currency);
      if (!parsedFee.ok) errors.fee = parsedFee.error;
      else fee = parsedFee.value;
      if (!state.feeCategoryId) errors.feeCategoryId = 'required';
    }

    if (Object.keys(errors).length > 0 || !total.ok) return { ok: false, errors };
    const from = state.accountId!;
    const entries: TransactionInput['entries'] = [
      { accountId: from, categoryId: null, amountMinor: -total.value.amountMinor },
      { accountId: state.toAccountId!, categoryId: null, amountMinor: total.value.amountMinor },
    ];
    if (fee) {
      entries.push({
        accountId: from,
        categoryId: state.feeCategoryId,
        amountMinor: -fee.amountMinor,
      });
    }
    return { ok: true, input: { ...base, entries } };
  }

  const sign = state.kind === 'expense' ? -1 : 1;
  let lines: { categoryId: string; amount: Money }[] = [];

  if (state.split) {
    if (state.splits.length < 2) errors.splits = 'split_too_few';
    state.splits.forEach((line, index) => {
      if (!line.categoryId) errors[`splits.${index}.categoryId`] = 'required';
      const parsed = parsePositive(line.amount, currency);
      if (!parsed.ok) errors[`splits.${index}.amount`] = parsed.error;
      else if (line.categoryId) lines.push({ categoryId: line.categoryId, amount: parsed.value });
    });
    if (total.ok && Object.keys(errors).length === 0) {
      const remaining = subtract(
        total.value,
        sum(
          lines.map((l) => l.amount),
          currency,
        ),
      );
      if (remaining.amountMinor !== 0) errors.splits = 'split_mismatch';
    }
  } else if (!state.categoryId) {
    errors.categoryId = 'required';
  } else if (total.ok) {
    lines = [{ categoryId: state.categoryId, amount: total.value }];
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      ...base,
      entries: lines.map((line) => ({
        accountId: state.accountId!,
        categoryId: line.categoryId,
        amountMinor: sign * line.amount.amountMinor,
      })),
    },
  };
}

/** Plain editable text for an amount: 2500 → "25", 250050 → "2500.50". */
export function amountToInput(amountMinor: number, currency: CurrencyCode): string {
  return toDecimalString(abs(money(amountMinor, currency))).replace(/\.0+$/, '');
}

export function emptyFormState(
  kind: FormKind,
  occurredOn: LocalDate,
  defaults: { accountId?: string | null } = {},
): TransactionFormState {
  return {
    kind,
    amount: '',
    accountId: defaults.accountId ?? null,
    toAccountId: null,
    categoryId: null,
    split: false,
    splits: [],
    fee: '',
    feeCategoryId: null,
    occurredOn,
    payee: '',
    notes: '',
    refundOfId: null,
  };
}

/**
 * Form state for an existing transaction. `edit` keeps everything; `duplicate` moves it
 * to today; `refund` prepares a refund of an expense (same account/category/payee).
 * Returns null for kinds the form can't edit (adjustments, opening balances).
 */
export function formStateFromTransaction(
  tx: TransactionWithEntries,
  mode: 'edit' | 'duplicate' | 'refund',
  today: LocalDate,
  newKey: () => string,
): TransactionFormState | null {
  const currency = (tx.entries[0]?.currency ?? 'PKR') as CurrencyCode;
  const text = (minor: number) => amountToInput(minor, currency);
  const occurredOn = mode === 'edit' ? tx.occurredOn : today;
  const common = {
    occurredOn,
    payee: tx.payee ?? '',
    notes: mode === 'refund' ? '' : (tx.notes ?? ''),
    fee: '',
    feeCategoryId: null,
    toAccountId: null,
    refundOfId: mode === 'edit' ? tx.refundOfId : null,
  };

  if (tx.kind === 'transfer') {
    if (mode === 'refund') return null;
    const legs = tx.entries.filter((e) => e.categoryId === null);
    const from = legs.find((e) => e.amountMinor < 0);
    const to = legs.find((e) => e.amountMinor > 0);
    const fee = tx.entries.find((e) => e.categoryId !== null);
    return {
      ...common,
      kind: 'transfer',
      amount: to ? text(to.amountMinor) : '',
      accountId: from?.accountId ?? null,
      toAccountId: to?.accountId ?? null,
      categoryId: null,
      split: false,
      splits: [],
      fee: fee ? text(fee.amountMinor) : '',
      feeCategoryId: fee?.categoryId ?? null,
    };
  }

  if (tx.kind !== 'expense' && tx.kind !== 'income' && tx.kind !== 'refund') return null;
  if (mode === 'refund' && tx.kind !== 'expense') return null;

  const totalMinor = sum(
    tx.entries.map((e) => abs(money(e.amountMinor, currency))),
    currency,
  ).amountMinor;
  const isSplit = tx.entries.length > 1 && mode !== 'refund';
  return {
    ...common,
    kind: mode === 'refund' ? 'refund' : tx.kind,
    amount: text(totalMinor),
    accountId: tx.entries[0]?.accountId ?? null,
    categoryId: isSplit ? null : (tx.entries[0]?.categoryId ?? null),
    split: isSplit,
    splits: isSplit
      ? tx.entries.map((e) => ({
          key: newKey(),
          categoryId: e.categoryId,
          amount: text(e.amountMinor),
        }))
      : [],
    refundOfId: mode === 'refund' ? tx.id : common.refundOfId,
  };
}
