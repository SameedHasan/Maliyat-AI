import type { LocalDate } from './dates';
import type { CurrencyCode } from './money';

export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'wallet',
  'credit_card',
  'loan',
  'committee',
  'other_asset',
  'other_liability',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_CLASSES = ['asset', 'liability'] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

const ACCOUNT_CLASS_BY_TYPE: Record<AccountType, AccountClass> = {
  cash: 'asset',
  bank: 'asset',
  wallet: 'asset',
  credit_card: 'liability',
  loan: 'liability',
  // A committee's sign decides whether it is a receivable or a payable (see plan §17).
  committee: 'asset',
  other_asset: 'asset',
  other_liability: 'liability',
};

export function accountClassFor(type: AccountType): AccountClass {
  return ACCOUNT_CLASS_BY_TYPE[type];
}

export const CATEGORY_KINDS = ['expense', 'income', 'system'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const TRANSACTION_KINDS = [
  'expense',
  'income',
  'transfer',
  'refund',
  'adjustment',
  'opening_balance',
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = ['pending', 'cleared', 'void'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const TRANSACTION_SOURCES = [
  'manual',
  'sms',
  'paste',
  'ocr',
  'recurring',
  'import',
  'seed',
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

/** Columns every synced record carries, locally and on the server. */
export interface SyncColumns {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface Account extends SyncColumns {
  name: string;
  type: AccountType;
  accountClass: AccountClass;
  currency: CurrencyCode;
  institution: string | null;
  last4: string | null;
  creditLimitMinor: number | null;
  isArchived: boolean;
  sortOrder: number;
}

export interface Category extends SyncColumns {
  parentId: string | null;
  kind: CategoryKind;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export interface Transaction extends SyncColumns {
  kind: TransactionKind;
  status: TransactionStatus;
  occurredOn: LocalDate;
  occurredAt: string | null;
  payee: string | null;
  notes: string | null;
  source: TransactionSource;
  sourceFingerprint: string | null;
  refundOfId: string | null;
}

export interface TransactionEntry extends SyncColumns {
  transactionId: string;
  accountId: string;
  categoryId: string | null;
  amountMinor: number;
  currency: CurrencyCode;
}

export interface TransactionWithEntries extends Transaction {
  entries: TransactionEntry[];
}

/**
 * Whether an entry counts toward income/expense analytics and budgets. Only categorised
 * entries of user-facing categories count, so transfer legs, adjustments, opening
 * balances and system categories (e.g. Investments) are excluded, while a transfer's
 * fee entry is counted as spending.
 */
export function entryCountsTowardIncomeExpense(
  kind: TransactionKind,
  categoryKind: CategoryKind | null,
): boolean {
  if (kind === 'adjustment' || kind === 'opening_balance') return false;
  return categoryKind === 'expense' || categoryKind === 'income';
}
