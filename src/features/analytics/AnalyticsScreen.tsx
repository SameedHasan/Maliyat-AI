import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BarChart, DonutChart } from '@/components/charts';
import {
  BottomSheet,
  Button,
  Chip,
  DateField,
  Divider,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  ListItem,
  LoadingState,
  MoneyText,
  ProgressBar,
  Screen,
  SectionHeader,
  SegmentedControl,
  Stat,
  Surface,
  Text,
  type IconName,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { daysInRange, toLocalDate, type DateRange } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import {
  bucketFor,
  presetRange,
  previousRange,
  shiftPeriod,
  type Period,
  type PeriodPreset,
} from '@/domain/periods';
import { BASE_CURRENCY } from '@/features/accounts/netWorth';
import { categoryColor } from '@/features/categories/appearance';
import { usePreferences } from '@/store/preferences';
import { makeStyles, useTheme } from '@/theme';
import { formatMonthAbbrev, formatRange } from '@/utils/format';

import { percentChange, savingsRate, shareOf } from './metrics';

const PRESETS: readonly Exclude<PeriodPreset, 'custom'>[] = ['week', 'month', '3m', '6m', 'year'];
const MAX_CUSTOM_DAYS = 366 * 3;

type BreakdownKind = 'expense' | 'income';

function loadAnalytics(
  repos: Repositories,
  range: DateRange,
  kind: BreakdownKind,
  parentId: string | undefined,
) {
  const bucket = bucketFor(range);
  const previous = previousRange(range);
  return {
    summary: repos.analytics.incomeExpense(range),
    previousSummary: repos.analytics.incomeExpense(previous),
    bucket,
    series: repos.analytics.cashflowSeries(range, bucket),
    breakdown: repos.analytics.categoryBreakdown(range, kind, parentId),
    byAccount: repos.analytics.spendingByAccount(range),
    payees: repos.analytics.topPayees(range, 5),
    parent: parentId ? (repos.categories.get(parentId) ?? null) : null,
  };
}

export function AnalyticsScreen() {
  const repos = useRepositories();
  const [today] = useState(() => toLocalDate(repos.ctx.now(), repos.ctx.timeZone));
  const [period, setPeriod] = useState<Period>(() => ({
    preset: 'month',
    range: presetRange('month', today),
  }));
  const [kind, setKind] = useState<BreakdownKind>('expense');
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [customSheet, setCustomSheet] = useState(false);

  const load = useCallback(
    (r: Repositories) => loadAnalytics(r, period.range, kind, parentId),
    [period, kind, parentId],
  );
  const query = useLiveQuery(load);

  return (
    <Screen>
      <PeriodSelector
        period={period}
        today={today}
        onChange={(next) => {
          setPeriod(next);
          setParentId(undefined);
        }}
        onCustom={() => setCustomSheet(true)}
      />
      {query.status === 'loading' ? (
        <LoadingState />
      ) : query.status === 'error' ? (
        <ErrorState onRetry={query.reload} />
      ) : (
        <AnalyticsBody
          data={query.data}
          range={period.range}
          kind={kind}
          onKindChange={(next) => {
            setKind(next);
            setParentId(undefined);
          }}
          onDrill={setParentId}
        />
      )}
      <CustomRangeSheet
        visible={customSheet}
        initial={period.range}
        today={today}
        onClose={() => setCustomSheet(false)}
        onApply={(range) => {
          setPeriod({ preset: 'custom', range });
          setParentId(undefined);
          setCustomSheet(false);
        }}
      />
    </Screen>
  );
}

function PeriodSelector({
  period,
  today,
  onChange,
  onCustom,
}: {
  period: Period;
  today: string;
  onChange: (period: Period) => void;
  onCustom: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const next = shiftPeriod(period, 1);
  return (
    <View style={styles.periodBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {PRESETS.map((preset) => (
          <Chip
            key={preset}
            label={t(`periods.${preset}`)}
            selected={period.preset === preset}
            onPress={() => onChange({ preset, range: presetRange(preset, today) })}
          />
        ))}
        <Chip
          label={t('periods.custom')}
          icon="calendar-outline"
          selected={period.preset === 'custom'}
          onPress={onCustom}
        />
      </ScrollView>
      <View style={styles.rangeRow}>
        <IconButton
          icon="chevron-back"
          accessibilityLabel={t('periods.previous')}
          onPress={() => onChange(shiftPeriod(period, -1))}
        />
        <Text variant="heading" align="center" style={styles.rangeLabel} accessibilityRole="header">
          {formatRange(period.range.start, period.range.end)}
        </Text>
        <IconButton
          icon="chevron-forward"
          accessibilityLabel={t('periods.next')}
          onPress={() => onChange(next)}
          disabled={next.range.start > today}
        />
      </View>
    </View>
  );
}

function AnalyticsBody({
  data,
  range,
  kind,
  onKindChange,
  onDrill,
}: {
  data: ReturnType<typeof loadAnalytics>;
  range: DateRange;
  kind: BreakdownKind;
  onKindChange: (kind: BreakdownKind) => void;
  onDrill: (parentId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const hideAmounts = usePreferences((s) => s.hideAmounts);
  const fmt = (minor: number) =>
    formatMoney({ amountMinor: minor, currency: BASE_CURRENCY }, { hide: hideAmounts });

  const { summary, previousSummary, series, bucket, breakdown, byAccount, payees, parent } = data;
  const empty = summary.incomeMinor === 0 && summary.expenseMinor === 0;
  const rate = savingsRate(summary.incomeMinor, summary.expenseMinor);
  const spendingChange = percentChange(summary.expenseMinor, previousSummary.expenseMinor);
  const breakdownTotal = breakdown.reduce((total, c) => total + c.amountMinor, 0);
  const accountTotal = byAccount.reduce((total, a) => total + a.expenseMinor, 0);

  if (empty) {
    return (
      <EmptyState
        icon="pie-chart-outline"
        title={t('analytics.emptyTitle')}
        message={t('analytics.emptyPeriodBody')}
      />
    );
  }

  const barLabel = (key: string, index: number) => {
    if (bucket === 'month') {
      return series.length <= 12 || index % 2 === 0 ? formatMonthAbbrev(`${key}-01`) : '';
    }
    return index % 7 === 0 ? String(Number(key.slice(8, 10))) : '';
  };
  const trendSummary = t('analytics.trendSummary', {
    count: series.length,
    income: fmt(summary.incomeMinor),
    expense: fmt(summary.expenseMinor),
  });
  const donutSummary = breakdown
    .slice(0, 6)
    .map((c) => `${c.categoryName} ${shareOf(c.amountMinor, breakdownTotal)}%`)
    .join(', ');

  return (
    <ScrollView contentContainerStyle={styles.content}>
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
            hint={
              spendingChange !== null
                ? t('analytics.vsPrevious', {
                    change: `${spendingChange > 0 ? '+' : ''}${spendingChange}%`,
                  })
                : undefined
            }
          />
        </View>
        <View style={styles.row}>
          <Stat
            label={t('analytics.net')}
            value={
              <MoneyText amountMinor={summary.netMinor} currency={BASE_CURRENCY} tone="signed" />
            }
          />
          <Stat
            label={t('analytics.savingsRate')}
            value={<Text variant="mono">{rate !== null && !hideAmounts ? `${rate}%` : '—'}</Text>}
          />
        </View>
      </Surface>

      <SectionHeader title={t('analytics.incomeVsExpense')} />
      <Surface padded style={styles.card}>
        <BarChart
          data={series.map((point, index) => ({
            key: point.key,
            label: barLabel(point.key, index),
            values: [point.incomeMinor, point.expenseMinor],
          }))}
          colors={[theme.colors.income, theme.colors.expense]}
          accessibilityLabel={trendSummary}
        />
        <View style={styles.legend}>
          <Legend color={theme.colors.income} label={t('home.income')} />
          <Legend color={theme.colors.expense} label={t('home.spent')} />
        </View>
      </Surface>

      <SectionHeader title={t('analytics.breakdown')} />
      <View style={styles.section}>
        <SegmentedControl
          accessibilityLabel={t('analytics.breakdown')}
          options={[
            { value: 'expense', label: t('categories.expense') },
            { value: 'income', label: t('categories.income') },
          ]}
          value={kind}
          onChange={onKindChange}
        />
      </View>
      <Surface style={styles.list}>
        {parent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('analytics.backToAll')}
            onPress={() => onDrill(undefined)}
            style={styles.drillBack}>
            <Icon name="arrow-back" size="sm" color="primary" />
            <Text variant="bodySmall" color="primary">
              {t('analytics.allCategories')}
            </Text>
            <Text variant="bodySmall" color="textSecondary">
              › {parent.name}
            </Text>
          </Pressable>
        ) : null}
        {breakdown.length === 0 ? (
          <EmptyState icon="pie-chart-outline" title={t('analytics.noCategoryData')} />
        ) : (
          <>
            <View style={styles.donut}>
              <DonutChart
                segments={breakdown.map((c, index) => ({
                  key: c.categoryId,
                  value: c.amountMinor,
                  color: categoryColor(theme, c.color, index),
                }))}
                accessibilityLabel={donutSummary}>
                <Text variant="caption" color="textSecondary">
                  {t('analytics.total')}
                </Text>
                <MoneyText
                  amountMinor={breakdownTotal}
                  currency={BASE_CURRENCY}
                  variant="heading"
                />
              </DonutChart>
            </View>
            {breakdown.map((category, index) => {
              const share = shareOf(category.amountMinor, breakdownTotal);
              return (
                <View key={category.categoryId}>
                  <Divider />
                  <ListItem
                    icon={(category.icon ?? 'pricetag-outline') as IconName}
                    title={category.categoryName}
                    subtitle={t('analytics.shareOfTotal', { percent: share })}
                    accessibilityHint={category.hasChildren ? t('analytics.drillHint') : undefined}
                    onPress={category.hasChildren ? () => onDrill(category.categoryId) : undefined}
                    trailing={
                      <View style={styles.trailing}>
                        <MoneyText amountMinor={category.amountMinor} currency={BASE_CURRENCY} />
                        <View
                          style={[
                            styles.swatch,
                            { backgroundColor: categoryColor(theme, category.color, index) },
                          ]}
                        />
                      </View>
                    }
                  />
                </View>
              );
            })}
          </>
        )}
      </Surface>

      {byAccount.length > 0 ? (
        <>
          <SectionHeader title={t('analytics.byAccount')} />
          <Surface padded style={styles.card}>
            {byAccount.map((account) => {
              const share = shareOf(account.expenseMinor, accountTotal);
              return (
                <View key={account.accountId} style={styles.barRow}>
                  <View style={styles.barLabels}>
                    <Text variant="bodySmall" numberOfLines={1} style={styles.flex}>
                      {account.accountName}
                    </Text>
                    <MoneyText
                      amountMinor={account.expenseMinor}
                      currency={BASE_CURRENCY}
                      variant="bodySmall"
                    />
                  </View>
                  <ProgressBar
                    progress={share / 100}
                    accessibilityLabel={t('analytics.accountShare', {
                      name: account.accountName,
                      percent: share,
                    })}
                  />
                </View>
              );
            })}
          </Surface>
        </>
      ) : null}

      {payees.length > 0 ? (
        <>
          <SectionHeader title={t('analytics.topPayees')} />
          <Surface style={styles.list}>
            {payees.map((payee, index) => (
              <View key={payee.payee}>
                {index > 0 ? <Divider inset /> : null}
                <ListItem
                  icon="storefront-outline"
                  title={payee.payee}
                  subtitle={t('analytics.payeeCount', { count: payee.count })}
                  trailing={<MoneyText amountMinor={payee.expenseMinor} currency={BASE_CURRENCY} />}
                />
              </View>
            ))}
          </Surface>
        </>
      ) : null}

      <Text variant="caption" color="textMuted" style={styles.footnote}>
        {t('analytics.footnote', { days: daysInRange(range) })}
      </Text>
    </ScrollView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

function CustomRangeSheet({
  visible,
  initial,
  today,
  onClose,
  onApply,
}: {
  visible: boolean;
  initial: DateRange;
  today: string;
  onClose: () => void;
  onApply: (range: DateRange) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const invalid = end < start || daysInRange({ start, end }) > MAX_CUSTOM_DAYS;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('periods.custom')}>
      <View style={styles.sheetBody}>
        <DateField
          label={t('transactions.from')}
          value={start}
          displayValue={formatRange(start, start)}
          placeholder={t('transactions.from')}
          maximumDate={today}
          onChange={setStart}
        />
        <DateField
          label={t('transactions.to')}
          value={end}
          displayValue={formatRange(end, end)}
          placeholder={t('transactions.to')}
          minimumDate={start}
          onChange={setEnd}
          error={invalid ? t('periods.invalidRange') : null}
        />
        <Button
          label={t('common.apply')}
          icon="checkmark"
          disabled={invalid}
          onPress={() => onApply({ start, end })}
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  periodBar: { paddingTop: t.spacing[2], gap: t.spacing[1] },
  chips: { paddingHorizontal: t.spacing[4], gap: t.spacing[2] },
  rangeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing[2] },
  rangeLabel: { flex: 1 },
  content: { paddingBottom: t.spacing[8] },
  card: { marginHorizontal: t.spacing[4], gap: t.spacing[4] },
  list: { marginHorizontal: t.spacing[4] },
  section: { paddingHorizontal: t.spacing[4], paddingBottom: t.spacing[3] },
  row: { flexDirection: 'row', gap: t.spacing[4] },
  legend: { flexDirection: 'row', gap: t.spacing[4] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[1] },
  swatch: { width: t.spacing[3], height: t.spacing[3], borderRadius: t.radius.full },
  donut: { alignItems: 'center', paddingVertical: t.spacing[4] },
  drillBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[1],
    minHeight: t.touchTarget,
    paddingHorizontal: t.spacing[4],
  },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] },
  barRow: { gap: t.spacing[1] },
  barLabels: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] },
  flex: { flex: 1 },
  footnote: { paddingHorizontal: t.spacing[4], paddingTop: t.spacing[4] },
  sheetBody: { padding: t.spacing[4], gap: t.spacing[4] },
}));
