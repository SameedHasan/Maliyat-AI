import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AmountInput,
  Button,
  DateField,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  MoneyText,
  Screen,
  SegmentedControl,
  SelectField,
  Surface,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { CategoryNode, Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { toLocalDate } from '@/domain/dates';
import {
  amountToInput,
  buildTransactionInput,
  emptyFormState,
  formStateFromTransaction,
  splitRemaining,
  type FormErrors,
  type FormField,
  type FormKind,
  type TransactionFormState,
} from '@/domain/transactionForm';
import type { Account } from '@/domain/types';
import { BASE_CURRENCY } from '@/features/accounts/netWorth';
import { AccountPicker } from '@/features/shared/AccountPicker';
import { CategoryPicker } from '@/features/shared/CategoryPicker';
import { errorMessage } from '@/features/shared/errors';
import { loadLookups } from '@/features/shared/lookups';
import { showSnackbar } from '@/store/snackbar';
import { makeStyles } from '@/theme';
import { newId } from '@/utils/id';
import { formatLongDate } from '@/utils/format';

export interface TransactionFormScreenProps {
  kind?: FormKind;
  /** Edit an existing transaction. */
  id?: string;
  duplicateOf?: string;
  refundOf?: string;
  accountId?: string;
}

function loadTransactionForm(repos: Repositories, sourceId: string | undefined) {
  return {
    today: toLocalDate(repos.ctx.now(), repos.ctx.timeZone),
    accounts: repos.accounts.list(),
    lookups: loadLookups(repos),
    trees: {
      expense: repos.categories.tree('expense'),
      income: repos.categories.tree('income'),
    },
    source: sourceId ? (repos.transactions.get(sourceId) ?? null) : null,
  };
}

type FormData = ReturnType<typeof loadTransactionForm>;

export function TransactionFormScreen(props: TransactionFormScreenProps) {
  const { t } = useTranslation();
  const sourceId = props.id ?? props.duplicateOf ?? props.refundOf;
  const load = useCallback((r: Repositories) => loadTransactionForm(r, sourceId), [sourceId]);
  const query = useLiveQuery(load);
  // The form keeps its own state; later database changes must not reset it.
  const [snapshot, setSnapshot] = useState<FormData | null>(null);
  if (query.status === 'ready' && snapshot === null) setSnapshot(query.data);

  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;
  if (!snapshot) return <LoadingState />;
  if (snapshot.accounts.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="wallet-outline"
          title={t('accounts.emptyTitle')}
          message={t('transactions.needAccount')}
          action={{ label: t('accounts.add'), onPress: () => router.replace('/accounts/new') }}
        />
      </Screen>
    );
  }

  const mode = props.id
    ? 'edit'
    : props.duplicateOf
      ? 'duplicate'
      : props.refundOf
        ? 'refund'
        : 'new';
  let initial: TransactionFormState | null;
  if (mode === 'new') {
    initial = emptyFormState(props.kind ?? 'expense', snapshot.today, {
      accountId: props.accountId ?? snapshot.accounts[0]?.id ?? null,
    });
  } else {
    initial = snapshot.source
      ? formStateFromTransaction(snapshot.source, mode, snapshot.today, newId)
      : null;
  }
  if (!initial) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t('transactions.cannotEdit')} />
      </Screen>
    );
  }
  return <TransactionForm data={snapshot} initial={initial} editId={props.id} mode={mode} />;
}

type SheetTarget =
  | { kind: 'account' }
  | { kind: 'toAccount' }
  | { kind: 'category' }
  | { kind: 'feeCategory' }
  | { kind: 'split'; index: number }
  | null;

function TransactionForm({
  data,
  initial,
  editId,
  mode,
}: {
  data: FormData;
  initial: TransactionFormState;
  editId?: string;
  mode: 'new' | 'edit' | 'duplicate' | 'refund';
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const [state, setState] = useState(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sheet, setSheet] = useState<SheetTarget>(null);

  const account: Account | undefined = state.accountId
    ? data.lookups.accounts.get(state.accountId)
    : undefined;
  const currency = account?.currency ?? BASE_CURRENCY;
  const categoryName = (id: string | null) => {
    if (!id) return null;
    const category = data.lookups.categories.get(id);
    if (!category) return null;
    const parent = category.parentId ? data.lookups.categories.get(category.parentId) : undefined;
    return parent ? `${parent.name} › ${category.name}` : category.name;
  };
  const accountName = (id: string | null) =>
    id ? (data.lookups.accounts.get(id)?.name ?? null) : null;

  const update = (patch: Partial<TransactionFormState>) => {
    setState((s) => ({ ...s, ...patch }));
    setErrors({});
  };
  const errorText = (field: FormField) =>
    errors[field] ? t(`errors.form.${errors[field]}`) : null;

  const categoryTree: readonly CategoryNode[] =
    state.kind === 'income' ? data.trees.income : data.trees.expense;
  const isTransfer = state.kind === 'transfer';
  const canSplit = state.kind === 'expense' || state.kind === 'income';
  const remaining = state.split ? splitRemaining(state, currency) : null;

  const setKind = (kind: FormKind) => {
    if (kind === state.kind) return;
    // Categories don't carry over between expense and income trees.
    update({
      kind,
      categoryId: null,
      split: false,
      splits: [],
      toAccountId: null,
      fee: '',
      feeCategoryId: null,
    });
  };

  const setSplit = (split: boolean) =>
    update({
      split,
      categoryId: split ? null : state.categoryId,
      splits: split
        ? [
            { key: newId(), categoryId: state.categoryId, amount: state.amount },
            { key: newId(), categoryId: null, amount: '' },
          ]
        : [],
    });

  const updateSplit = (index: number, patch: Partial<TransactionFormState['splits'][number]>) =>
    update({ splits: state.splits.map((line, i) => (i === index ? { ...line, ...patch } : line)) });

  // Matches the seeded default by name; users who renamed it just pick one.
  const defaultFeeCategory = () =>
    data.trees.expense
      .flatMap((parent) => [parent, ...parent.children])
      .find((c) => c.name === 'Transfer Fees')?.id ?? null;

  const save = () => {
    const result = buildTransactionInput(state, currency);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      if (mode === 'edit' && editId) repos.transactions.update(editId, result.input);
      else repos.transactions.create(result.input);
      showSnackbar({
        message: mode === 'edit' ? t('transactions.updated') : t('transactions.saved'),
      });
      router.back();
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  const title =
    mode === 'edit'
      ? t('transactions.editTitle')
      : mode === 'refund'
        ? t('transactions.refundTitle')
        : t(`transactions.newTitle.${state.kind}`);

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title }} />
      <View style={styles.form}>
        {mode !== 'refund' && state.kind !== 'refund' ? (
          <SegmentedControl
            accessibilityLabel={t('transactions.fields.kind')}
            options={[
              { value: 'expense', label: t('kinds.expense') },
              { value: 'income', label: t('kinds.income') },
              { value: 'transfer', label: t('kinds.transfer') },
            ]}
            value={state.kind}
            onChange={setKind}
          />
        ) : (
          <Text variant="bodySmall" color="textSecondary">
            {t('transactions.refundHelp')}
          </Text>
        )}

        <AmountInput
          label={t('transactions.fields.amount')}
          value={state.amount}
          onChangeText={(amount) => update({ amount })}
          currency={currency}
          error={errorText('amount')}
          size="large"
          autoFocus={mode === 'new'}
        />

        <SelectField
          label={isTransfer ? t('transactions.fields.from') : t('transactions.fields.account')}
          value={accountName(state.accountId)}
          placeholder={t('transactions.fields.chooseAccount')}
          icon="wallet-outline"
          onPress={() => setSheet({ kind: 'account' })}
          error={errorText('accountId')}
        />

        {isTransfer ? (
          <>
            <SelectField
              label={t('transactions.fields.to')}
              value={accountName(state.toAccountId)}
              placeholder={t('transactions.fields.chooseAccount')}
              icon="arrow-forward-outline"
              onPress={() => setSheet({ kind: 'toAccount' })}
              error={errorText('toAccountId')}
            />
            <AmountInput
              label={t('transactions.fields.fee')}
              value={state.fee}
              onChangeText={(fee) =>
                update({
                  fee,
                  feeCategoryId: state.feeCategoryId ?? (fee ? defaultFeeCategory() : null),
                })
              }
              currency={currency}
              placeholder={t('common.optional')}
              error={errorText('fee')}
            />
            {state.fee.trim() !== '' ? (
              <SelectField
                label={t('transactions.fields.feeCategory')}
                value={categoryName(state.feeCategoryId)}
                placeholder={t('transactions.fields.chooseCategory')}
                icon="pricetag-outline"
                onPress={() => setSheet({ kind: 'feeCategory' })}
                error={errorText('feeCategoryId')}
              />
            ) : null}
          </>
        ) : null}

        {!isTransfer && !state.split ? (
          <SelectField
            label={t('transactions.fields.category')}
            value={categoryName(state.categoryId)}
            placeholder={t('transactions.fields.chooseCategory')}
            icon="pricetag-outline"
            onPress={() => setSheet({ kind: 'category' })}
            error={errorText('categoryId')}
          />
        ) : null}

        {canSplit ? (
          <View style={styles.toggleRow}>
            <Text variant="body">{t('transactions.fields.split')}</Text>
            <Toggle
              value={state.split}
              onValueChange={setSplit}
              accessibilityLabel={t('transactions.fields.split')}
            />
          </View>
        ) : null}

        {state.split ? (
          <Surface padded style={styles.splits}>
            {state.splits.map((line, index) => (
              <View key={line.key} style={styles.splitLine}>
                <View style={styles.splitFields}>
                  <SelectField
                    label={t('transactions.fields.splitN', { n: index + 1 })}
                    value={categoryName(line.categoryId)}
                    placeholder={t('transactions.fields.chooseCategory')}
                    onPress={() => setSheet({ kind: 'split', index })}
                    error={errorText(`splits.${index}.categoryId`)}
                  />
                  <AmountInput
                    label={t('transactions.fields.amount')}
                    value={line.amount}
                    onChangeText={(amount) => updateSplit(index, { amount })}
                    currency={currency}
                    error={errorText(`splits.${index}.amount`)}
                  />
                </View>
                <IconButton
                  icon="trash-outline"
                  accessibilityLabel={t('transactions.removeSplit', { n: index + 1 })}
                  onPress={() => update({ splits: state.splits.filter((_, i) => i !== index) })}
                />
              </View>
            ))}
            <View style={styles.remainingRow}>
              <Text variant="bodySmall" color="textSecondary">
                {t('transactions.remaining')}
              </Text>
              {remaining ? (
                <MoneyText
                  amountMinor={remaining.amountMinor}
                  currency={currency}
                  variant="bodySmall"
                  tone={remaining.amountMinor === 0 ? 'muted' : 'signed'}
                  alwaysVisible
                />
              ) : (
                <Text variant="bodySmall">—</Text>
              )}
            </View>
            {errors.splits ? (
              <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
                {t(`errors.form.${errors.splits}`)}
              </Text>
            ) : null}
            <Button
              label={t('transactions.addSplit')}
              icon="add"
              variant="ghost"
              onPress={() =>
                update({
                  splits: [
                    ...state.splits,
                    {
                      key: newId(),
                      categoryId: null,
                      amount:
                        remaining && remaining.amountMinor > 0
                          ? amountToInput(remaining.amountMinor, currency)
                          : '',
                    },
                  ],
                })
              }
            />
          </Surface>
        ) : null}

        <DateField
          label={t('transactions.fields.date')}
          value={state.occurredOn}
          displayValue={formatLongDate(state.occurredOn)}
          placeholder={t('transactions.fields.date')}
          onChange={(occurredOn) => update({ occurredOn })}
        />
        <TextField
          label={isTransfer ? t('transactions.fields.description') : t('transactions.fields.payee')}
          value={state.payee}
          onChangeText={(payee) => update({ payee })}
          placeholder={t('common.optional')}
          autoCapitalize="words"
          maxLength={120}
        />
        <TextField
          label={t('transactions.fields.notes')}
          value={state.notes}
          onChangeText={(notes) => update({ notes })}
          placeholder={t('common.optional')}
          multiline
          maxLength={1000}
        />
        <Button label={t('common.save')} icon="checkmark" onPress={save} />
      </View>

      <AccountPicker
        visible={sheet?.kind === 'account' || sheet?.kind === 'toAccount'}
        onClose={() => setSheet(null)}
        title={
          sheet?.kind === 'toAccount'
            ? t('transactions.fields.to')
            : isTransfer
              ? t('transactions.fields.from')
              : t('transactions.fields.account')
        }
        accounts={data.accounts}
        selectedId={sheet?.kind === 'toAccount' ? state.toAccountId : state.accountId}
        excludeId={sheet?.kind === 'toAccount' ? state.accountId : null}
        onSelect={(picked) =>
          sheet?.kind === 'toAccount'
            ? update({ toAccountId: picked.id })
            : update({ accountId: picked.id })
        }
      />
      <CategoryPicker
        visible={sheet?.kind === 'category' || sheet?.kind === 'split'}
        onClose={() => setSheet(null)}
        title={t('transactions.fields.category')}
        tree={categoryTree}
        selectedId={
          sheet?.kind === 'split'
            ? (state.splits[sheet.index]?.categoryId ?? null)
            : state.categoryId
        }
        onSelect={(categoryId) =>
          sheet?.kind === 'split'
            ? updateSplit(sheet.index, { categoryId })
            : update({ categoryId })
        }
      />
      <CategoryPicker
        visible={sheet?.kind === 'feeCategory'}
        onClose={() => setSheet(null)}
        title={t('transactions.fields.feeCategory')}
        tree={data.trees.expense}
        selectedId={state.feeCategoryId}
        onSelect={(feeCategoryId) => update({ feeCategoryId })}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.spacing[4] },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: t.touchTarget,
  },
  splits: { gap: t.spacing[4] },
  splitLine: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing[2] },
  splitFields: { flex: 1, gap: t.spacing[2] },
  remainingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
}));
