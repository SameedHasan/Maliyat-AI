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
  LoadingState,
  MoneyText,
  Screen,
  Stat,
  Surface,
  Text,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { balanceFromDisplay, displayBalance } from '@/domain/accountForm';
import { toLocalDate } from '@/domain/dates';
import { parseMoneyInput } from '@/domain/money';
import { amountToInput } from '@/domain/transactionForm';
import { errorMessage } from '@/features/shared/errors';
import { showSnackbar } from '@/store/snackbar';
import { makeStyles } from '@/theme';
import { formatDate } from '@/utils/format';

function loadReconcile(repos: Repositories, id: string) {
  const account = repos.accounts.get(id);
  if (!account) return null;
  return {
    account,
    balanceMinor: repos.accounts.balanceOf(id),
    today: toLocalDate(repos.ctx.now(), repos.ctx.timeZone),
  };
}

export function ReconcileScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const load = useCallback((r: Repositories) => loadReconcile(r, id), [id]);
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
  return <ReconcileForm {...query.data} />;
}

function ReconcileForm({
  account,
  balanceMinor,
  today,
}: NonNullable<ReturnType<typeof loadReconcile>>) {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const current = displayBalance(account.type, balanceMinor);
  const [actual, setActual] = useState(() => amountToInput(Math.max(current, 0), account.currency));
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseMoneyInput(actual, account.currency);
  const differenceMinor = parsed.ok ? parsed.money.amountMinor - current : null;
  const isLiability = account.accountClass === 'liability';

  const save = () => {
    if (!parsed.ok) {
      setError(t(`errors.form.${parsed.error === 'empty' ? 'required' : parsed.error}`));
      return;
    }
    try {
      const adjustmentId = repos.accounts.reconcile(
        account.id,
        balanceFromDisplay(account.type, parsed.money.amountMinor),
        date,
      );
      showSnackbar({
        message: adjustmentId ? t('accounts.reconciled') : t('accounts.alreadyReconciled'),
      });
      router.back();
    } catch (e) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, e));
    }
  };

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title: t('accounts.reconcile') }} />
      <View style={styles.form}>
        <Text variant="bodySmall" color="textSecondary">
          {t('accounts.reconcileHelp')}
        </Text>
        <Surface padded>
          <View style={styles.row}>
            <Stat
              label={isLiability ? t('accounts.recordedOwed') : t('accounts.recordedBalance')}
              value={<MoneyText amountMinor={current} currency={account.currency} alwaysVisible />}
            />
            <Stat
              label={t('accounts.difference')}
              value={
                differenceMinor !== null ? (
                  <MoneyText
                    amountMinor={differenceMinor}
                    currency={account.currency}
                    tone="signed"
                    alwaysVisible
                  />
                ) : (
                  <Text variant="mono">—</Text>
                )
              }
            />
          </View>
        </Surface>
        <AmountInput
          label={isLiability ? t('accounts.actualOwed') : t('accounts.actualBalance')}
          value={actual}
          onChangeText={(text) => {
            setActual(text);
            setError(null);
          }}
          currency={account.currency}
          error={error}
          size="large"
          autoFocus
        />
        <DateField
          label={t('transactions.fields.date')}
          value={date}
          displayValue={formatDate(date)}
          placeholder={t('transactions.fields.date')}
          maximumDate={today}
          onChange={setDate}
        />
        <Button label={t('accounts.reconcileConfirm')} icon="checkmark-done" onPress={save} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.spacing[4] },
  row: { flexDirection: 'row', gap: t.spacing[4] },
}));
