import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { categories, transactionEntries, transactions } from '@/db/schema';
import type { DbExecutor } from '@/db/types';
import { DEFAULT_CATEGORIES } from '@/domain/defaultCategories';
import { categoryInputSchema, type CategoryInput } from '@/domain/schemas';
import type { Category, CategoryKind, TransactionWithEntries } from '@/domain/types';

import { timestamp, type RepoContext } from './context';
import { parseOrThrow, RepositoryError } from './errors';
import { enqueueChange } from './outbox';

export interface CategoryNode extends Category {
  children: Category[];
}

export function createCategoriesRepository(ctx: RepoContext) {
  const { db, userId } = ctx;

  function get(id: string, executor: DbExecutor = db): Category | undefined {
    return executor
      .select()
      .from(categories)
      .where(
        and(eq(categories.id, id), eq(categories.userId, userId), isNull(categories.deletedAt)),
      )
      .get();
  }

  function list(options: { kind?: CategoryKind; includeArchived?: boolean } = {}): Category[] {
    return db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
          options.kind ? eq(categories.kind, options.kind) : undefined,
          options.includeArchived ? undefined : eq(categories.isArchived, false),
        ),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all();
  }

  /** Parents with their children, in display order. */
  function tree(kind: CategoryKind, options: { includeArchived?: boolean } = {}): CategoryNode[] {
    const all = list({ kind, includeArchived: options.includeArchived });
    const parents = all.filter((c) => c.parentId === null);
    return parents.map((p) => ({ ...p, children: all.filter((c) => c.parentId === p.id) }));
  }

  function write(tx: DbExecutor, next: Category, baseVersion: number | null, insert: boolean) {
    if (insert) tx.insert(categories).values(next).run();
    else tx.update(categories).set(next).where(eq(categories.id, next.id)).run();
    enqueueChange(tx, ctx, {
      entity: 'category',
      recordId: next.id,
      op: 'upsert',
      payload: next,
      baseVersion,
    });
  }

  function validateParent(
    tx: DbExecutor,
    parentId: string | null,
    kind: CategoryKind,
    selfId?: string,
  ) {
    if (parentId === null) return;
    const parent = get(parentId, tx);
    if (!parent || parent.kind !== kind || parent.parentId !== null || parent.id === selfId) {
      throw new RepositoryError(
        'invalid_parent',
        'Parent must be an existing top-level category of the same kind',
      );
    }
  }

  function create(input: CategoryInput): Category {
    const parsed = parseOrThrow(categoryInputSchema, input);
    return db.transaction((tx) => {
      validateParent(tx, parsed.parentId, parsed.kind);
      const now = timestamp(ctx);
      const maxOrder =
        tx
          .select({ max: sql<number | null>`max(${categories.sortOrder})` })
          .from(categories)
          .where(and(eq(categories.userId, userId), eq(categories.kind, parsed.kind)))
          .get()?.max ?? -1;
      const category: Category = {
        id: ctx.newId(),
        userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        version: 1,
        parentId: parsed.parentId,
        kind: parsed.kind,
        name: parsed.name,
        icon: parsed.icon,
        color: parsed.color,
        sortOrder: maxOrder + 1,
        isArchived: false,
      };
      write(tx, category, null, true);
      return category;
    });
  }

  function update(id: string, input: Partial<CategoryInput>): Category {
    return db.transaction((tx) => {
      const existing = get(id, tx);
      if (!existing) throw new RepositoryError('not_found', `Category ${id} not found`);
      if (existing.kind === 'system') {
        throw new RepositoryError('invalid_input', 'System categories cannot be edited');
      }
      const parsed = parseOrThrow(categoryInputSchema, {
        name: existing.name,
        kind: existing.kind,
        parentId: existing.parentId,
        icon: existing.icon,
        color: existing.color,
        ...input,
      });
      if (parsed.kind !== existing.kind) {
        throw new RepositoryError('invalid_input', 'Category kind cannot change');
      }
      validateParent(tx, parsed.parentId, parsed.kind, id);
      const next: Category = { ...existing, ...parsed, updatedAt: timestamp(ctx) };
      write(tx, next, existing.version, false);
      return next;
    });
  }

  function setArchived(id: string, isArchived: boolean): Category {
    return db.transaction((tx) => {
      const existing = get(id, tx);
      if (!existing) throw new RepositoryError('not_found', `Category ${id} not found`);
      const next: Category = { ...existing, isArchived, updatedAt: timestamp(ctx) };
      write(tx, next, existing.version, false);
      return next;
    });
  }

  /** Persists a new display order for siblings, e.g. after drag-to-reorder. */
  function reorder(orderedIds: string[]): void {
    db.transaction((tx) => {
      orderedIds.forEach((id, sortOrder) => {
        const existing = get(id, tx);
        if (!existing || existing.sortOrder === sortOrder) return;
        write(tx, { ...existing, sortOrder, updatedAt: timestamp(ctx) }, existing.version, false);
      });
    });
  }

  /**
   * Deletes a category. If transactions use it, `replacementId` (same kind) is required
   * and those entries are moved to it; categories with children must be emptied first.
   */
  function remove(id: string, replacementId?: string): void {
    db.transaction((tx) => {
      const existing = get(id, tx);
      if (!existing) throw new RepositoryError('not_found', `Category ${id} not found`);
      if (existing.kind === 'system') {
        throw new RepositoryError('invalid_input', 'System categories cannot be deleted');
      }

      const child = tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.parentId, id), isNull(categories.deletedAt)))
        .get();
      if (child) throw new RepositoryError('category_has_children', 'Category has subcategories');

      const affected = tx
        .selectDistinct({ transactionId: transactionEntries.transactionId })
        .from(transactionEntries)
        .where(eq(transactionEntries.categoryId, id))
        .all()
        .map((r) => r.transactionId);

      if (affected.length > 0) {
        const replacement = replacementId ? get(replacementId, tx) : undefined;
        if (!replacement || replacement.kind !== existing.kind || replacement.id === id) {
          throw new RepositoryError(
            'category_in_use',
            'Category is used by transactions; choose a replacement of the same kind',
          );
        }
        const now = timestamp(ctx);
        tx.update(transactionEntries)
          .set({ categoryId: replacement.id, updatedAt: now })
          .where(eq(transactionEntries.categoryId, id))
          .run();

        const headers = tx
          .select()
          .from(transactions)
          .where(inArray(transactions.id, affected))
          .all();
        const entries = tx
          .select()
          .from(transactionEntries)
          .where(inArray(transactionEntries.transactionId, affected))
          .all();
        for (const header of headers) {
          const updated = { ...header, updatedAt: now };
          tx.update(transactions)
            .set({ updatedAt: now })
            .where(eq(transactions.id, header.id))
            .run();
          const aggregate: TransactionWithEntries = {
            ...updated,
            entries: entries.filter((e) => e.transactionId === header.id),
          };
          enqueueChange(tx, ctx, {
            entity: 'transaction',
            recordId: header.id,
            op: header.deletedAt ? 'delete' : 'upsert',
            payload: aggregate,
            baseVersion: header.version,
          });
        }
      }

      const now = timestamp(ctx);
      const deleted: Category = { ...existing, deletedAt: now, updatedAt: now };
      tx.update(categories).set(deleted).where(eq(categories.id, id)).run();
      enqueueChange(tx, ctx, {
        entity: 'category',
        recordId: id,
        op: 'delete',
        payload: deleted,
        baseVersion: existing.version,
      });
    });
  }

  function hasAny(): boolean {
    return !!db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), isNull(categories.deletedAt)))
      .get();
  }

  /**
   * Copies the default category tree into the user's database (first-run setup).
   * Returns a map from default key to the created category id.
   */
  function seedDefaults(): Map<string, string> {
    const ids = new Map<string, string>();
    db.transaction((tx) => {
      const now = timestamp(ctx);
      const orderByKind: Record<CategoryKind, number> = { expense: 0, income: 0, system: 0 };
      const base = { userId, createdAt: now, updatedAt: now, deletedAt: null, version: 1 };

      for (const def of DEFAULT_CATEGORIES) {
        const parent: Category = {
          ...base,
          id: ctx.newId(),
          parentId: null,
          kind: def.kind,
          name: def.name,
          icon: def.icon,
          color: null,
          sortOrder: orderByKind[def.kind]++,
          isArchived: false,
        };
        write(tx, parent, null, true);
        ids.set(def.key, parent.id);

        def.children?.forEach((childDef, index) => {
          const child: Category = {
            ...base,
            id: ctx.newId(),
            parentId: parent.id,
            kind: def.kind,
            name: childDef.name,
            icon: childDef.icon,
            color: null,
            sortOrder: index,
            isArchived: false,
          };
          write(tx, child, null, true);
          ids.set(childDef.key, child.id);
        });
      }
    });
    return ids;
  }

  return { get, list, tree, create, update, setArchived, reorder, remove, hasAny, seedDefaults };
}

export type CategoriesRepository = ReturnType<typeof createCategoriesRepository>;
