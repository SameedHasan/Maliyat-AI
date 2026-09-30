import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Divider,
  EmptyState,
  ErrorState,
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
import { monthRange, toLocalDate } from '@/domain/dates';
import { BASE_CURRENCY, netWorth } from '@/features/accounts/netWorth';
import { loadLookups } from '@/features/shared/lookups';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { makeStyles } from '@/theme';
import { formatMonth } from '@/utils/format';

function loadHome(repos: Repositories) {
  const today = toLocalDate(repos.ctx.now(), repos.ctx.timeZone);
  const accounts = repos.accounts.list();
  return {
    today,
    hasAccounts: accounts.length > 0,
    worth: netWorth(accounts, repos.accounts.balances()),
    month: repos.analytics.incomeExpense(monthRange(today)),
    recent: repos.transactions.list({ limit: 6 }).items,
    lookups: loadLookups(repos),
  };
}

export function HomeScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const query = useLiveQuery(loadHome);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;

  const { today, hasAccounts, worth, month, recent, lookups } = query.data;
  if (!hasAccounts) {
    return (
      <Screen>
        <EmptyState
          icon="wallet-outline"
          title={t('home.emptyTitle')}
          message={t('home.emptyBody')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <Text variant="caption" color="textSecondary">
          {t('home.netWorth')}
        </Text>
        <MoneyText amountMinor={worth.netMinor} currency={BASE_CURRENCY} variant="display" />
        <View style={styles.row}>
          <Stat
            label={t('home.assets')}
            value={<MoneyText amountMinor={worth.assetsMinor} currency={BASE_CURRENCY} />}
          />
          <Stat
            label={t('home.liabilities')}
            value={<MoneyText amountMinor={worth.liabilitiesMinor} currency={BASE_CURRENCY} />}
          />
        </View>
      </View>

      <SectionHeader title={`${t('home.thisMonth')} · ${formatMonth(today)}`} />
      <Surface padded style={styles.card}>
        <View style={styles.row}>
          <Stat
            label={t('home.income')}
            value={
              <MoneyText amountMinor={month.incomeMinor} currency={BASE_CURRENCY} tone="signed" />
            }
          />
          <Stat
            label={t('home.spent')}
            value={
              <MoneyText
                amountMinor={0 - month.expenseMinor}
                currency={BASE_CURRENCY}
                tone="signed"
              />
            }
          />
        </View>
      </Surface>

      <SectionHeader
        title={t('home.recent')}
        action={{ label: t('common.seeAll'), onPress: () => router.navigate('/transactions') }}
      />
      <Surface style={styles.card}>
        {recent.map((tx, index) => (
          <View key={tx.id}>
            {index > 0 ? <Divider inset /> : null}
            <TransactionRow transaction={tx} lookups={lookups} today={today} />
          </View>
        ))}
      </Surface>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  hero: {
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[6],
    gap: t.spacing[2],
  },
  row: { flexDirection: 'row', gap: t.spacing[4], marginTop: t.spacing[2] },
  card: { marginHorizontal: t.spacing[4] },
}));
