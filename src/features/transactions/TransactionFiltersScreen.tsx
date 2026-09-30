import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AmountInput,
  Button,
  Chip,
  DateField,
  ErrorState,
  LoadingState,
  Screen,
  SectionHeader,
  SelectField,
  Text,
} from '@/components/ui';
import type { Repositories, TransactionFilters } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { addMonths, monthRange, toLocalDate, type LocalDate } from '@/domain/dates';
import { parseMoneyInput } from '@/domain/money';
import { presetRange } from '@/domain/periods';
import { amountToInput } from '@/domain/transactionForm';
import {
  TRANSACTION_KINDS,
  TRANSACTION_SOURCES,
  type TransactionKind,
  type TransactionSource,
} from '@/domain/types';
import { BASE_CURRENCY } from '@/features/accounts/netWorth';
import { CategoryPicker } from '@/features/shared/CategoryPicker';
import { useTransactionFilters } from '@/store/transactionFilters';
import { makeStyles } from '@/theme';
import { formatDate } from '@/utils/format';

const USER_SOURCES = TRANSACTION_SOURCES.filter((s) => s !== 'seed');

function loadFilterOptions(repos: Repositories) {
  const expense = repos.categories.tree('expense', { includeArchived: true });
  const income = repos.categories.tree('income', { includeArchived: true });
  return {
    today: toLocalDate(repos.ctx.now(), repos.ctx.timeZone),
    accounts: repos.accounts.list({ includeArchived: true }),
    tree: [...expense, ...income],
  };
}

function toggle<T>(list: readonly T[] | undefined, value: T): T[] | undefined {
  const current = list ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return next.length > 0 ? next : undefined;
}

export function TransactionFiltersScreen() {
  const query = useLiveQuery(loadFilterOptions);
  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;
  return <FiltersForm {...query.data} />;
}

function FiltersForm({ today, accounts, tree }: ReturnType<typeof loadFilterOptions>) {
  const { t } = useTranslation();
  const styles = useStyles();
  const applied = useTransactionFilters((s) => s.filters);
  const setFilters = useTransactionFilters((s) => s.setFilters);
  const [draft, setDraft] = useState<TransactionFilters>(applied);
  const [minText, setMinText] = useState(
    applied.minAmountMinor !== undefined
      ? amountToInput(applied.minAmountMinor, BASE_CURRENCY)
      : '',
  );
  const [maxText, setMaxText] = useState(
    applied.maxAmountMinor !== undefined
      ? amountToInput(applied.maxAmountMinor, BASE_CURRENCY)
      : '',
  );
  const [amountError, setAmountError] = useState<string | null>(null);
  const [categorySheet, setCategorySheet] = useState(false);

  const update = (patch: Partial<TransactionFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const setRange = (from?: LocalDate, to?: LocalDate) => update({ from, to });

  const lastMonth = monthRange(addMonths(today, -1));
  const datePresets = [
    { key: 'month', label: t('periods.month'), range: presetRange('month', today) },
    { key: 'lastMonth', label: t('periods.lastMonth'), range: lastMonth },
    { key: '3m', label: t('periods.3m'), range: presetRange('3m', today) },
    { key: 'year', label: t('periods.year'), range: presetRange('year', today) },
  ];

  const categoryName = (id: string) => {
    for (const parent of tree) {
      if (parent.id === id) return parent.name;
      const child = parent.children.find((c) => c.id === id);
      if (child) return `${parent.name} › ${child.name}`;
    }
    return '—';
  };

  const parseAmount = (text: string): number | undefined | null => {
    if (text.trim() === '') return undefined;
    const parsed = parseMoneyInput(text, BASE_CURRENCY);
    return parsed.ok && parsed.money.amountMinor >= 0 ? parsed.money.amountMinor : null;
  };

  const apply = () => {
    const min = parseAmount(minText);
    const max = parseAmount(maxText);
    if (min === null || max === null || (min !== undefined && max !== undefined && min > max)) {
      setAmountError(t('transactions.filtersInvalidAmount'));
      return;
    }
    setFilters({ ...draft, minAmountMinor: min, maxAmountMinor: max, search: undefined });
    router.back();
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('transactions.filters') }} />

      <SectionHeader title={t('transactions.fields.date')} />
      <View style={styles.section}>
        <View style={styles.chips}>
          <Chip
            label={t('periods.all')}
            selected={!draft.from && !draft.to}
            onPress={() => setRange(undefined, undefined)}
          />
          {datePresets.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              selected={draft.from === preset.range.start && draft.to === preset.range.end}
              onPress={() => setRange(preset.range.start, preset.range.end)}
            />
          ))}
        </View>
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField
              label={t('transactions.from')}
              value={draft.from ?? null}
              displayValue={draft.from ? formatDate(draft.from) : null}
              placeholder={t('transactions.anyDate')}
              maximumDate={draft.to}
              onChange={(from) => update({ from })}
            />
          </View>
          <View style={styles.flex}>
            <DateField
              label={t('transactions.to')}
              value={draft.to ?? null}
              displayValue={draft.to ? formatDate(draft.to) : null}
              placeholder={t('transactions.anyDate')}
              minimumDate={draft.from}
              onChange={(to) => update({ to })}
            />
          </View>
        </View>
      </View>

      <SectionHeader title={t('transactions.fields.kind')} />
      <View style={[styles.section, styles.chips]}>
        {TRANSACTION_KINDS.map((kind: TransactionKind) => (
          <Chip
            key={kind}
            label={t(`kinds.${kind}`)}
            selected={draft.kinds?.includes(kind) ?? false}
            onPress={() => update({ kinds: toggle(draft.kinds, kind) })}
          />
        ))}
      </View>

      <SectionHeader title={t('tabs.accounts')} />
      <View style={[styles.section, styles.chips]}>
        {accounts.map((account) => (
          <Chip
            key={account.id}
            label={account.name}
            selected={draft.accountIds?.includes(account.id) ?? false}
            onPress={() => update({ accountIds: toggle(draft.accountIds, account.id) })}
          />
        ))}
      </View>

      <SectionHeader title={t('transactions.fields.category')} />
      <View style={styles.section}>
        {draft.categoryIds?.length ? (
          <View style={styles.chips}>
            {draft.categoryIds.map((id) => (
              <Chip
                key={id}
                label={categoryName(id)}
                icon="close"
                selected
                accessibilityHint={t('transactions.removeFilterHint')}
                onPress={() => update({ categoryIds: toggle(draft.categoryIds, id) })}
              />
            ))}
          </View>
        ) : null}
        <SelectField
          label={t('transactions.addCategoryFilter')}
          value={null}
          placeholder={t('transactions.fields.chooseCategory')}
          icon="pricetag-outline"
          onPress={() => setCategorySheet(true)}
        />
        <Text variant="caption" color="textMuted">
          {t('transactions.categoryFilterHint')}
        </Text>
      </View>

      <SectionHeader title={t('transactions.amountRange')} />
      <View style={[styles.section, styles.row]}>
        <View style={styles.flex}>
          <AmountInput
            label={t('transactions.minAmount')}
            value={minText}
            onChangeText={(text) => {
              setMinText(text);
              setAmountError(null);
            }}
            currency={BASE_CURRENCY}
            placeholder={t('common.optional')}
          />
        </View>
        <View style={styles.flex}>
          <AmountInput
            label={t('transactions.maxAmount')}
            value={maxText}
            onChangeText={(text) => {
              setMaxText(text);
              setAmountError(null);
            }}
            currency={BASE_CURRENCY}
            placeholder={t('common.optional')}
          />
        </View>
      </View>
      {amountError ? (
        <View style={styles.section}>
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {amountError}
          </Text>
        </View>
      ) : null}

      <SectionHeader title={t('transactions.source')} />
      <View style={[styles.section, styles.chips]}>
        {USER_SOURCES.map((source: TransactionSource) => (
          <Chip
            key={source}
            label={t(`transactions.sources.${source}`)}
            selected={draft.sources?.includes(source) ?? false}
            onPress={() => update({ sources: toggle(draft.sources, source) })}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <Button label={t('transactions.applyFilters')} icon="checkmark" onPress={apply} />
        <Button
          label={t('transactions.resetFilters')}
          variant="secondary"
          onPress={() => {
            setDraft({});
            setMinText('');
            setMaxText('');
            setAmountError(null);
          }}
        />
      </View>

      <CategoryPicker
        visible={categorySheet}
        onClose={() => setCategorySheet(false)}
        title={t('transactions.fields.category')}
        tree={tree}
        selectedId={null}
        onSelect={(id) =>
          update({
            categoryIds: draft.categoryIds?.includes(id)
              ? draft.categoryIds
              : [...(draft.categoryIds ?? []), id],
          })
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  section: { paddingHorizontal: t.spacing[4], gap: t.spacing[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2] },
  row: { flexDirection: 'row', gap: t.spacing[3] },
  flex: { flex: 1 },
  actions: { padding: t.spacing[4], gap: t.spacing[3], marginTop: t.spacing[4] },
}));
