import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListItem,
  LoadingState,
  MoneyText,
  Screen,
  SectionHeader,
  Surface,
  Text,
  type IconName,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { toLocalDate } from '@/domain/dates';
import type { TransactionWithEntries } from '@/domain/types';
import { errorMessage } from '@/features/shared/errors';
import { loadLookups } from '@/features/shared/lookups';
import { showSnackbar } from '@/store/snackbar';
import { makeStyles } from '@/theme';
import { formatLongDate } from '@/utils/format';

import { describeTransaction } from './describeTransaction';
import { TransactionRow } from './TransactionRow';

const EDITABLE_KINDS = new Set(['expense', 'income', 'transfer', 'refund']);

function loadDetail(repos: Repositories, id: string) {
  const transaction = repos.transactions.get(id);
  if (!transaction) return null;
  return {
    transaction,
    today: toLocalDate(repos.ctx.now(), repos.ctx.timeZone),
    lookups: loadLookups(repos),
    original: transaction.refundOfId
      ? (repos.transactions.get(transaction.refundOfId) ?? null)
      : null,
    refunds: transaction.kind === 'expense' ? repos.transactions.refundsOf(id) : [],
  };
}

export function TransactionDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const load = useCallback((r: Repositories) => loadDetail(r, id), [id]);
  const query = useLiveQuery(load);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;
  if (!query.data) {
    return (
      <Screen>
        <EmptyState icon="receipt-outline" title={t('transactions.gone')} />
      </Screen>
    );
  }

  const { transaction: tx, today, lookups, original, refunds } = query.data;
  const summary = describeTransaction(tx, lookups, (from, to) =>
    t('transactions.transferBetween', { from, to }),
  );
  const editable = EDITABLE_KINDS.has(tx.kind);

  const remove = () => {
    try {
      repos.transactions.remove(tx.id);
      router.back();
      showSnackbar({
        message: t('transactions.deleted'),
        action: {
          label: t('common.undo'),
          onPress: () => {
            try {
              repos.transactions.restore(tx.id);
            } catch (error) {
              Alert.alert(t('states.errorTitle'), errorMessage(t, error));
            }
          },
        },
      });
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const entryTitle = (entry: TransactionWithEntries['entries'][number]) =>
    lookups.accounts.get(entry.accountId)?.name ?? '—';
  const entrySubtitle = (entry: TransactionWithEntries['entries'][number]) => {
    if (!entry.categoryId) {
      return tx.kind === 'transfer'
        ? entry.amountMinor < 0
          ? t('transactions.transferOut')
          : t('transactions.transferIn')
        : t(`kinds.${tx.kind}`);
    }
    const category = lookups.categories.get(entry.categoryId);
    const parent = category?.parentId ? lookups.categories.get(category.parentId) : undefined;
    return [parent?.name, category?.name].filter(Boolean).join(' › ');
  };

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: t(`kinds.${tx.kind}`),
          headerRight: editable
            ? () => (
                <IconButton
                  icon="create-outline"
                  accessibilityLabel={t('common.edit')}
                  onPress={() =>
                    router.push({ pathname: '/transactions/[id]/edit', params: { id: tx.id } })
                  }
                />
              )
            : undefined,
        }}
      />
      <View style={styles.hero}>
        <Text variant="heading">{summary.title ?? t(`kinds.${tx.kind}`)}</Text>
        <MoneyText
          amountMinor={summary.amountMinor}
          currency={summary.currency}
          tone={summary.tone}
          variant="display"
        />
        <Text variant="bodySmall" color="textSecondary">
          {formatLongDate(tx.occurredOn)}
        </Text>
        <View style={styles.badges}>
          <Badge label={t(`kinds.${tx.kind}`)} />
          <Badge label={t(`transactions.sources.${tx.source}`)} />
          {tx.entries.length > 1 && tx.kind !== 'transfer' ? (
            <Badge label={t('transactions.splitCount', { count: tx.entries.length })} />
          ) : null}
        </View>
      </View>

      <SectionHeader title={t('transactions.entries')} />
      <Surface style={styles.card}>
        {tx.entries.map((entry, index) => {
          const category = entry.categoryId ? lookups.categories.get(entry.categoryId) : undefined;
          return (
            <View key={entry.id}>
              {index > 0 ? <Divider inset /> : null}
              <ListItem
                icon={(category?.icon ?? 'wallet-outline') as IconName}
                title={entryTitle(entry)}
                subtitle={entrySubtitle(entry)}
                trailing={
                  <MoneyText
                    amountMinor={entry.amountMinor}
                    currency={entry.currency}
                    tone="signed"
                  />
                }
              />
            </View>
          );
        })}
      </Surface>

      {tx.notes ? (
        <>
          <SectionHeader title={t('transactions.fields.notes')} />
          <Surface padded style={styles.card}>
            <Text variant="body" selectable>
              {tx.notes}
            </Text>
          </Surface>
        </>
      ) : null}

      {original ? (
        <>
          <SectionHeader title={t('transactions.refundOf')} />
          <Surface style={styles.card}>
            <TransactionRow
              transaction={original}
              lookups={lookups}
              today={today}
              onPress={() =>
                router.push({ pathname: '/transactions/[id]', params: { id: original.id } })
              }
            />
          </Surface>
        </>
      ) : null}

      {refunds.length > 0 ? (
        <>
          <SectionHeader title={t('transactions.refunds')} />
          <Surface style={styles.card}>
            {refunds.map((refund, index) => (
              <View key={refund.id}>
                {index > 0 ? <Divider inset /> : null}
                <TransactionRow
                  transaction={refund}
                  lookups={lookups}
                  today={today}
                  onPress={() =>
                    router.push({ pathname: '/transactions/[id]', params: { id: refund.id } })
                  }
                />
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      <View style={styles.actions}>
        {editable ? (
          <Button
            label={t('common.edit')}
            icon="create-outline"
            onPress={() =>
              router.push({ pathname: '/transactions/[id]/edit', params: { id: tx.id } })
            }
          />
        ) : null}
        {editable && tx.kind !== 'refund' ? (
          <Button
            label={t('transactions.duplicate')}
            icon="copy-outline"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/transactions/new', params: { duplicateOf: tx.id } })
            }
          />
        ) : null}
        {tx.kind === 'expense' ? (
          <Button
            label={t('transactions.createRefund')}
            icon="return-down-back-outline"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/transactions/new', params: { refundOf: tx.id } })
            }
          />
        ) : null}
        <Button label={t('common.delete')} icon="trash-outline" variant="danger" onPress={remove} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  hero: { paddingHorizontal: t.spacing[4], paddingTop: t.spacing[6], gap: t.spacing[1] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2], marginTop: t.spacing[2] },
  card: { marginHorizontal: t.spacing[4] },
  actions: { padding: t.spacing[4], gap: t.spacing[3], marginTop: t.spacing[2] },
}));
