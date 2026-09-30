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
  LoadingState,
  MoneyText,
  ProgressBar,
  Screen,
  SectionHeader,
  Stat,
  Surface,
  Text,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { toLocalDate } from '@/domain/dates';
import { errorMessage } from '@/features/shared/errors';
import { loadLookups } from '@/features/shared/lookups';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { showSnackbar } from '@/store/snackbar';
import { makeStyles } from '@/theme';
import { formatDate, formatRange } from '@/utils/format';

const TONES = { ok: 'primary', warning: 'warning', over: 'danger' } as const;
const TRANSACTION_LIMIT = 50;

function loadBudgetDetail(repos: Repositories, id: string) {
  const budget = repos.budgets.get(id);
  if (!budget) return null;
  const today = toLocalDate(repos.ctx.now(), repos.ctx.timeZone);
  const status = repos.budgets.statusOf(budget, today);
  return {
    budget,
    status,
    today,
    lookups: loadLookups(repos),
    transactions: status
      ? repos.transactions.list({
          limit: TRANSACTION_LIMIT,
          filters: {
            categoryIds: budget.categoryIds,
            from: status.range.start,
            to: status.range.end,
            kinds: ['expense', 'refund'],
          },
        }).items
      : [],
  };
}

export function BudgetDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const load = useCallback((r: Repositories) => loadBudgetDetail(r, id), [id]);
  const query = useLiveQuery(load);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;
  if (!query.data) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t('errors.not_found')} />
      </Screen>
    );
  }

  const { budget, status, today, lookups, transactions } = query.data;
  const currency = budget.currency;

  const remove = () =>
    Alert.alert(t('budgets.deleteTitle'), t('budgets.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          try {
            repos.budgets.remove(budget.id);
            showSnackbar({ message: t('budgets.deleted') });
            router.back();
          } catch (error) {
            Alert.alert(t('states.errorTitle'), errorMessage(t, error));
          }
        },
      },
    ]);

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: budget.name,
          headerRight: () => (
            <IconButton
              icon="create-outline"
              accessibilityLabel={t('common.edit')}
              onPress={() =>
                router.push({ pathname: '/budgets/[id]/edit', params: { id: budget.id } })
              }
            />
          ),
        }}
      />

      {status ? (
        <View style={styles.hero}>
          <Text variant="caption" color="textSecondary">
            {formatRange(status.range.start, status.range.end)}
          </Text>
          <Text variant="caption" color="textSecondary">
            {status.remainingMinor >= 0 ? t('budgets.remaining') : t('budgets.overspent')}
          </Text>
          <MoneyText
            amountMinor={Math.abs(status.remainingMinor)}
            currency={currency}
            variant="display"
          />
          <ProgressBar
            progress={status.percentUsed / 100}
            tone={TONES[status.state]}
            accessibilityLabel={t('budgets.percentUsed', { percent: status.percentUsed })}
          />
          <Text variant="bodySmall" color="textSecondary">
            {t('budgets.percentUsed', { percent: status.percentUsed })}
          </Text>
        </View>
      ) : (
        <EmptyState
          icon="time-outline"
          title={t('budgets.inactive')}
          message={t('budgets.notActiveBody')}
        />
      )}

      {status ? (
        <Surface padded style={styles.card}>
          <View style={styles.row}>
            <Stat
              label={t('budgets.budget')}
              value={<MoneyText amountMinor={status.budgetMinor} currency={currency} />}
            />
            <Stat
              label={t('budgets.spent')}
              value={<MoneyText amountMinor={status.spentMinor} currency={currency} />}
            />
          </View>
          {budget.rollover ? (
            <View style={styles.row}>
              <Stat
                label={t('budgets.carryOver')}
                value={
                  <MoneyText
                    amountMinor={status.carryOverMinor}
                    currency={currency}
                    tone="signed"
                  />
                }
              />
              <Stat
                label={t('budgets.available')}
                value={<MoneyText amountMinor={status.availableMinor} currency={currency} />}
              />
            </View>
          ) : null}
        </Surface>
      ) : null}

      <SectionHeader title={t('budgets.details')} />
      <Surface padded style={styles.card}>
        <Text variant="bodySmall" color="textSecondary">
          {t(`budgets.periods.${budget.period}`)}
          {budget.period === 'custom' && budget.endOn
            ? ` · ${formatRange(budget.startOn, budget.endOn)}`
            : ` · ${t('budgets.since', { date: formatDate(budget.startOn) })}`}
          {budget.rollover ? ` · ${t('budgets.rolloverOn')}` : ''}
        </Text>
        <View style={styles.chips}>
          {budget.categoryIds.map((categoryId) => (
            <Badge key={categoryId} label={lookups.categories.get(categoryId)?.name ?? '—'} />
          ))}
        </View>
        <Text variant="caption" color="textMuted">
          {t('budgets.alertsAt', {
            thresholds: budget.alertThresholds.map((v) => `${v}%`).join(', '),
          })}
        </Text>
      </Surface>

      {status ? (
        <>
          <SectionHeader title={t('budgets.transactions')} />
          <Surface style={styles.list}>
            {transactions.length === 0 ? (
              <EmptyState icon="receipt-outline" title={t('budgets.noSpending')} />
            ) : (
              transactions.map((tx, index) => (
                <View key={tx.id}>
                  {index > 0 ? <Divider inset /> : null}
                  <TransactionRow transaction={tx} lookups={lookups} today={today} />
                </View>
              ))
            )}
          </Surface>
        </>
      ) : null}

      <View style={styles.footer}>
        <Button label={t('common.delete')} icon="trash-outline" variant="danger" onPress={remove} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  hero: { paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[6], gap: t.spacing[2] },
  card: { marginHorizontal: t.spacing[4], gap: t.spacing[3] },
  list: { marginHorizontal: t.spacing[4] },
  row: { flexDirection: 'row', gap: t.spacing[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2] },
  footer: { padding: t.spacing[4], marginTop: t.spacing[4] },
}));
