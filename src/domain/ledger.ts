import { money, sum, type CurrencyCode, type Money } from './money';
import type { CategoryKind, TransactionKind } from './types';

export interface EntryDraft {
  accountId: string;
  categoryId: string | null;
  amountMinor: number;
}

export interface TransactionDraft {
  kind: TransactionKind;
  entries: readonly EntryDraft[];
}

export interface LedgerAccountInfo {
  currency: CurrencyCode;
  isArchived: boolean;
}

export interface LedgerCategoryInfo {
  kind: CategoryKind;
  isArchived: boolean;
}

export interface LedgerContext {
  getAccount(id: string): LedgerAccountInfo | undefined;
  getCategory(id: string): LedgerCategoryInfo | undefined;
  /** Editing existing history on archived accounts/categories is allowed; new records are not. */
  allowArchived?: boolean;
}

export type LedgerIssueCode =
  | 'no_entries'
  | 'entry_count'
  | 'amount_not_integer'
  | 'amount_zero'
  | 'unknown_account'
  | 'archived_account'
  | 'unknown_category'
  | 'archived_category'
  | 'wrong_sign'
  | 'multiple_accounts'
  | 'category_required'
  | 'category_not_allowed'
  | 'wrong_category_kind'
  | 'transfer_legs'
  | 'transfer_same_account'
  | 'transfer_unbalanced'
  | 'transfer_currency_mismatch'
  | 'fee_invalid';

export interface LedgerIssue {
  code: LedgerIssueCode;
  entryIndex?: number;
}

export type LedgerValidation = { ok: true } | { ok: false; issues: LedgerIssue[] };

type Sign = 'negative' | 'positive';

function checkEntriesBasics(
  entries: readonly EntryDraft[],
  ctx: LedgerContext,
  issues: LedgerIssue[],
): void {
  entries.forEach((entry, entryIndex) => {
    if (!Number.isSafeInteger(entry.amountMinor)) {
      issues.push({ code: 'amount_not_integer', entryIndex });
    } else if (entry.amountMinor === 0) {
      issues.push({ code: 'amount_zero', entryIndex });
    }

    const account = ctx.getAccount(entry.accountId);
    if (!account) issues.push({ code: 'unknown_account', entryIndex });
    else if (account.isArchived && !ctx.allowArchived) {
      issues.push({ code: 'archived_account', entryIndex });
    }

    if (entry.categoryId !== null) {
      const category = ctx.getCategory(entry.categoryId);
      if (!category) issues.push({ code: 'unknown_category', entryIndex });
      else if (category.isArchived && !ctx.allowArchived) {
        issues.push({ code: 'archived_category', entryIndex });
      }
    }
  });
}

function checkSign(entry: EntryDraft, entryIndex: number, sign: Sign, issues: LedgerIssue[]) {
  const ok = sign === 'negative' ? entry.amountMinor < 0 : entry.amountMinor > 0;
  if (!ok && entry.amountMinor !== 0) issues.push({ code: 'wrong_sign', entryIndex });
}

function checkCategory(
  entry: EntryDraft,
  entryIndex: number,
  expected: CategoryKind,
  ctx: LedgerContext,
  issues: LedgerIssue[],
) {
  if (entry.categoryId === null) {
    issues.push({ code: 'category_required', entryIndex });
    return;
  }
  const category = ctx.getCategory(entry.categoryId);
  if (category && category.kind !== expected) {
    issues.push({ code: 'wrong_category_kind', entryIndex });
  }
}

function checkSingleAccount(entries: readonly EntryDraft[], issues: LedgerIssue[]) {
  const accounts = new Set(entries.map((e) => e.accountId));
  if (accounts.size > 1) issues.push({ code: 'multiple_accounts' });
}

/** Expense (split = several entries), income, and refund share the same shape. */
function validateCategorised(
  entries: readonly EntryDraft[],
  sign: Sign,
  categoryKind: CategoryKind,
  ctx: LedgerContext,
  issues: LedgerIssue[],
) {
  checkSingleAccount(entries, issues);
  entries.forEach((entry, i) => {
    checkSign(entry, i, sign, issues);
    checkCategory(entry, i, categoryKind, ctx, issues);
  });
}

function validateTransfer(
  entries: readonly EntryDraft[],
  ctx: LedgerContext,
  issues: LedgerIssue[],
) {
  const legs = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.categoryId === null);
  const fees = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.categoryId !== null);

  if (legs.length !== 2) {
    issues.push({ code: 'transfer_legs' });
    return;
  }
  const [a, b] = legs as [(typeof legs)[number], (typeof legs)[number]];
  const source = a.entry.amountMinor < 0 ? a : b;
  const destination = source === a ? b : a;

  if (source.entry.accountId === destination.entry.accountId) {
    issues.push({ code: 'transfer_same_account' });
  }
  if (!(source.entry.amountMinor < 0 && destination.entry.amountMinor > 0)) {
    issues.push({ code: 'wrong_sign', entryIndex: destination.index });
  }

  const sourceAccount = ctx.getAccount(source.entry.accountId);
  const destinationAccount = ctx.getAccount(destination.entry.accountId);
  if (
    sourceAccount &&
    destinationAccount &&
    sourceAccount.currency !== destinationAccount.currency
  ) {
    issues.push({ code: 'transfer_currency_mismatch' });
  } else if (source.entry.amountMinor + destination.entry.amountMinor !== 0) {
    issues.push({ code: 'transfer_unbalanced' });
  }

  if (fees.length > 1) {
    issues.push({ code: 'fee_invalid', entryIndex: fees[1]?.index });
  }
  for (const fee of fees) {
    if (fee.entry.accountId !== source.entry.accountId || fee.entry.amountMinor >= 0) {
      issues.push({ code: 'fee_invalid', entryIndex: fee.index });
    }
    checkCategory(fee.entry, fee.index, 'expense', ctx, issues);
  }
}

function validateUncategorisedSingle(entries: readonly EntryDraft[], issues: LedgerIssue[]) {
  if (entries.length !== 1) {
    issues.push({ code: 'entry_count' });
  }
  entries.forEach((entry, entryIndex) => {
    if (entry.categoryId !== null) issues.push({ code: 'category_not_allowed', entryIndex });
  });
}

/**
 * Enforces the ledger invariants from the implementation plan (§6.2). Runs on the device
 * before every write and again on the server during sync.
 */
export function validateTransaction(draft: TransactionDraft, ctx: LedgerContext): LedgerValidation {
  const issues: LedgerIssue[] = [];
  const { entries } = draft;

  if (entries.length === 0) {
    return { ok: false, issues: [{ code: 'no_entries' }] };
  }

  checkEntriesBasics(entries, ctx, issues);

  switch (draft.kind) {
    case 'expense':
      validateCategorised(entries, 'negative', 'expense', ctx, issues);
      break;
    case 'income':
      validateCategorised(entries, 'positive', 'income', ctx, issues);
      break;
    case 'refund':
      validateCategorised(entries, 'positive', 'expense', ctx, issues);
      break;
    case 'transfer':
      validateTransfer(entries, ctx, issues);
      break;
    case 'adjustment':
    case 'opening_balance':
      validateUncategorisedSingle(entries, issues);
      break;
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function computeBalance(
  entries: readonly { amountMinor: number }[],
  currency: CurrencyCode,
): Money {
  return sum(
    entries.map((e) => money(e.amountMinor, currency)),
    currency,
  );
}

/** Available credit on a credit card: limit + (negative) balance. */
export function availableCredit(creditLimit: Money, balance: Money): Money {
  return sum([creditLimit, balance], creditLimit.currency);
}
