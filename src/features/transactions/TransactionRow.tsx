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
}

export const TransactionRow = memo(function TransactionRow({
  transaction,
  lookups,
  today,
}: TransactionRowProps) {
  const { t } = useTranslation();
  const summary = describeTransaction(transaction, lookups, (from, to) =>
    t('transactions.transferBetween', { from, to }),
  );
  const title = summary.title ?? t(`kinds.${summary.kind}`);
  const date = formatShortDate(transaction.occurredOn, today);
  const subtitleParts = [
    summary.kind === 'expense' || summary.kind === 'income' ? summary.categoryName : null,
    summary.kind !== 'expense' && summary.kind !== 'income' ? t(`kinds.${summary.kind}`) : null,
    summary.accountLabel,
    date,
  ].filter((part): part is string => !!part && part !== title);

  return (
    <ListItem
      icon={summary.icon}
      title={title}
      subtitle={subtitleParts.join(' · ')}
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
