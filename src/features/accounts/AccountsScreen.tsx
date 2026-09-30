import { router } from 'expo-router';
import { useState } from 'react';
import { SectionList, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  MoneyText,
  Screen,
  Stat,
  Text,
} from '@/components/ui';
import type { Repositories } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { displayBalance } from '@/domain/accountForm';
import { availableCredit } from '@/domain/ledger';
import { formatMoney, money } from '@/domain/money';
import { usePreferences } from '@/store/preferences';
import { makeStyles } from '@/theme';

import { ACCOUNT_TYPE_ICONS, groupAccounts, type AccountWithBalance } from './groups';
import { BASE_CURRENCY, netWorth } from './netWorth';

function loadAccounts(repos: Repositories) {
  const balances = repos.accounts.balances();
  const active = repos.accounts.list();
  const archived = repos.accounts
    .list({ includeArchived: true })
    .filter((account) => account.isArchived);
  return {
    worth: netWorth(active, balances),
    sections: groupAccounts(active, balances),
    archived: archived.map((account) => ({
      account,
      balanceMinor: balances.get(account.id) ?? 0,
    })),
  };
}

export function AccountsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const hideAmounts = usePreferences((s) => s.hideAmounts);
  const [showArchived, setShowArchived] = useState(false);
  const query = useLiveQuery(loadAccounts);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;

  const { worth, sections, archived } = query.data;
  const listSections = [
    ...sections.map((s) => ({
      key: s.group,
      title: t(`accounts.groups.${s.group}`),
      subtotalMinor: s.subtotalMinor as number | null,
      liability: s.data.every((row) => row.account.accountClass === 'liability'),
      data: s.data,
    })),
    ...(showArchived && archived.length > 0
      ? [
          {
            key: 'archived',
            title: t('accounts.archived'),
            subtotalMinor: null,
            liability: false,
            data: archived,
          },
        ]
      : []),
  ];

  const subtitleFor = ({ account, balanceMinor }: AccountWithBalance) => {
    const parts: string[] = [t(`accounts.types.${account.type}`)];
    if (account.last4) parts.push(`•• ${account.last4}`);
    if (account.accountClass === 'liability') parts.push(t('accounts.owed'));
    if (account.type === 'credit_card' && account.creditLimitMinor !== null) {
      const available = availableCredit(
        money(account.creditLimitMinor, account.currency),
        money(balanceMinor, account.currency),
      );
      parts.push(
        t('accounts.availableCredit', { amount: formatMoney(available, { hide: hideAmounts }) }),
      );
    }
    return parts.join(' · ');
  };

  if (sections.length === 0 && archived.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="wallet-outline"
          title={t('accounts.emptyTitle')}
          message={t('accounts.emptyBody')}
          action={{ label: t('accounts.add'), onPress: () => router.push('/accounts/new') }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionList
        sections={listSections}
        keyExtractor={(item) => item.account.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.summary}>
            <Stat
              label={t('accounts.total')}
              value={
                <MoneyText amountMinor={worth.netMinor} currency={BASE_CURRENCY} variant="title" />
              }
            />
            <View style={styles.summaryRow}>
              <Stat
                label={t('accounts.assets')}
                value={<MoneyText amountMinor={worth.assetsMinor} currency={BASE_CURRENCY} />}
              />
              <Stat
                label={t('accounts.liabilities')}
                value={
                  <MoneyText amountMinor={0 - worth.liabilitiesMinor} currency={BASE_CURRENCY} />
                }
              />
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="caption" color="textSecondary" accessibilityRole="header">
              {section.title.toUpperCase()}
            </Text>
            {section.subtotalMinor !== null ? (
              <MoneyText
                amountMinor={section.liability ? 0 - section.subtotalMinor : section.subtotalMinor}
                currency={BASE_CURRENCY}
                variant="bodySmall"
                tone="muted"
              />
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <ListItem
            icon={ACCOUNT_TYPE_ICONS[item.account.type]}
            title={item.account.name}
            subtitle={subtitleFor(item)}
            accessibilityHint={t('accounts.openHint')}
            onPress={() =>
              router.push({ pathname: '/accounts/[id]', params: { id: item.account.id } })
            }
            trailing={
              <MoneyText
                amountMinor={displayBalance(item.account.type, item.balanceMinor)}
                currency={item.account.currency}
              />
            }
          />
        )}
        ItemSeparatorComponent={InsetDivider}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              label={t('accounts.add')}
              icon="add"
              variant="secondary"
              onPress={() => router.push('/accounts/new')}
            />
            {archived.length > 0 ? (
              <Button
                label={
                  showArchived
                    ? t('accounts.hideArchived')
                    : t('accounts.showArchived', { count: archived.length })
                }
                variant="ghost"
                onPress={() => setShowArchived((v) => !v)}
              />
            ) : null}
          </View>
        }
        contentContainerStyle={styles.content}
      />
    </Screen>
  );
}

function InsetDivider() {
  return <Divider inset />;
}

const useStyles = makeStyles((t) => ({
  summary: { paddingHorizontal: t.spacing[4], paddingTop: t.spacing[4], gap: t.spacing[3] },
  summaryRow: { flexDirection: 'row', gap: t.spacing[4] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[6],
    paddingBottom: t.spacing[2],
  },
  content: { paddingBottom: t.spacing[8] },
  footer: { padding: t.spacing[4], gap: t.spacing[2] },
}));
