import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AmountInput,
  Button,
  Chip,
  DateField,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SegmentedControl,
  SelectField,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import {
  ALERT_THRESHOLD_OPTIONS,
  budgetFormFromBudget,
  buildBudgetInput,
  emptyBudgetForm,
  type BudgetFormErrors,
  type BudgetFormState,
} from '@/domain/budgetForm';
import { monthRange, toLocalDate } from '@/domain/dates';
import type { BudgetPeriod } from '@/domain/types';
import { BASE_CURRENCY } from '@/features/accounts/netWorth';
import { CategoryPicker } from '@/features/shared/CategoryPicker';
import { errorMessage } from '@/features/shared/errors';
import { makeStyles } from '@/theme';
import { formatDate } from '@/utils/format';

function loadBudgetForm(repos: Repositories, id: string | undefined) {
  return {
    today: toLocalDate(repos.ctx.now(), repos.ctx.timeZone),
    budget: id ? (repos.budgets.get(id) ?? null) : null,
    tree: repos.categories.tree('expense'),
  };
}

type Data = ReturnType<typeof loadBudgetForm>;

export function BudgetFormScreen({ id }: { id?: string }) {
  const { t } = useTranslation();
  const load = useCallback((r: Repositories) => loadBudgetForm(r, id), [id]);
  const query = useLiveQuery(load);
  const [snapshot, setSnapshot] = useState<Data | null>(null);
  if (query.status === 'ready' && snapshot === null) setSnapshot(query.data);

  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;
  if (!snapshot) return <LoadingState />;
  if (id && !snapshot.budget) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t('errors.not_found')} />
      </Screen>
    );
  }
  return <BudgetForm data={snapshot} />;
}

function BudgetForm({ data }: { data: Data }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const { budget, tree, today } = data;
  const [state, setState] = useState<BudgetFormState>(() =>
    budget ? budgetFormFromBudget(budget) : emptyBudgetForm(monthRange(today).start),
  );
  const [errors, setErrors] = useState<BudgetFormErrors>({});
  const [categorySheet, setCategorySheet] = useState(false);
  const currency = budget?.currency ?? BASE_CURRENCY;

  const update = (patch: Partial<BudgetFormState>) => {
    setState((s) => ({ ...s, ...patch }));
    setErrors({});
  };
  const errorText = (field: keyof BudgetFormErrors) =>
    errors[field] ? t(`errors.form.${errors[field]}`) : null;

  const categoryName = (id: string) => {
    for (const parent of tree) {
      if (parent.id === id) return parent.name;
      const child = parent.children.find((c) => c.id === id);
      if (child) return `${parent.name} › ${child.name}`;
    }
    return '—';
  };

  const save = () => {
    const result = buildBudgetInput(state, currency);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      if (budget) repos.budgets.update(budget.id, result.input);
      else repos.budgets.create(result.input);
      router.back();
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const periods: { value: BudgetPeriod; label: string }[] = [
    { value: 'monthly', label: t('budgets.periods.monthly') },
    { value: 'weekly', label: t('budgets.periods.weekly') },
    { value: 'custom', label: t('budgets.periods.custom') },
  ];

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title: budget ? t('budgets.edit') : t('budgets.add') }} />
      <View style={styles.form}>
        <TextField
          label={t('budgets.fields.name')}
          value={state.name}
          onChangeText={(name) => update({ name })}
          placeholder={t('budgets.fields.namePlaceholder')}
          autoCapitalize="words"
          maxLength={60}
          error={errorText('name')}
          autoFocus={!budget}
        />
        <AmountInput
          label={t('budgets.fields.amount')}
          value={state.amount}
          onChangeText={(amount) => update({ amount })}
          currency={currency}
          error={errorText('amount')}
          size="large"
        />
        <SegmentedControl
          accessibilityLabel={t('budgets.fields.period')}
          options={periods}
          value={state.period}
          onChange={(period) => update({ period })}
        />
        <DateField
          label={state.period === 'custom' ? t('budgets.fields.from') : t('budgets.fields.startOn')}
          value={state.startOn}
          displayValue={formatDate(state.startOn)}
          placeholder={t('budgets.fields.startOn')}
          onChange={(startOn) => update({ startOn })}
        />
        {state.period === 'custom' ? (
          <DateField
            label={t('budgets.fields.to')}
            value={state.endOn}
            displayValue={state.endOn ? formatDate(state.endOn) : null}
            placeholder={t('budgets.fields.to')}
            minimumDate={state.startOn}
            onChange={(endOn) => update({ endOn })}
            error={errorText('endOn')}
          />
        ) : (
          <View style={styles.toggleRow}>
            <View style={styles.flex}>
              <Text variant="body">{t('budgets.fields.rollover')}</Text>
              <Text variant="caption" color="textMuted">
                {t('budgets.fields.rolloverHint')}
              </Text>
            </View>
            <Toggle
              value={state.rollover}
              onValueChange={(rollover) => update({ rollover })}
              accessibilityLabel={t('budgets.fields.rollover')}
            />
          </View>
        )}

        <View style={styles.group}>
          <Text variant="caption" color="textSecondary">
            {t('budgets.fields.categories')}
          </Text>
          {state.categoryIds.length > 0 ? (
            <View style={styles.chips}>
              {state.categoryIds.map((categoryId) => (
                <Chip
                  key={categoryId}
                  label={categoryName(categoryId)}
                  icon="close"
                  selected
                  accessibilityHint={t('budgets.removeCategoryHint')}
                  onPress={() =>
                    update({ categoryIds: state.categoryIds.filter((c) => c !== categoryId) })
                  }
                />
              ))}
            </View>
          ) : null}
          <SelectField
            label={t('budgets.fields.addCategory')}
            value={null}
            placeholder={t('transactions.fields.chooseCategory')}
            icon="pricetag-outline"
            onPress={() => setCategorySheet(true)}
            error={errorText('categoryIds')}
          />
          <Text variant="caption" color="textMuted">
            {t('budgets.fields.categoriesHint')}
          </Text>
        </View>

        <View style={styles.group}>
          <Text variant="caption" color="textSecondary">
            {t('budgets.fields.alerts')}
          </Text>
          <View style={styles.chips}>
            {ALERT_THRESHOLD_OPTIONS.map((threshold) => {
              const selected = state.alertThresholds.includes(threshold);
              return (
                <Chip
                  key={threshold}
                  label={`${threshold}%`}
                  selected={selected}
                  onPress={() =>
                    update({
                      alertThresholds: selected
                        ? state.alertThresholds.filter((v) => v !== threshold)
                        : [...state.alertThresholds, threshold].sort((a, b) => a - b),
                    })
                  }
                />
              );
            })}
          </View>
          <Text variant="caption" color="textMuted">
            {t('budgets.fields.alertsHint')}
          </Text>
        </View>

        <Button label={t('common.save')} icon="checkmark" onPress={save} />
      </View>

      <CategoryPicker
        visible={categorySheet}
        onClose={() => setCategorySheet(false)}
        title={t('budgets.fields.addCategory')}
        tree={tree}
        selectedId={null}
        onSelect={(categoryId) =>
          update({
            categoryIds: state.categoryIds.includes(categoryId)
              ? state.categoryIds
              : [...state.categoryIds, categoryId],
          })
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.spacing[4] },
  group: { gap: t.spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2] },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[3] },
  flex: { flex: 1 },
}));
