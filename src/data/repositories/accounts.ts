import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';

import { accounts, transactionEntries, transactions } from '@/db/schema';
import type { DbExecutor } from '@/db/types';
import { toLocalDate, type LocalDate } from '@/domain/dates';
import {
  accountInputSchema,
  accountUpdateSchema,
  type AccountInput,
  type AccountUpdate,
} from '@/domain/schemas';
import { accountClassFor, type Account } from '@/domain/types';

import { timestamp, type RepoContext } from './context';
import { parseOrThrow, RepositoryError } from './errors';
import { enqueueChange } from './outbox';
import { insertTransaction } from './transactions';

export interface AccountBalance {
  accountId: string;
  balanceMinor: number;
}

function activeBalances(db: DbExecutor, userId: string): Map<string, number> {
  const rows = db
    .select({
      accountId: transactionEntries.accountId,
      balanceMinor: sql<number>`coalesce(sum(${transactionEntries.amountMinor}), 0)`,
    })
    .from(transactionEntries)
    .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
    .where(
      and(
        eq(transactionEntries.userId, userId),
        isNull(transactions.deletedAt),
        isNull(transactionEntries.deletedAt),
        ne(transactions.status, 'void'),
      ),
    )
    .groupBy(transactionEntries.accountId)
    .all();
  return new Map(rows.map((r) => [r.accountId, Number(r.balanceMinor)]));
}

export function createAccountsRepository(ctx: RepoContext) {
  const { db, userId } = ctx;

  function get(id: string, executor: DbExecutor = db): Account | undefined {
    return executor
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId), isNull(accounts.deletedAt)))
      .get();
  }

  function getOrThrow(id: string, executor: DbExecutor = db): Account {
    const account = get(id, executor);
    if (!account) throw new RepositoryError('not_found', `Account ${id} not found`);
    return account;
  }

  function list(options: { includeArchived?: boolean } = {}): Account[] {
    return db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          isNull(accounts.deletedAt),
          options.includeArchived ? undefined : eq(accounts.isArchived, false),
        ),
      )
      .orderBy(asc(accounts.sortOrder), asc(accounts.name))
      .all();
  }

  function balances(): Map<string, number> {
    return activeBalances(db, userId);
  }

  function balanceOf(id: string, executor: DbExecutor = db): number {
    return activeBalances(executor, userId).get(id) ?? 0;
  }

  function create(input: AccountInput): Account {
    const parsed = parseOrThrow(accountInputSchema, input);
    const now = timestamp(ctx);
    const nextSortOrder =
      (db
        .select({ max: sql<number | null>`max(${accounts.sortOrder})` })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .get()?.max ?? -1) + 1;

    const account: Account = {
      id: ctx.newId(),
      userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
      name: parsed.name,
      type: parsed.type,
      accountClass: accountClassFor(parsed.type),
      currency: parsed.currency,
      institution: parsed.institution,
      last4: parsed.last4,
      creditLimitMinor: parsed.creditLimitMinor,
      isArchived: false,
      sortOrder: nextSortOrder,
    };

    return db.transaction((tx) => {
      tx.insert(accounts).values(account).run();
      enqueueChange(tx, ctx, {
        entity: 'account',
        recordId: account.id,
        op: 'upsert',
        payload: account,
        baseVersion: null,
      });

      if (parsed.openingBalanceMinor !== 0) {
        insertTransaction(tx, ctx, {
          kind: 'opening_balance',
          occurredOn: toLocalDate(ctx.now(), ctx.timeZone),
          source: 'manual',
          entries: [
            { accountId: account.id, categoryId: null, amountMinor: parsed.openingBalanceMinor },
          ],
        });
      }
      return account;
    });
  }

  function update(id: string, patch: AccountUpdate): Account {
    const parsed = parseOrThrow(accountUpdateSchema, patch);
    return db.transaction((tx) => {
      const existing = getOrThrow(id, tx);
      if (parsed.creditLimitMinor != null && existing.type !== 'credit_card') {
        throw new RepositoryError('invalid_input', 'Only credit cards have a credit limit');
      }
      const next: Account = {
        ...existing,
        ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)),
        updatedAt: timestamp(ctx),
      };
      tx.update(accounts).set(next).where(eq(accounts.id, id)).run();
      enqueueChange(tx, ctx, {
        entity: 'account',
        recordId: id,
        op: 'upsert',
        payload: next,
        baseVersion: existing.version,
      });
      return next;
    });
  }

  /** Accounts with history are archived, never deleted (plan §6.6). */
  function setArchived(id: string, isArchived: boolean): Account {
    return db.transaction((tx) => {
      const existing = getOrThrow(id, tx);
      const next: Account = { ...existing, isArchived, updatedAt: timestamp(ctx) };
      tx.update(accounts).set(next).where(eq(accounts.id, id)).run();
      enqueueChange(tx, ctx, {
        entity: 'account',
        recordId: id,
        op: 'upsert',
        payload: next,
        baseVersion: existing.version,
      });
      return next;
    });
  }

  /**
   * Records an adjustment so the account balance matches `actualBalanceMinor`.
   * Returns the adjustment transaction id, or null if the balance already matches.
   */
  function reconcile(
    id: string,
    actualBalanceMinor: number,
    occurredOn?: LocalDate,
  ): string | null {
    if (!Number.isSafeInteger(actualBalanceMinor)) {
      throw new RepositoryError('invalid_input', 'Balance must be an integer of minor units');
    }
    return db.transaction((tx) => {
      getOrThrow(id, tx);
      const difference = actualBalanceMinor - balanceOf(id, tx);
      if (difference === 0) return null;
      return insertTransaction(tx, ctx, {
        kind: 'adjustment',
        occurredOn: occurredOn ?? toLocalDate(ctx.now(), ctx.timeZone),
        source: 'manual',
        entries: [{ accountId: id, categoryId: null, amountMinor: difference }],
      }).id;
    });
  }

  return { get, list, balances, balanceOf, create, update, setArchived, reconcile };
}

export type AccountsRepository = ReturnType<typeof createAccountsRepository>;
