import { and, eq, gte, inArray, isNull, lte, ne, notInArray, sql } from 'drizzle-orm';

import { categories, transactionEntries, transactions } from '@/db/schema';
import type { LocalDate } from '@/domain/dates';

import type { RepoContext } from './context';

export interface PeriodRange {
  start: LocalDate;
  end: LocalDate;
}

export interface IncomeExpenseSummary {
  incomeMinor: number;
  /** Positive number: expenses minus refunds. */
  expenseMinor: number;
  netMinor: number;
}

export interface CategorySpend {
  categoryId: string;
  categoryName: string;
  expenseMinor: number;
}

/**
 * Aggregates run in SQL over the local database. Only categorised entries of
 * expense/income categories count (plan §6.2), so transfers, adjustments, opening
 * balances and system categories never distort analytics.
 */
export function createAnalyticsRepository(ctx: RepoContext) {
  const { db, userId } = ctx;

  const countedEntries = (range: PeriodRange) =>
    and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      isNull(transactionEntries.deletedAt),
      ne(transactions.status, 'void'),
      notInArray(transactions.kind, ['adjustment', 'opening_balance']),
      inArray(categories.kind, ['expense', 'income']),
      gte(transactions.occurredOn, range.start),
      lte(transactions.occurredOn, range.end),
    );

  function incomeExpense(range: PeriodRange): IncomeExpenseSummary {
    const rows = db
      .select({
        kind: categories.kind,
        totalMinor: sql<number>`coalesce(sum(${transactionEntries.amountMinor}), 0)`,
      })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .innerJoin(categories, eq(categories.id, transactionEntries.categoryId))
      .where(countedEntries(range))
      .groupBy(categories.kind)
      .all();

    const incomeMinor = Number(rows.find((r) => r.kind === 'income')?.totalMinor ?? 0);
    const expenseMinor = 0 - Number(rows.find((r) => r.kind === 'expense')?.totalMinor ?? 0);
    return { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
  }

  /** Expense per top-level category (subcategories roll up into their parent). */
  function spendingByCategory(range: PeriodRange): CategorySpend[] {
    const rows = db
      .select({
        categoryId: sql<string>`coalesce(${categories.parentId}, ${categories.id})`,
        totalMinor: sql<number>`sum(${transactionEntries.amountMinor})`,
      })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .innerJoin(categories, eq(categories.id, transactionEntries.categoryId))
      .where(and(countedEntries(range), eq(categories.kind, 'expense')))
      .groupBy(sql`coalesce(${categories.parentId}, ${categories.id})`)
      .all();

    const names = new Map(
      db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, userId))
        .all()
        .map((c) => [c.id, c.name]),
    );

    return rows
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: names.get(r.categoryId) ?? '',
        expenseMinor: 0 - Number(r.totalMinor),
      }))
      .filter((r) => r.expenseMinor > 0)
      .sort((a, b) => b.expenseMinor - a.expenseMinor);
  }

  return { incomeExpense, spendingByCategory };
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;
