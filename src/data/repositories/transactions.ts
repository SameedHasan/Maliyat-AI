import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';

import { accounts, categories, transactionEntries, transactions } from '@/db/schema';
import type { DbExecutor } from '@/db/types';
import type { LocalDate } from '@/domain/dates';
import { validateTransaction, type LedgerContext } from '@/domain/ledger';
import {
  transactionInputSchema,
  type TransactionInput,
  type TransactionInputParsed,
} from '@/domain/schemas';
import type {
  Transaction,
  TransactionEntry,
  TransactionKind,
  TransactionWithEntries,
} from '@/domain/types';

import { timestamp, type RepoContext } from './context';
import { parseOrThrow, RepositoryError } from './errors';
import { enqueueChange } from './outbox';

function loadLedgerContext(
  executor: DbExecutor,
  userId: string,
  accountIds: string[],
  categoryIds: string[],
  allowArchived: boolean,
): LedgerContext {
  const accountRows = accountIds.length
    ? executor
        .select({ id: accounts.id, currency: accounts.currency, isArchived: accounts.isArchived })
        .from(accounts)
        .where(
          and(
            inArray(accounts.id, accountIds),
            eq(accounts.userId, userId),
            isNull(accounts.deletedAt),
          ),
        )
        .all()
    : [];
  const categoryRows = categoryIds.length
    ? executor
        .select({ id: categories.id, kind: categories.kind, isArchived: categories.isArchived })
        .from(categories)
        .where(
          and(
            inArray(categories.id, categoryIds),
            eq(categories.userId, userId),
            isNull(categories.deletedAt),
          ),
        )
        .all()
    : [];
  const accountMap = new Map(accountRows.map((a) => [a.id, a]));
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));
  return {
    getAccount: (id) => accountMap.get(id),
    getCategory: (id) => categoryMap.get(id),
    allowArchived,
  };
}

function loadLedgerContextFor(
  executor: DbExecutor,
  userId: string,
  entries: TransactionInput['entries'],
  allowArchived: boolean,
): LedgerContext {
  return loadLedgerContext(
    executor,
    userId,
    [...new Set(entries.map((e) => e.accountId))],
    [...new Set(entries.flatMap((e) => (e.categoryId ? [e.categoryId] : [])))],
    allowArchived,
  );
}

function assertValid(
  ledgerCtx: LedgerContext,
  kind: TransactionKind,
  entries: TransactionInput['entries'],
): void {
  const result = validateTransaction({ kind, entries }, ledgerCtx);
  if (!result.ok) {
    throw new RepositoryError('ledger_violation', 'Transaction violates ledger rules', {
      ledgerIssues: result.issues,
    });
  }
}

function validateOrThrow(
  executor: DbExecutor,
  userId: string,
  kind: TransactionKind,
  entries: TransactionInput['entries'],
  allowArchived: boolean,
): LedgerContext {
  const ledgerCtx = loadLedgerContextFor(executor, userId, entries, allowArchived);
  assertValid(ledgerCtx, kind, entries);
  return ledgerCtx;
}

function buildEntries(
  ctx: RepoContext,
  ledgerCtx: LedgerContext,
  transactionId: string,
  entries: TransactionInput['entries'],
  now: string,
): TransactionEntry[] {
  return entries.map((e) => ({
    id: ctx.newId(),
    userId: ctx.userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    transactionId,
    accountId: e.accountId,
    categoryId: e.categoryId,
    amountMinor: e.amountMinor,
    // Entries always carry their account's currency (validated above).
    currency: ledgerCtx.getAccount(e.accountId)!.currency,
  }));
}

function loadEntries(executor: DbExecutor, transactionIds: string[]): TransactionEntry[] {
  if (transactionIds.length === 0) return [];
  return executor
    .select()
    .from(transactionEntries)
    .where(
      and(
        inArray(transactionEntries.transactionId, transactionIds),
        isNull(transactionEntries.deletedAt),
      ),
    )
    .all();
}

function withEntries(executor: DbExecutor, headers: Transaction[]): TransactionWithEntries[] {
  const entries = loadEntries(
    executor,
    headers.map((h) => h.id),
  );
  const byTransaction = new Map<string, TransactionEntry[]>();
  for (const entry of entries) {
    const list = byTransaction.get(entry.transactionId) ?? [];
    list.push(entry);
    byTransaction.set(entry.transactionId, list);
  }
  return headers.map((h) => ({ ...h, entries: byTransaction.get(h.id) ?? [] }));
}

/**
 * Validates and writes a transaction aggregate (header + entries + outbox change) using
 * the caller's open transaction. Used by other repositories for opening balances and
 * adjustments so those writes stay atomic with their parent change.
 */
export function insertTransaction(
  tx: DbExecutor,
  ctx: RepoContext,
  input: TransactionInput,
): TransactionWithEntries {
  const parsed = parseOrThrow(transactionInputSchema, input);
  const ledgerCtx = validateOrThrow(tx, ctx.userId, parsed.kind, parsed.entries, false);
  const aggregate = buildAggregate(ctx, ledgerCtx, parsed, timestamp(ctx));

  tx.insert(transactions).values(stripEntries(aggregate)).run();
  tx.insert(transactionEntries).values(aggregate.entries).run();
  enqueueChange(tx, ctx, {
    entity: 'transaction',
    recordId: aggregate.id,
    op: 'upsert',
    payload: aggregate,
    baseVersion: null,
  });
  return aggregate;
}

// Keeps each multi-row INSERT well under SQLite's bound-parameter limit.
const BULK_CHUNK_ROWS = 400;

/**
 * Validates and writes many transactions with one ledger-context lookup and chunked
 * multi-row inserts. All-or-nothing when called inside a transaction. With
 * `enqueue: false` nothing reaches the outbox (seed/demo data must never sync).
 */
export function insertTransactionsBulk(
  tx: DbExecutor,
  ctx: RepoContext,
  inputs: readonly TransactionInput[],
  options: { enqueue: boolean },
): number {
  const parsed = inputs.map((input) => parseOrThrow(transactionInputSchema, input));
  const ledgerCtx = loadLedgerContextFor(
    tx,
    ctx.userId,
    parsed.flatMap((p) => p.entries),
    false,
  );
  const now = timestamp(ctx);
  const aggregates = parsed.map((p) => {
    assertValid(ledgerCtx, p.kind, p.entries);
    return buildAggregate(ctx, ledgerCtx, p, now);
  });

  const headers = aggregates.map(stripEntries);
  const entries = aggregates.flatMap((a) => a.entries);
  for (let i = 0; i < headers.length; i += BULK_CHUNK_ROWS) {
    tx.insert(transactions)
      .values(headers.slice(i, i + BULK_CHUNK_ROWS))
      .run();
  }
  for (let i = 0; i < entries.length; i += BULK_CHUNK_ROWS) {
    tx.insert(transactionEntries)
      .values(entries.slice(i, i + BULK_CHUNK_ROWS))
      .run();
  }
  if (options.enqueue) {
    for (const aggregate of aggregates) {
      enqueueChange(tx, ctx, {
        entity: 'transaction',
        recordId: aggregate.id,
        op: 'upsert',
        payload: aggregate,
        baseVersion: null,
      });
    }
  }
  return aggregates.length;
}

function stripEntries({ entries: _entries, ...header }: TransactionWithEntries): Transaction {
  return header;
}

function buildAggregate(
  ctx: RepoContext,
  ledgerCtx: LedgerContext,
  parsed: TransactionInputParsed,
  now: string,
): TransactionWithEntries {
  const header: Transaction = {
    id: ctx.newId(),
    userId: ctx.userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1,
    kind: parsed.kind,
    status: 'cleared',
    occurredOn: parsed.occurredOn,
    occurredAt: parsed.occurredAt,
    payee: parsed.payee,
    notes: parsed.notes,
    source: parsed.source,
    sourceFingerprint: parsed.sourceFingerprint,
    refundOfId: parsed.refundOfId,
  };
  return { ...header, entries: buildEntries(ctx, ledgerCtx, header.id, parsed.entries, now) };
}

export interface TransactionCursor {
  occurredOn: LocalDate;
  id: string;
}

export interface TransactionPage {
  items: TransactionWithEntries[];
  nextCursor: TransactionCursor | null;
}

export function createTransactionsRepository(ctx: RepoContext) {
  const { db, userId } = ctx;

  function getHeader(id: string, executor: DbExecutor, includeDeleted = false) {
    return executor
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, id),
          eq(transactions.userId, userId),
          includeDeleted ? undefined : isNull(transactions.deletedAt),
        ),
      )
      .get();
  }

  function get(id: string): TransactionWithEntries | undefined {
    const header = getHeader(id, db);
    return header ? withEntries(db, [header])[0] : undefined;
  }

  /** Newest first, keyset-paginated on (occurred_on DESC, id DESC). */
  function list(
    options: { limit?: number; cursor?: TransactionCursor | null } = {},
  ): TransactionPage {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const { cursor } = options;
    const headers = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          cursor
            ? or(
                lt(transactions.occurredOn, cursor.occurredOn),
                and(eq(transactions.occurredOn, cursor.occurredOn), lt(transactions.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(transactions.occurredOn), desc(transactions.id))
      .limit(limit + 1)
      .all();

    const page = headers.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: withEntries(db, page),
      nextCursor:
        headers.length > limit && last ? { occurredOn: last.occurredOn, id: last.id } : null,
    };
  }

  function create(input: TransactionInput): TransactionWithEntries {
    return db.transaction((tx) => insertTransaction(tx, ctx, input));
  }

  /** Replaces header fields and all entries as one unit (plan §6.6). */
  function update(id: string, input: TransactionInput): TransactionWithEntries {
    const parsed = parseOrThrow(transactionInputSchema, input);
    return db.transaction((tx) => {
      const existing = getHeader(id, tx);
      if (!existing) throw new RepositoryError('not_found', `Transaction ${id} not found`);
      const ledgerCtx = validateOrThrow(tx, userId, parsed.kind, parsed.entries, true);
      const now = timestamp(ctx);

      const header: Transaction = {
        ...existing,
        kind: parsed.kind,
        occurredOn: parsed.occurredOn,
        occurredAt: parsed.occurredAt,
        payee: parsed.payee,
        notes: parsed.notes,
        refundOfId: parsed.refundOfId,
        updatedAt: now,
      };
      const entries = buildEntries(ctx, ledgerCtx, id, parsed.entries, now);

      tx.update(transactions).set(header).where(eq(transactions.id, id)).run();
      tx.delete(transactionEntries).where(eq(transactionEntries.transactionId, id)).run();
      tx.insert(transactionEntries).values(entries).run();

      const aggregate: TransactionWithEntries = { ...header, entries };
      enqueueChange(tx, ctx, {
        entity: 'transaction',
        recordId: id,
        op: 'upsert',
        payload: aggregate,
        baseVersion: existing.version,
      });
      return aggregate;
    });
  }

  function setDeleted(id: string, deleted: boolean): void {
    db.transaction((tx) => {
      const existing = getHeader(id, tx, true);
      if (!existing) throw new RepositoryError('not_found', `Transaction ${id} not found`);
      const now = timestamp(ctx);
      const header: Transaction = { ...existing, deletedAt: deleted ? now : null, updatedAt: now };
      tx.update(transactions).set(header).where(eq(transactions.id, id)).run();
      enqueueChange(tx, ctx, {
        entity: 'transaction',
        recordId: id,
        op: deleted ? 'delete' : 'upsert',
        payload: { ...header, entries: loadEntries(tx, [id]) },
        baseVersion: existing.version,
      });
    });
  }

  /** Soft delete; pair with `restore` for the Undo snackbar. */
  function remove(id: string): void {
    setDeleted(id, true);
  }

  function restore(id: string): void {
    setDeleted(id, false);
  }

  return { get, list, create, update, remove, restore };
}

export type TransactionsRepository = ReturnType<typeof createTransactionsRepository>;
