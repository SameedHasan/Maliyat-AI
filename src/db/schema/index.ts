import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// Relative imports: drizzle-kit loads this file outside Metro and doesn't resolve "@/" aliases.
import { CURRENCY_CODES } from '../../domain/money';
import {
  ACCOUNT_CLASSES,
  ACCOUNT_TYPES,
  BUDGET_PERIODS,
  CATEGORY_KINDS,
  TRANSACTION_KINDS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
} from '../../domain/types';

/** Sync columns shared by every synced table (plan §25.1). Timestamps are ISO-8601 UTC. */
const syncColumns = () => ({
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
  version: integer('version').notNull().default(1),
});

export const accounts = sqliteTable(
  'accounts',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    accountClass: text('account_class', { enum: ACCOUNT_CLASSES }).notNull(),
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
    institution: text('institution'),
    last4: text('last4'),
    creditLimitMinor: integer('credit_limit_minor'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('accounts_user_idx').on(t.userId, t.sortOrder)],
);

export const categories = sqliteTable(
  'categories',
  {
    ...syncColumns(),
    parentId: text('parent_id').references((): AnySQLiteColumn => categories.id),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('categories_user_kind_idx').on(t.userId, t.kind, t.sortOrder),
    index('categories_parent_idx').on(t.parentId),
  ],
);

export const transactions = sqliteTable(
  'transactions',
  {
    ...syncColumns(),
    kind: text('kind', { enum: TRANSACTION_KINDS }).notNull(),
    status: text('status', { enum: TRANSACTION_STATUSES }).notNull().default('cleared'),
    /** User-local calendar date (YYYY-MM-DD); all period grouping uses this. */
    occurredOn: text('occurred_on').notNull(),
    occurredAt: text('occurred_at'),
    payee: text('payee'),
    notes: text('notes'),
    source: text('source', { enum: TRANSACTION_SOURCES }).notNull().default('manual'),
    sourceFingerprint: text('source_fingerprint'),
    refundOfId: text('refund_of_id').references((): AnySQLiteColumn => transactions.id),
  },
  (t) => [
    index('transactions_list_idx')
      .on(t.userId, t.occurredOn, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
    index('transactions_payee_idx').on(t.payee),
    index('transactions_fingerprint_idx').on(t.sourceFingerprint),
  ],
);

export const transactionEntries = sqliteTable(
  'transaction_entries',
  {
    ...syncColumns(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    categoryId: text('category_id').references(() => categories.id),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
  },
  (t) => [
    index('entries_transaction_idx').on(t.transactionId),
    index('entries_account_idx').on(t.accountId),
    index('entries_category_idx').on(t.categoryId),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    ...syncColumns(),
    name: text('name').notNull(),
    period: text('period', { enum: BUDGET_PERIODS }).notNull(),
    startOn: text('start_on').notNull(),
    endOn: text('end_on'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
    rollover: integer('rollover', { mode: 'boolean' }).notNull().default(false),
    alertThresholds: text('alert_thresholds', { mode: 'json' }).notNull().$type<number[]>(),
  },
  (t) => [index('budgets_user_idx').on(t.userId)],
);

/** Categories in a budget's scope; synced as part of the budget aggregate. */
export const budgetCategories = sqliteTable(
  'budget_categories',
  {
    ...syncColumns(),
    budgetId: text('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
  },
  (t) => [
    index('budget_categories_budget_idx').on(t.budgetId),
    index('budget_categories_category_idx').on(t.categoryId),
  ],
);

export const OUTBOX_OPS = ['upsert', 'delete'] as const;
export const OUTBOX_STATUSES = ['pending', 'in_flight', 'needs_attention'] as const;
export const OUTBOX_ENTITIES = ['account', 'category', 'transaction', 'budget'] as const;
export type OutboxEntity = (typeof OUTBOX_ENTITIES)[number];

/** Local-only queue of changes waiting to be pushed to the server (plan §27). */
export const outbox = sqliteTable(
  'outbox',
  {
    id: text('id').primaryKey(),
    entity: text('entity', { enum: OUTBOX_ENTITIES }).notNull(),
    recordId: text('record_id').notNull(),
    op: text('op', { enum: OUTBOX_OPS }).notNull(),
    payload: text('payload', { mode: 'json' }).notNull().$type<unknown>(),
    baseVersion: integer('base_version'),
    status: text('status', { enum: OUTBOX_STATUSES }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('outbox_status_idx').on(t.status, t.createdAt),
    index('outbox_record_idx').on(t.recordId, t.entity),
  ],
);

/** Local-only key/value store for sync cursors and schema bookkeeping. */
export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type AccountRow = typeof accounts.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type TransactionEntryRow = typeof transactionEntries.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type BudgetCategoryRow = typeof budgetCategories.$inferSelect;
