import { and, eq } from 'drizzle-orm';

import { outbox, type OutboxEntity } from '@/db/schema';
import type { DbExecutor } from '@/db/types';

import { timestamp, type RepoContext } from './context';

export interface OutboxChange {
  entity: OutboxEntity;
  recordId: string;
  op: 'upsert' | 'delete';
  payload: unknown;
  /** Server version the change was based on; null for records never synced. */
  baseVersion: number | null;
}

/**
 * Queues a change for the sync engine. Must be called inside the same transaction as the
 * data write. A still-pending change for the same record is replaced rather than
 * duplicated, keeping its original base version so conflict detection stays correct.
 */
export function enqueueChange(tx: DbExecutor, ctx: RepoContext, change: OutboxChange): void {
  const existing = tx
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      and(
        eq(outbox.entity, change.entity),
        eq(outbox.recordId, change.recordId),
        eq(outbox.status, 'pending'),
      ),
    )
    .get();

  if (existing) {
    tx.update(outbox)
      .set({ op: change.op, payload: change.payload })
      .where(eq(outbox.id, existing.id))
      .run();
    return;
  }

  tx.insert(outbox)
    .values({
      id: ctx.newId(),
      entity: change.entity,
      recordId: change.recordId,
      op: change.op,
      payload: change.payload,
      baseVersion: change.baseVersion,
      createdAt: timestamp(ctx),
    })
    .run();
}
