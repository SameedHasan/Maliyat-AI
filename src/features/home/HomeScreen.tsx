import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LineChart } from '@/components/charts';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  MoneyText,
  Screen,
  SectionHeader,
  Stat,
  Surface,
  Text,
} from '@/components/ui';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { displayBalance } from '@/domain/accountForm';
import { addMonths, monthRange, toLocalDate } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { ACCOUNT_TYPE_ICONS } from '@/features/accounts/groups';
import { BASE_CURRENCY, netWorth } from '@/features/accounts/netWorth';
import { BudgetCard } from '@/features/budgets/BudgetCard';
import { loadLookups } from '@/features/shared/lookups';
import { openNewTransaction } from '@/features/transactions/AddTransactionSheet';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { usePreferences } from '@/store/preferences';
import { makeStyles, useTheme } from '@/theme';
import { formatMonth } from '@/utils/format';

import { compareMonthlySpending } from './spendingComparison';

const RECENT_COUNT = 5;
const ACCOUNT_PREVIEW = 4;
const BUDGET_PREVIEW = 3;

function greetingKey(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return 'home.greetingMorning' as const;
  if (hour < 17) return 'home.greetingAfternoon' as const;
  return 'home.greetingEvening' as const;
}

function loadHome(repos: Repositories) {
  const now = repos.ctx.now();
  const today = toLocalDate(now, repos.ctx.timeZone);
  const accounts = repos.accounts.list();
  const balances = repos.accounts.balances();
  const month = monthRange(today);
  const lastMonth = monthRange(addMonths(today, -1));
  const spending = compareMonthlySpending(
    repos.analytics.cashflowSeries(month, 'day').map((p) => p.expenseMinor),
    repos.analytics.cashflowSeries(lastMonth, 'day').map((p) => p.expenseMinor),
    today,
  );
  const budgets = repos.budgets
    .listWithStatus(today)
    .filter((b) => b.status !== null)
    .sort((a, b) => (b.status?.percentUsed ?? 0) - (a.status?.percentUsed ?? 0))
    .slice(0, BUDGET_PREVIEW);
  return {
    greeting: greetingKey(now),
    today,
    hasAccounts: accounts.length > 0,
    worth: netWorth(accounts, balances),
    changeThisMonth: repos.analytics.netChange(month, BASE_CURRENCY),
    month: repos.analytics.incomeExpense(month),
    spending,
    recent: repos.transactions.list({ limit: RECENT_COUNT }).items,
    accounts: accounts.slice(0, ACCOUNT_PREVIEW).map((account) => ({
      account,
      balanceMinor: balances.get(account.id) ?? 0,
    })),
    accountCount: accounts.length,
    budgets,
    lookups: loadLookups(repos),
  };
}

export function HomeScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const hideAmounts = usePreferences((s) => s.hideAmounts);
  const query = useLiveQuery(loadHome);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;

  const data = query.data;
  if (!data.hasAccounts) {
    return (
      <Screen>
        <EmptyState
          icon="wallet-outline"
          title={t('home.emptyTitle')}
          message={t('home.emptyBody')}
          action={{ label: t('accounts.add'), onPress: () => router.push('/accounts/new') }}
        />
      </Screen>
    );
  }

  const { spending } = data;
  const fmt = (minor: number) =>
    formatMoney({ amountMinor: minor, currency: BASE_CURRENCY }, { hide: hideAmounts });
  const spendingSummary = t('home.spendingSummary', {
    current: fmt(spending.currentToDateMinor),
    previous: fmt(spending.previousToDateMinor),
  });

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <Text variant="bodySmall" color="textSecondary">
          {t(data.greeting)}
        </Text>
        <Text variant="caption" color="textSecondary">
          {t('home.netWorth')}
        </Text>
        <MoneyText amountMinor={data.worth.netMinor} currency={BASE_CURRENCY} variant="display" />
        <View style={styles.inline}>
          <MoneyText
            amountMinor={data.changeThisMonth}
            currency={BASE_CURRENCY}
            variant="bodySmall"
            tone="signed"
          />
          <Text variant="bodySmall" color="textSecondary">
            {t('home.changeThisMonth')}
          </Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <View style={styles.flex}>
          <Button
            label={t('kinds.expense')}
            icon="arrow-up-outline"
            onPress={() => openNewTransaction('expense')}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={t('kinds.income')}
            icon="arrow-down-outline"
            variant="secondary"
            onPress={() => openNewTransaction('income')}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={t('kinds.transfer')}
            icon="swap-horizontal-outline"
            variant="secondary"
            onPress={() => openNewTransaction('transfer')}
          />
        </View>
      </View>

      <SectionHeader title={`${t('home.thisMonth')} · ${formatMonth(data.today)}`} />
      <Surface padded style={styles.card}>
        <View style={styles.row}>
          <Stat
            label={t('home.income')}
            value={
              <MoneyText
                amountMinor={data.month.incomeMinor}
                currency={BASE_CURRENCY}
                tone="signed"
              />
            }
          />
          <Stat
            label={t('home.spent')}
            value={
              <MoneyText
                amountMinor={0 - data.month.expenseMinor}
                currency={BASE_CURRENCY}
                tone="signed"
              />
            }
          />
        </View>
        <View>
          <Text variant="caption" color="textSecondary">
            {t('home.spendingVsLastMonth')}
          </Text>
          <LineChart
            height={120}
            series={[
              {
                key: 'previous',
                color: theme.colors.textMuted,
                values: spending.previous,
                dashed: true,
              },
              { key: 'current', color: theme.colors.expense, values: spending.current },
            ]}
            startLabel="1"
            endLabel={String(spending.current.length)}
            accessibilityLabel={spendingSummary}
          />
          <View style={styles.legend}>
            <LegendDot color={theme.colors.expense} label={t('home.thisMonthLegend')} />
            <LegendDot color={theme.colors.textMuted} label={t('home.lastMonthLegend')} />
          </View>
          <Text variant="caption" color="textMuted">
            {spendingSummary}
          </Text>
        </View>
      </Surface>

      <SectionHeader
        title={t('home.recent')}
        action={{ label: t('common.seeAll'), onPress: () => router.navigate('/transactions') }}
      />
      <Surface style={styles.list}>
        {data.recent.length === 0 ? (
          <EmptyState icon="receipt-outline" title={t('transactions.emptyTitle')} />
        ) : (
          data.recent.map((tx, index) => (
            <View key={tx.id}>
              {index > 0 ? <Divider inset /> : null}
              <TransactionRow transaction={tx} lookups={data.lookups} today={data.today} />
            </View>
          ))
        )}
      </Surface>

      <SectionHeader
        title={t('tabs.accounts')}
        action={
          data.accountCount > ACCOUNT_PREVIEW
            ? { label: t('common.seeAll'), onPress: () => router.navigate('/accounts') }
            : undefined
        }
      />
      <Surface style={styles.list}>
        {data.accounts.map(({ account, balanceMinor }, index) => (
          <View key={account.id}>
            {index > 0 ? <Divider inset /> : null}
            <ListItem
              icon={ACCOUNT_TYPE_ICONS[account.type]}
              title={account.name}
              subtitle={
                account.accountClass === 'liability'
                  ? t('accounts.owed')
                  : t(`accounts.types.${account.type}`)
              }
              onPress={() =>
                router.push({ pathname: '/accounts/[id]', params: { id: account.id } })
              }
              trailing={
                <MoneyText
                  amountMinor={displayBalance(account.type, balanceMinor)}
                  currency={account.currency}
                />
              }
            />
          </View>
        ))}
      </Surface>

      <SectionHeader
        title={t('budgets.title')}
        action={{ label: t('common.seeAll'), onPress: () => router.push('/budgets') }}
      />
      <Surface style={styles.list}>
        {data.budgets.length === 0 ? (
          <ListItem
            icon="add-circle-outline"
            title={t('budgets.add')}
            subtitle={t('budgets.emptyBody')}
            onPress={() => router.push('/budgets/new')}
          />
        ) : (
          data.budgets.map((budget, index) => (
            <View key={budget.id}>
              {index > 0 ? <Divider /> : null}
              <BudgetCard budget={budget} />
            </View>
          ))
        )}
      </Surface>
    </Screen>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  hero: { paddingHorizontal: t.spacing[4], paddingTop: t.spacing[6], gap: t.spacing[1] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[1] },
  quickActions: {
    flexDirection: 'row',
    gap: t.spacing[2],
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[4],
  },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: t.spacing[4] },
  card: { marginHorizontal: t.spacing[4], gap: t.spacing[4] },
  list: { marginHorizontal: t.spacing[4] },
  legend: { flexDirection: 'row', gap: t.spacing[4], marginTop: t.spacing[1] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[1] },
  dot: { width: t.spacing[2], height: t.spacing[2], borderRadius: t.radius.full },
}));
