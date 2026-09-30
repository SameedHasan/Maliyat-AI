import type { LocalDate } from '@/domain/dates';
import type { TransactionWithEntries } from '@/domain/types';

export type TransactionListItem =
  | { type: 'header'; key: string; date: LocalDate; netMinor: number }
  | { type: 'transaction'; key: string; transaction: TransactionWithEntries };

/**
 * Inserts a header before each new date. Input must already be sorted newest first.
 * The header total is the day's income/expense effect; transfers net to zero and
 * are left out so moving money around never looks like spending.
 */
export function groupByDate(items: readonly TransactionWithEntries[]): TransactionListItem[] {
  const result: TransactionListItem[] = [];
  let header: Extract<TransactionListItem, { type: 'header' }> | null = null;
  for (const transaction of items) {
    if (!header || header.date !== transaction.occurredOn) {
      header = {
        type: 'header',
        key: `h-${transaction.occurredOn}`,
        date: transaction.occurredOn,
        netMinor: 0,
      };
      result.push(header);
    }
    if (transaction.kind !== 'transfer') {
      header.netMinor += transaction.entries.reduce((total, e) => total + e.amountMinor, 0);
    }
    result.push({ type: 'transaction', key: transaction.id, transaction });
  }
  return result;
}
