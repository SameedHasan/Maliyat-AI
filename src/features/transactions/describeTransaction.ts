import type { IconName } from '@/components/ui';
import type { CurrencyCode } from '@/domain/money';
import type { TransactionKind, TransactionWithEntries } from '@/domain/types';
import type { Lookups } from '@/features/shared/lookups';

export interface TransactionSummary {
  /** Payee if set, otherwise the category name; null means "use the kind label". */
  title: string | null;
  categoryName: string | null;
  accountLabel: string;
  /** For transfers: the amount moved (positive, fee excluded). Otherwise the net effect. */
  amountMinor: number;
  currency: CurrencyCode;
  tone: 'signed' | 'neutral';
  icon: IconName;
  kind: TransactionKind;
}

const KIND_ICONS: Record<TransactionKind, IconName> = {
  expense: 'arrow-up-outline',
  income: 'arrow-down-outline',
  transfer: 'swap-horizontal-outline',
  refund: 'return-down-back-outline',
  adjustment: 'construct-outline',
  opening_balance: 'flag-outline',
};

export function describeTransaction(
  tx: TransactionWithEntries,
  lookups: Lookups,
  formatTransfer: (from: string, to: string) => string,
): TransactionSummary {
  const accountName = (id: string) => lookups.accounts.get(id)?.name ?? '—';
  const first = tx.entries[0];
  const currency = (first?.currency ?? 'PKR') as CurrencyCode;

  if (tx.kind === 'transfer') {
    const legs = tx.entries.filter((e) => e.categoryId === null);
    const from = legs.find((e) => e.amountMinor < 0);
    const to = legs.find((e) => e.amountMinor > 0);
    return {
      title: tx.payee,
      categoryName: null,
      accountLabel: formatTransfer(
        from ? accountName(from.accountId) : '—',
        to ? accountName(to.accountId) : '—',
      ),
      amountMinor: to?.amountMinor ?? 0,
      currency,
      tone: 'neutral',
      icon: KIND_ICONS.transfer,
      kind: tx.kind,
    };
  }

  const category = first?.categoryId ? lookups.categories.get(first.categoryId) : undefined;
  const parent = category?.parentId ? lookups.categories.get(category.parentId) : undefined;
  const icon = (category?.icon ?? parent?.icon ?? KIND_ICONS[tx.kind]) as IconName;
  const amountMinor = tx.entries.reduce((total, e) => total + e.amountMinor, 0);

  return {
    title: tx.payee ?? category?.name ?? null,
    categoryName: category?.name ?? null,
    accountLabel: first ? accountName(first.accountId) : '—',
    amountMinor,
    currency,
    tone: 'signed',
    icon,
    kind: tx.kind,
  };
}
