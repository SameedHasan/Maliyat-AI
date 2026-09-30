import { SectionList, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Divider,
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  MoneyText,
  Screen,
  SectionHeader,
  Stat,
  type IconName,
} from '@/components/ui';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { availableCredit } from '@/domain/ledger';
import { formatMoney, money, type CurrencyCode } from '@/domain/money';
import type { Account, AccountType } from '@/domain/types';
import { usePreferences } from '@/store/preferences';
import { makeStyles } from '@/theme';

import { BASE_CURRENCY, netWorth } from './netWorth';

const TYPE_ICONS: Record<AccountType, IconName> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'phone-portrait-outline',
  credit_card: 'card-outline',
  loan: 'document-text-outline',
  committee: 'people-outline',
  other_asset: 'briefcase-outline',
  other_liability: 'remove-circle-outline',
};

interface AccountRowData {
  account: Account;
  balanceMinor: number;
}

function loadAccounts(repos: Repositories) {
  const accounts = repos.accounts.list();
  const balances = repos.accounts.balances();
  const rows = accounts.map((account) => ({
    account,
    balanceMinor: balances.get(account.id) ?? 0,
  }));
  return {
    worth: netWorth(accounts, balances),
    assets: rows.filter((r) => r.account.accountClass === 'asset'),
    liabilities: rows.filter((r) => r.account.accountClass === 'liability'),
  };
}

export function AccountsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const hideAmounts = usePreferences((s) => s.hideAmounts);
  const query = useLiveQuery(loadAccounts);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;

  const { worth, assets, liabilities } = query.data;
  const sections = [
    { key: 'assets', title: t('accounts.assets'), data: assets },
    { key: 'liabilities', title: t('accounts.liabilities'), data: liabilities },
  ].filter((s) => s.data.length > 0);

  const subtitleFor = ({ account, balanceMinor }: AccountRowData) => {
    const parts: string[] = [t(`accounts.types.${account.type}`)];
    if (account.last4) parts.push(`•• ${account.last4}`);
    if (account.type === 'credit_card' && account.creditLimitMinor !== null) {
      const currency = account.currency as CurrencyCode;
      const available = availableCredit(
        money(account.creditLimitMinor, currency),
        money(balanceMinor, currency),
      );
      parts.push(
        t('accounts.availableCredit', { amount: formatMoney(available, { hide: hideAmounts }) }),
      );
    }
    return parts.join(' · ');
  };

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.account.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          sections.length > 0 ? (
            <View style={styles.summary}>
              <Stat
                label={t('accounts.total')}
                value={
                  <MoneyText
                    amountMinor={worth.netMinor}
                    currency={BASE_CURRENCY}
                    variant="title"
                  />
                }
              />
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        renderItem={({ item }) => (
          <ListItem
            icon={TYPE_ICONS[item.account.type]}
            title={item.account.name}
            subtitle={subtitleFor(item)}
            trailing={
              <MoneyText
                amountMinor={item.balanceMinor}
                currency={item.account.currency as CurrencyCode}
              />
            }
          />
        )}
        ItemSeparatorComponent={InsetDivider}
        ListEmptyComponent={
          <EmptyState
            icon="wallet-outline"
            title={t('accounts.emptyTitle')}
            message={t('accounts.emptyBody')}
          />
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyContent : styles.content}
      />
    </Screen>
  );
}

function InsetDivider() {
  return <Divider inset />;
}

const useStyles = makeStyles((t) => ({
  summary: { paddingHorizontal: t.spacing[4], paddingTop: t.spacing[4] },
  content: { paddingBottom: t.spacing[8] },
  emptyContent: { flexGrow: 1 },
}));
