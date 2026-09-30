import { and, eq, gte, inArray, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';

import { accounts, categories, transactionEntries, transactions } from '@/db/schema';
import type { DateRange } from '@/domain/dates';
import { bucketKeys, type Bucket } from '@/domain/periods';
import type { CurrencyCode } from '@/domain/money';

import type { RepoContext } from './context';

export type PeriodRange = DateRange;

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

export interface CategoryAmount {
  categoryId: string;
  categoryName: string;
  color: string | null;
  icon: string | null;
  /** Positive magnitude (net of refunds for expenses). */
  amountMinor: number;
  hasChildren: boolean;
}

export interface CashflowPoint {
  key: string;
  incomeMinor: number;
  expenseMinor: number;
}

export interface AccountSpend {
  accountId: string;
  accountName: string;
  expenseMinor: number;
}

export interface PayeeSpend {
  payee: string;
  expenseMinor: number;
  count: number;
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

  function categoryMeta() {
    const rows = db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        icon: categories.icon,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.deletedAt)))
      .all();
    const parents = new Set(rows.flatMap((r) => (r.parentId ? [r.parentId] : [])));
    return {
      byId: new Map(rows.map((r) => [r.id, r])),
      hasChildren: (id: string) => parents.has(id),
    };
  }

  /**
   * Totals per category. Without `parentId`, subcategories roll up into their parent;
   * with it, the parent's own entries and each subcategory are listed separately.
   */
  function categoryBreakdown(
    range: PeriodRange,
    kind: 'expense' | 'income',
    parentId?: string,
  ): CategoryAmount[] {
    const groupExpr =
      parentId === undefined
        ? sql<string>`coalesce(${categories.parentId}, ${categories.id})`
        : sql<string>`${categories.id}`;
    const rows = db
      .select({
        categoryId: groupExpr,
        totalMinor: sql<number>`sum(${transactionEntries.amountMinor})`,
      })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .innerJoin(categories, eq(categories.id, transactionEntries.categoryId))
      .where(
        and(
          countedEntries(range),
          eq(categories.kind, kind),
          parentId === undefined
            ? undefined
            : or(eq(categories.id, parentId), eq(categories.parentId, parentId)),
        ),
      )
      .groupBy(groupExpr)
      .all();

    const meta = categoryMeta();
    const sign = kind === 'expense' ? -1 : 1;
    return rows
      .map((r) => {
        const category = meta.byId.get(r.categoryId);
        return {
          categoryId: r.categoryId,
          categoryName: category?.name ?? '',
          color: category?.color ?? null,
          icon: category?.icon ?? null,
          amountMinor: sign * Number(r.totalMinor),
          hasChildren: parentId === undefined && meta.hasChildren(r.categoryId),
        };
      })
      .filter((r) => r.amountMinor > 0)
      .sort((a, b) => b.amountMinor - a.amountMinor);
  }

  /** Expense per top-level category (subcategories roll up into their parent). */
  function spendingByCategory(range: PeriodRange): CategorySpend[] {
    return categoryBreakdown(range, 'expense').map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      expenseMinor: c.amountMinor,
    }));
  }

  /** Income and expense per bucket; every bucket in the range is present. */
  function cashflowSeries(range: PeriodRange, bucket: Bucket): CashflowPoint[] {
    const keyExpr =
      bucket === 'day'
        ? sql<string>`${transactions.occurredOn}`
        : sql<string>`substr(${transactions.occurredOn}, 1, 7)`;
    const rows = db
      .select({
        key: keyExpr,
        kind: categories.kind,
        totalMinor: sql<number>`sum(${transactionEntries.amountMinor})`,
      })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .innerJoin(categories, eq(categories.id, transactionEntries.categoryId))
      .where(countedEntries(range))
      .groupBy(keyExpr, categories.kind)
      .all();

    const points = new Map<string, CashflowPoint>(
      bucketKeys(range, bucket).map((key) => [key, { key, incomeMinor: 0, expenseMinor: 0 }]),
    );
    for (const row of rows) {
      const point = points.get(row.key);
      if (!point) continue;
      if (row.kind === 'income') point.incomeMinor += Number(row.totalMinor);
      else point.expenseMinor -= Number(row.totalMinor);
    }
    return [...points.values()];
  }

  function spendingByAccount(range: PeriodRange): AccountSpend[] {
    const rows = db
      .select({
        accountId: transactionEntries.accountId,
        accountName: accounts.name,
        totalMinor: sql<number>`sum(${transactionEntries.amountMinor})`,
      })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .innerJoin(categories, eq(categories.id, transactionEntries.categoryId))
      .innerJoin(accounts, eq(accounts.id, transactionEntries.accountId))
      .where(and(countedEntries(range), eq(categories.kind, 'expense')))
      .groupBy(transactionEntries.accountId)
      .all();
    return rows
      .map((r) => ({
        accountId: r.accountId,
        accountName: r.accountName,
        expenseMinor: 0 - Number(r.totalMinor),
      }))
      .filter((r) => r.expenseMinor > 0)
      .sort((a, b) => b.expenseMinor - a.expenseMinor);
  }

  /** Payees grouped case-insensitively; the most recent spelling is shown. */
  function topPayees(range: PeriodRange, limit = 5): PayeeSpend[] {
    const keyExpr = sql<string>`lower(trim(${transactions.payee}))`;
    const totalExpr = sql<number>`sum(${transactionEntries.amountMinor})`;
    const rows = db
      .select({
        payee: sql<string>`max(trim(${transactions.payee}))`,
        totalMinor: totalExpr,
        count: sql<number>`count(distinct ${transactions.id})`,
      })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .innerJoin(categories, eq(categories.id, transactionEntries.categoryId))
      .where(
        and(
          countedEntries(range),
          eq(categories.kind, 'expense'),
          sql`trim(coalesce(${transactions.payee}, '')) <> ''`,
        ),
      )
      .groupBy(keyExpr)
      .orderBy(totalExpr)
      .limit(Math.max(1, limit))
      .all();
    return rows
      .map((r) => ({
        payee: r.payee,
        expenseMinor: 0 - Number(r.totalMinor),
        count: Number(r.count),
      }))
      .filter((r) => r.expenseMinor > 0);
  }

  /** Change in net worth over the range: every entry in the given currency counts. */
  function netChange(range: PeriodRange, currency: CurrencyCode): number {
    const row = db
      .select({ total: sql<number>`coalesce(sum(${transactionEntries.amountMinor}), 0)` })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          isNull(transactionEntries.deletedAt),
          ne(transactions.status, 'void'),
          eq(transactionEntries.currency, currency),
          gte(transactions.occurredOn, range.start),
          lte(transactions.occurredOn, range.end),
        ),
      )
      .get();
    return Number(row?.total ?? 0);
  }

  return {
    incomeExpense,
    categoryBreakdown,
    spendingByCategory,
    cashflowSeries,
    spendingByAccount,
    topPayees,
    netChange,
  };
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;
