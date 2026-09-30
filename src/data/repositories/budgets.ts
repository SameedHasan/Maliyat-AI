import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';

import {
  budgetCategories,
  budgets,
  categories,
  transactionEntries,
  transactions,
} from '@/db/schema';
import type { DbExecutor } from '@/db/types';
import {
  budgetPeriodsThrough,
  computeBudgetStatus,
  expandCategoryScope,
  type BudgetStatus,
} from '@/domain/budgets';
import { toLocalDate, type LocalDate } from '@/domain/dates';
import { budgetInputSchema, type BudgetInput, type BudgetInputParsed } from '@/domain/schemas';
import type { Budget, BudgetCategory, BudgetWithCategories } from '@/domain/types';

import { timestamp, type RepoContext } from './context';
import { parseOrThrow, RepositoryError } from './errors';
import { enqueueChange } from './outbox';

export interface BudgetWithStatus extends BudgetWithCategories {
  /** Null before the budget starts or after a custom budget has ended. */
  status: BudgetStatus | null;
}

function loadLinks(executor: DbExecutor, budgetIds: string[]): BudgetCategory[] {
  if (budgetIds.length === 0) return [];
  return executor
    .select()
    .from(budgetCategories)
    .where(and(inArray(budgetCategories.budgetId, budgetIds), isNull(budgetCategories.deletedAt)))
    .all();
}

/** Queues the whole budget aggregate (header + category links) for sync. */
export function enqueueBudget(
  executor: DbExecutor,
  ctx: RepoContext,
  budget: Budget,
  op: 'upsert' | 'delete',
  baseVersion: number | null,
): void {
  enqueueChange(executor, ctx, {
    entity: 'budget',
    recordId: budget.id,
    op,
    payload: { ...budget, categories: loadLinks(executor, [budget.id]) },
    baseVersion,
  });
}

export function createBudgetsRepository(ctx: RepoContext) {
  const { db, userId } = ctx;

  function withCategories(executor: DbExecutor, rows: Budget[]): BudgetWithCategories[] {
    const links = loadLinks(
      executor,
      rows.map((b) => b.id),
    );
    return rows.map((b) => ({
      ...b,
      categoryIds: links.filter((l) => l.budgetId === b.id).map((l) => l.categoryId),
    }));
  }

  function getHeader(id: string, executor: DbExecutor = db): Budget | undefined {
    return executor
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId), isNull(budgets.deletedAt)))
      .get();
  }

  function get(id: string): BudgetWithCategories | undefined {
    const header = getHeader(id);
    return header ? withCategories(db, [header])[0] : undefined;
  }

  function list(): BudgetWithCategories[] {
    const rows = db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)))
      .orderBy(asc(budgets.name))
      .all();
    return withCategories(db, rows);
  }

  function assertExpenseCategories(executor: DbExecutor, ids: string[]): void {
    const found = executor
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          inArray(categories.id, ids),
          eq(categories.userId, userId),
          eq(categories.kind, 'expense'),
          isNull(categories.deletedAt),
        ),
      )
      .all();
    if (found.length !== ids.length) {
      throw new RepositoryError('invalid_input', 'Budgets can only track expense categories');
    }
  }

  function writeLinks(executor: DbExecutor, budgetId: string, categoryIds: string[], now: string) {
    executor.delete(budgetCategories).where(eq(budgetCategories.budgetId, budgetId)).run();
    if (categoryIds.length === 0) return;
    executor
      .insert(budgetCategories)
      .values(
        categoryIds.map((categoryId) => ({
          id: ctx.newId(),
          userId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          version: 1,
          budgetId,
          categoryId,
        })),
      )
      .run();
  }

  function headerFields(parsed: BudgetInputParsed) {
    return {
      name: parsed.name,
      period: parsed.period,
      startOn: parsed.startOn,
      endOn: parsed.endOn,
      amountMinor: parsed.amountMinor,
      currency: parsed.currency,
      rollover: parsed.rollover,
      alertThresholds: parsed.alertThresholds,
    };
  }

  function create(input: BudgetInput): BudgetWithCategories {
    const parsed = parseOrThrow(budgetInputSchema, input);
    return db.transaction((tx) => {
      assertExpenseCategories(tx, parsed.categoryIds);
      const now = timestamp(ctx);
      const budget: Budget = {
        id: ctx.newId(),
        userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
        ...headerFields(parsed),
      };
      tx.insert(budgets).values(budget).run();
      writeLinks(tx, budget.id, parsed.categoryIds, now);
      enqueueBudget(tx, ctx, budget, 'upsert', null);
      return { ...budget, categoryIds: parsed.categoryIds };
    });
  }

  function update(id: string, input: BudgetInput): BudgetWithCategories {
    const parsed = parseOrThrow(budgetInputSchema, input);
    return db.transaction((tx) => {
      const existing = getHeader(id, tx);
      if (!existing) throw new RepositoryError('not_found', `Budget ${id} not found`);
      assertExpenseCategories(tx, parsed.categoryIds);
      const now = timestamp(ctx);
      const next: Budget = { ...existing, ...headerFields(parsed), updatedAt: now };
      tx.update(budgets).set(next).where(eq(budgets.id, id)).run();
      writeLinks(tx, id, parsed.categoryIds, now);
      enqueueBudget(tx, ctx, next, 'upsert', existing.version);
      return { ...next, categoryIds: parsed.categoryIds };
    });
  }

  function remove(id: string): void {
    db.transaction((tx) => {
      const existing = getHeader(id, tx);
      if (!existing) throw new RepositoryError('not_found', `Budget ${id} not found`);
      const now = timestamp(ctx);
      const deleted: Budget = { ...existing, deletedAt: now, updatedAt: now };
      tx.update(budgets).set(deleted).where(eq(budgets.id, id)).run();
      enqueueBudget(tx, ctx, deleted, 'delete', existing.version);
    });
  }

  /** Expense (minus refunds) per day for the given categories, as a positive magnitude. */
  function dailySpend(
    categoryIds: string[],
    start: LocalDate,
    end: LocalDate,
  ): { day: LocalDate; spentMinor: number }[] {
    if (categoryIds.length === 0) return [];
    return db
      .select({
        day: transactions.occurredOn,
        total: sql<number>`sum(${transactionEntries.amountMinor})`,
      })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .innerJoin(categories, eq(categories.id, transactionEntries.categoryId))
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          isNull(transactionEntries.deletedAt),
          ne(transactions.status, 'void'),
          eq(categories.kind, 'expense'),
          inArray(transactionEntries.categoryId, categoryIds),
          gte(transactions.occurredOn, start),
          lte(transactions.occurredOn, end),
        ),
      )
      .groupBy(transactions.occurredOn)
      .all()
      .map((r) => ({ day: r.day, spentMinor: 0 - Number(r.total) }));
  }

  function categoryScope(budget: BudgetWithCategories): string[] {
    const all = db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.deletedAt)))
      .all();
    return expandCategoryScope(budget.categoryIds, all);
  }

  function statusOf(budget: BudgetWithCategories, today?: LocalDate): BudgetStatus | null {
    const date = today ?? toLocalDate(ctx.now(), ctx.timeZone);
    const periods = budgetPeriodsThrough(budget, date);
    const first = periods[0];
    const last = periods[periods.length - 1];
    if (!first || !last) return null;

    const days = dailySpend(categoryScope(budget), first.start, last.end);
    return computeBudgetStatus(
      budget,
      periods.map((range) => ({
        range,
        spentMinor: days
          .filter((d) => d.day >= range.start && d.day <= range.end)
          .reduce((total, d) => total + d.spentMinor, 0),
      })),
    );
  }

  function listWithStatus(today?: LocalDate): BudgetWithStatus[] {
    return list().map((budget) => ({ ...budget, status: statusOf(budget, today) }));
  }

  return { get, list, create, update, remove, statusOf, listWithStatus };
}

export type BudgetsRepository = ReturnType<typeof createBudgetsRepository>;
