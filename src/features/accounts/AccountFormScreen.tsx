import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AmountInput,
  BottomSheet,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Icon,
  ListItem,
  LoadingState,
  Screen,
  SelectField,
  TextField,
} from '@/components/ui';
import { useRepositories } from '@/data/DatabaseProvider';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import {
  accountFormFromAccount,
  buildAccountInput,
  buildAccountUpdate,
  emptyAccountForm,
  type AccountFormErrors,
  type AccountFormState,
} from '@/domain/accountForm';
import { ACCOUNT_TYPES, accountClassFor, type Account } from '@/domain/types';
import { errorMessage } from '@/features/shared/errors';
import { makeStyles } from '@/theme';

import { ACCOUNT_TYPE_ICONS } from './groups';
import { BASE_CURRENCY } from './netWorth';

export function AccountFormScreen({ id }: { id?: string }) {
  const { t } = useTranslation();
  const load = useCallback(
    (repos: Repositories) => (id ? (repos.accounts.get(id) ?? null) : null),
    [id],
  );
  const query = useLiveQuery(load);

  if (!id) return <AccountForm account={null} />;
  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;
  if (!query.data) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title={t('errors.not_found')} />
      </Screen>
    );
  }
  return <AccountForm account={query.data} />;
}

function AccountForm({ account }: { account: Account | null }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const repos = useRepositories();
  const [state, setState] = useState<AccountFormState>(() =>
    account ? accountFormFromAccount(account) : emptyAccountForm(),
  );
  const [errors, setErrors] = useState<AccountFormErrors>({});
  const [typeSheet, setTypeSheet] = useState(false);

  const update = (patch: Partial<AccountFormState>) => setState((s) => ({ ...s, ...patch }));
  const errorText = (field: keyof AccountFormErrors) =>
    errors[field] ? t(`errors.form.${errors[field]}`) : null;
  const isLiability = accountClassFor(state.type) === 'liability';

  const save = () => {
    try {
      if (account) {
        const result = buildAccountUpdate(state, account.currency);
        if (!result.ok) return setErrors(result.errors);
        repos.accounts.update(account.id, result.update);
        router.back();
      } else {
        const result = buildAccountInput(state, BASE_CURRENCY);
        if (!result.ok) return setErrors(result.errors);
        const created = repos.accounts.create(result.input);
        router.replace({ pathname: '/accounts/[id]', params: { id: created.id } });
      }
    } catch (error) {
      Alert.alert(t('states.errorTitle'), errorMessage(t, error));
    }
  };

  return (
    <Screen scroll padded>
      <Stack.Screen options={{ title: account ? t('accounts.edit') : t('accounts.add') }} />
      <View style={styles.form}>
        <TextField
          label={t('accounts.fields.name')}
          value={state.name}
          onChangeText={(name) => update({ name })}
          placeholder={t('accounts.fields.namePlaceholder')}
          autoCapitalize="words"
          maxLength={60}
          error={errorText('name')}
          autoFocus={!account}
        />
        <SelectField
          label={t('accounts.fields.type')}
          value={t(`accounts.types.${state.type}`)}
          placeholder={t('accounts.fields.type')}
          icon={ACCOUNT_TYPE_ICONS[state.type]}
          onPress={() => setTypeSheet(true)}
          disabled={!!account}
        />
        <TextField
          label={t('accounts.fields.institution')}
          value={state.institution}
          onChangeText={(institution) => update({ institution })}
          placeholder={t('common.optional')}
          autoCapitalize="words"
          maxLength={60}
        />
        <TextField
          label={t('accounts.fields.last4')}
          value={state.last4}
          onChangeText={(last4) => update({ last4: last4.replace(/\D/g, '') })}
          placeholder={t('common.optional')}
          hint={t('accounts.fields.last4Hint')}
          keyboardType="number-pad"
          maxLength={4}
          error={errorText('last4')}
        />
        {!account ? (
          <AmountInput
            label={
              isLiability ? t('accounts.fields.openingOwed') : t('accounts.fields.openingBalance')
            }
            value={state.openingBalance}
            onChangeText={(openingBalance) => update({ openingBalance })}
            currency={BASE_CURRENCY}
            error={errorText('openingBalance')}
          />
        ) : null}
        {state.type === 'credit_card' ? (
          <AmountInput
            label={t('accounts.fields.creditLimit')}
            value={state.creditLimit}
            onChangeText={(creditLimit) => update({ creditLimit })}
            currency={account?.currency ?? BASE_CURRENCY}
            error={errorText('creditLimit')}
          />
        ) : null}
        <Button label={t('common.save')} icon="checkmark" onPress={save} />
      </View>

      <BottomSheet
        visible={typeSheet}
        onClose={() => setTypeSheet(false)}
        title={t('accounts.fields.type')}>
        {ACCOUNT_TYPES.map((type, index) => (
          <View key={type}>
            {index > 0 ? <Divider inset /> : null}
            <ListItem
              icon={ACCOUNT_TYPE_ICONS[type]}
              title={t(`accounts.types.${type}`)}
              subtitle={
                accountClassFor(type) === 'liability'
                  ? t('accounts.liabilityHint')
                  : t('accounts.assetHint')
              }
              onPress={() => {
                update({ type, creditLimit: type === 'credit_card' ? state.creditLimit : '' });
                setTypeSheet(false);
              }}
              trailing={type === state.type ? <Icon name="checkmark" color="primary" /> : null}
            />
          </View>
        ))}
      </BottomSheet>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.spacing[4] },
}));
