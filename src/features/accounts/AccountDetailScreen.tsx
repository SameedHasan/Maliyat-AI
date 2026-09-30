import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LineChart } from '@/components/charts';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  MoneyText,
  Screen,
  SectionHeader,
  Stat,
  Surface,
  Text,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { displayBalance } from '@/domain/accountForm';
import { monthRange, toLocalDate } from '@/domain/dates';
import { availableCredit } from '@/domain/ledger';
import { money } from '@/domain/money';
import { errorMessage } from '@/features/shared/errors';
import { loadLookups } from '@/features/shared/lookups';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { showSnackbar } from '@/store/snackbar';
import { useTransactionFilters } from '@/store/transactionFilters';
import { makeStyles, useTheme } from '@/theme';
import { formatMonth, formatMonthShort } from '@/utils/format';

const HISTORY_MONTHS = 12;
const RECENT_COUNT = 10;

function loadAccountDetail(repos: Repositories, id: string) {
  const account = repos.accounts.get(id);
  if (!account) return null;
  const today = toLocalDate(repos.ctx.now(), repos.ctx.timeZone);
  return {
    account,
    today,
    balanceMinor: repos.accounts.balanceOf(id),
    activity: repos.accounts.activity(id, monthRange(today)),
    history: repos.accounts.balanceHistory(id, today, HISTORY_MONTHS),
    recent: repos.transactions.list({ limit: RECENT_COUNT, filters: { accountIds: [id] } }).items,
    hasHistory: repos.accounts.hasHistory(id),
    lookups: loadLookups(repos),
  };
}

export function AccountDetailScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const repos = useRepositories();
  const setFilters = useTransactionFilters((s) => s.setFilters);
  const load = useCallback((r: Repositories) => loadAccountDetail(r, id), [id]);
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

  const { account, today, balanceMinor, activity, history, recent, hasHistory, lookups } =
    query.data;
  const currency = account.currency;
  const isLiability = account.accountClass === 'liability';
  const shown = displayBalance(account.type, balanceMinor);
  const credit =
    account.type === 'credit_card' && account.creditLimitMinor !== null
      ? availableCredit(money(account.creditLimitMinor, currency), money(balanceMinor, currency))
      : null;
  const details = [
    t(`accounts.types.${account.type}`),
    account.institution,
    account.last4 ? `•• ${account.last4}` : null,
  ].filter(Boolean);

  const archive = () => {
    try {
      repos.accounts.setArchived(account.id, !account.isArchived);
      showSnackbar({
        message: account.isArchived ? t('accounts.unarchived') : t('accounts.archivedDone'),
      });
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const remove = () =>
    Alert.alert(t('accounts.deleteTitle'), t('accounts.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          try {
            repos.accounts.remove(account.id);
            router.back();
          } catch (error) {
            Alert.alert(t('states.errorTitle'), errorMessage(t, error));
          }
        },
      },
    ]);

  const first = history[0];
  const last = history[history.length - 1];
  const historySummary = t('accounts.historySummary', {
    count: history.length,
    start: first ? formatMonth(`${first.month}-01`) : '',
    end: last ? formatMonth(`${last.month}-01`) : '',
  });

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: account.name,
          headerRight: () => (
            <IconButton
              icon="create-outline"
              accessibilityLabel={t('accounts.edit')}
              onPress={() =>
                router.push({ pathname: '/accounts/[id]/edit', params: { id: account.id } })
              }
            />
          ),
        }}
      />
      <View style={styles.hero}>
        <Text variant="caption" color="textSecondary">
          {details.join(' · ')}
          {account.isArchived ? ` · ${t('accounts.archived')}` : ''}
        </Text>
        <Text variant="caption" color="textSecondary">
          {isLiability ? t('accounts.amountOwed') : t('accounts.balance')}
        </Text>
        <MoneyText amountMinor={shown} currency={currency} variant="display" />
        {credit ? (
          <Text variant="bodySmall" color="textSecondary">
            {t('accounts.availableCreditLabel')}{' '}
            <MoneyText amountMinor={credit.amountMinor} currency={currency} variant="bodySmall" />
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label={t('accounts.addTransaction')}
            icon="add"
            onPress={() =>
              router.push({
                pathname: '/transactions/new',
                params: { kind: 'expense', accountId: account.id },
              })
            }
          />
        </View>
        <View style={styles.action}>
          <Button
            label={t('accounts.reconcile')}
            icon="checkmark-done-outline"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/accounts/[id]/reconcile', params: { id: account.id } })
            }
          />
        </View>
      </View>

      <SectionHeader title={`${t('home.thisMonth')} · ${formatMonth(today)}`} />
      <Surface padded style={styles.card}>
        <View style={styles.row}>
          <Stat
            label={t('home.income')}
            value={<MoneyText amountMinor={activity.incomeMinor} currency={currency} />}
          />
          <Stat
            label={t('home.spent')}
            value={<MoneyText amountMinor={activity.expenseMinor} currency={currency} />}
          />
        </View>
        <View style={styles.row}>
          <Stat
            label={t('accounts.transfersIn')}
            value={<MoneyText amountMinor={activity.transfersInMinor} currency={currency} />}
          />
          <Stat
            label={t('accounts.transfersOut')}
            value={<MoneyText amountMinor={activity.transfersOutMinor} currency={currency} />}
          />
        </View>
      </Surface>

      {hasHistory ? (
        <>
          <SectionHeader title={t('accounts.balanceHistory')} />
          <Surface padded style={styles.card}>
            <LineChart
              series={[
                {
                  key: 'balance',
                  color: theme.colors.primary,
                  values: history.map((p) => displayBalance(account.type, p.balanceMinor)),
                },
              ]}
              startLabel={first ? formatMonthShort(`${first.month}-01`) : undefined}
              endLabel={last ? formatMonthShort(`${last.month}-01`) : undefined}
              accessibilityLabel={historySummary}
            />
          </Surface>
        </>
      ) : null}

      <SectionHeader
        title={t('accounts.recent')}
        action={
          recent.length > 0
            ? {
                label: t('common.seeAll'),
                onPress: () => {
                  setFilters({ accountIds: [account.id] });
                  router.navigate('/transactions');
                },
              }
            : undefined
        }
      />
      <Surface style={styles.list}>
        {recent.length === 0 ? (
          <EmptyState icon="receipt-outline" title={t('transactions.emptyTitle')} />
        ) : (
          recent.map((tx, index) => (
            <View key={tx.id}>
              {index > 0 ? <Divider inset /> : null}
              <TransactionRow transaction={tx} lookups={lookups} today={today} />
            </View>
          ))
        )}
      </Surface>

      <View style={styles.footer}>
        <Button
          label={account.isArchived ? t('accounts.unarchive') : t('accounts.archive')}
          icon="archive-outline"
          variant="secondary"
          onPress={archive}
        />
        {!hasHistory ? (
          <Button
            label={t('common.delete')}
            icon="trash-outline"
            variant="danger"
            onPress={remove}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  hero: { paddingHorizontal: t.spacing[4], paddingTop: t.spacing[6], gap: t.spacing[1] },
  actions: {
    flexDirection: 'row',
    gap: t.spacing[3],
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[4],
  },
  action: { flex: 1 },
  card: { marginHorizontal: t.spacing[4], gap: t.spacing[4] },
  list: { marginHorizontal: t.spacing[4] },
  row: { flexDirection: 'row', gap: t.spacing[4] },
  footer: { padding: t.spacing[4], gap: t.spacing[3], marginTop: t.spacing[4] },
}));
