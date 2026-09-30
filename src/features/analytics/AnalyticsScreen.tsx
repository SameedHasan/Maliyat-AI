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
import { BASE_CURRENCY } from '@/features/accounts/netWorth';
import { makeStyles, useTheme } from '@/theme';
import { formatMonth } from '@/utils/format';

const TOP_CATEGORY_COUNT = 6;

function loadAnalytics(repos: Repositories) {
  const today = toLocalDate(repos.ctx.now(), repos.ctx.timeZone);
  const range = monthRange(today);
  const byCategory = repos.analytics
    .spendingByCategory(range)
    .filter((c) => c.expenseMinor > 0)
    .sort((a, b) => b.expenseMinor - a.expenseMinor);
  return {
    today,
    summary: repos.analytics.incomeExpense(range),
    top: byCategory.slice(0, TOP_CATEGORY_COUNT),
    totalSpend: byCategory.reduce((total, c) => total + c.expenseMinor, 0),
  };
}

export function AnalyticsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const query = useLiveQuery(loadAnalytics);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;

  const { today, summary, top, totalSpend } = query.data;
  if (summary.incomeMinor === 0 && summary.expenseMinor === 0) {
    return (
      <Screen>
        <EmptyState
          icon="stats-chart-outline"
          title={t('analytics.emptyTitle')}
          message={t('analytics.emptyBody')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <SectionHeader title={`${t('analytics.incomeVsExpense')} · ${formatMonth(today)}`} />
      <Surface padded style={styles.card}>
        <View style={styles.row}>
          <Stat
            label={t('home.income')}
            value={
              <MoneyText amountMinor={summary.incomeMinor} currency={BASE_CURRENCY} tone="signed" />
            }
          />
          <Stat
            label={t('home.spent')}
            value={
              <MoneyText
                amountMinor={0 - summary.expenseMinor}
                currency={BASE_CURRENCY}
                tone="signed"
              />
            }
          />
          <Stat
            label={t('analytics.net')}
            value={
              <MoneyText amountMinor={summary.netMinor} currency={BASE_CURRENCY} tone="signed" />
            }
          />
        </View>
      </Surface>

      {top.length > 0 ? (
        <>
          <SectionHeader title={t('analytics.topCategories')} />
          <Surface style={styles.card}>
            {top.map((category, index) => {
              const share = totalSpend > 0 ? category.expenseMinor / totalSpend : 0;
              const percent = Math.round(share * 100);
              return (
                <View key={category.categoryId}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.categoryRow}>
                    <View style={styles.categoryHeader}>
                      <Text variant="body" numberOfLines={1} style={styles.categoryName}>
                        {category.categoryName}
                      </Text>
                      <MoneyText amountMinor={category.expenseMinor} currency={BASE_CURRENCY} />
                    </View>
                    <View
                      style={styles.track}
                      accessible
                      accessibilityLabel={t('analytics.shareOfSpending', { percent })}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: `${Math.max(share * 100, 2)}%`,
                            backgroundColor:
                              theme.colors.charts[index % theme.colors.charts.length],
                          },
                        ]}
                      />
                    </View>
                    <Text variant="caption" color="textMuted">
                      {t('analytics.shareOfSpending', { percent })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Surface>
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: { marginHorizontal: t.spacing[4] },
  row: { flexDirection: 'row', gap: t.spacing[4] },
  categoryRow: { padding: t.spacing[4], gap: t.spacing[2] },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[3] },
  categoryName: { flex: 1 },
  track: {
    height: t.spacing[2],
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceAlt,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: t.radius.full },
}));
