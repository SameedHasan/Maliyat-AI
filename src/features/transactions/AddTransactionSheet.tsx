import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet, Divider, ListItem } from '@/components/ui';
import type { FormKind } from '@/domain/transactionForm';

const OPTIONS = [
  { kind: 'expense', icon: 'arrow-up-outline' },
  { kind: 'income', icon: 'arrow-down-outline' },
  { kind: 'transfer', icon: 'swap-horizontal-outline' },
] as const satisfies readonly { kind: FormKind; icon: string }[];

export function openNewTransaction(kind: FormKind, accountId?: string) {
  router.push({
    pathname: '/transactions/new',
    params: accountId ? { kind, accountId } : { kind },
  });
}

export function AddTransactionSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('transactions.add')}>
      {OPTIONS.map((option, index) => (
        <View key={option.kind}>
          {index > 0 ? <Divider inset /> : null}
          <ListItem
            icon={option.icon}
            title={t(`transactions.newTitle.${option.kind}`)}
            onPress={() => {
              onClose();
              openNewTransaction(option.kind);
            }}
          />
        </View>
      ))}
    </BottomSheet>
  );
}
