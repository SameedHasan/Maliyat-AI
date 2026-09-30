import type { ExportEntryRow } from '@/data/repositories';
import { toCsv, type CsvCell } from '@/domain/csv';
import { toDecimalString } from '@/domain/money';

export const EXPORT_HEADER = [
  'date',
  'type',
  'status',
  'account',
  'category',
  'subcategory',
  'amount',
  'currency',
  'payee',
  'notes',
  'source',
  'transaction_id',
] as const;

const AMOUNT_COLUMN = EXPORT_HEADER.indexOf('amount');

/** One CSV line per entry, so splits and transfers keep every leg. */
export function entriesToCsv(rows: readonly ExportEntryRow[]): string {
  const lines: CsvCell[][] = rows.map((row) => {
    const hasParent = row.parentCategoryName !== null;
    return [
      row.occurredOn,
      row.kind,
      row.status,
      row.accountName,
      hasParent ? row.parentCategoryName : row.categoryName,
      hasParent ? row.categoryName : null,
      toDecimalString({ amountMinor: row.amountMinor, currency: row.currency }),
      row.currency,
      row.payee,
      row.notes,
      row.source,
      row.transactionId,
    ];
  });
  return toCsv(EXPORT_HEADER, lines, new Set([AMOUNT_COLUMN]));
}

export function exportFileName(today: string): string {
  return `maliyat-transactions-${today}.csv`;
}
