import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { Account, Category, Transaction, TransactionEntry } from '@/domain/types';

import type * as schema from './schema';

type AccountRow = schema.AccountRow;
type CategoryRow = schema.CategoryRow;
type TransactionRow = schema.TransactionRow;
type TransactionEntryRow = schema.TransactionEntryRow;

/**
 * Any synchronous Drizzle SQLite database with our schema: expo-sqlite on device,
 * better-sqlite3 in tests. Repositories depend only on this type.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', any, typeof schema>;

export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

/** Either the database or an open transaction — both expose the same query API. */
export type DbExecutor = AppDatabase | AppTransaction;

// Compile-time guarantee that database rows and domain records stay identical.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const rowsMatchDomain: [
  Same<AccountRow, Account>,
  Same<CategoryRow, Category>,
  Same<TransactionRow, Transaction>,
  Same<TransactionEntryRow, TransactionEntry>,
] = [true, true, true, true];
