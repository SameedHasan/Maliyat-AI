import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet, Divider, EmptyState, Icon, ListItem } from '@/components/ui';
import type { Account } from '@/domain/types';
import { ACCOUNT_TYPE_ICONS } from '@/features/accounts/groups';

export interface AccountPickerProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  accounts: readonly Account[];
  selectedId: string | null;
  onSelect: (account: Account) => void;
  /** Hidden from the list, e.g. the "from" account when picking "to". */
  excludeId?: string | null;
}

export function AccountPicker({
  visible,
  onClose,
  title,
  accounts,
  selectedId,
  onSelect,
  excludeId,
}: AccountPickerProps) {
  const { t } = useTranslation();
  const options = accounts.filter((a) => a.id !== excludeId);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {options.length === 0 ? (
        <EmptyState icon="wallet-outline" title={t('accounts.emptyTitle')} />
      ) : (
        options.map((account, index) => (
          <View key={account.id}>
            {index > 0 ? <Divider inset /> : null}
            <ListItem
              icon={ACCOUNT_TYPE_ICONS[account.type]}
              title={account.name}
              subtitle={t(`accounts.types.${account.type}`)}
              accessibilityLabel={account.name}
              onPress={() => {
                onSelect(account);
                onClose();
              }}
              trailing={
                account.id === selectedId ? <Icon name="checkmark" color="primary" /> : null
              }
            />
          </View>
        ))
      )}
    </BottomSheet>
  );
}
