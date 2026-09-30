import { router } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, MoneyText } from '@/components/ui';
import type { LocalDate } from '@/domain/dates';
import type { TransactionWithEntries } from '@/domain/types';
import type { Lookups } from '@/features/shared/lookups';
import { formatShortDate } from '@/utils/format';

import { describeTransaction } from './describeTransaction';

export interface TransactionRowProps {
  transaction: TransactionWithEntries;
  lookups: Lookups;
  today: LocalDate;
  /** Defaults to opening the transaction detail. */
  onPress?: () => void;
  /** Hide the date when rows are already grouped under a date header. */
  showDate?: boolean;
}

export const TransactionRow = memo(function TransactionRow({
  transaction,
  lookups,
  today,
  onPress,
  showDate = true,
}: TransactionRowProps) {
  const { t } = useTranslation();
  const summary = describeTransaction(transaction, lookups, (from, to) =>
    t('transactions.transferBetween', { from, to }),
  );
  const title = summary.title ?? t(`kinds.${summary.kind}`);
  const isSplit = transaction.kind !== 'transfer' && transaction.entries.length > 1;
  const subtitleParts = [
    isSplit
      ? t('transactions.splitCount', { count: transaction.entries.length })
      : summary.kind === 'expense' || summary.kind === 'income'
        ? summary.categoryName
        : null,
    summary.kind !== 'expense' && summary.kind !== 'income' ? t(`kinds.${summary.kind}`) : null,
    summary.accountLabel,
    showDate ? formatShortDate(transaction.occurredOn, today) : null,
  ].filter((part): part is string => !!part && part !== title);

  return (
    <ListItem
      icon={isSplit ? 'git-branch-outline' : summary.icon}
      title={title}
      subtitle={subtitleParts.join(' · ')}
      accessibilityHint={t('transactions.openHint')}
      onPress={
        onPress ??
        (() => router.push({ pathname: '/transactions/[id]', params: { id: transaction.id } }))
      }
      trailing={
        <MoneyText
          amountMinor={summary.amountMinor}
          currency={summary.currency}
          tone={summary.tone}
        />
      }
    />
  );
});
