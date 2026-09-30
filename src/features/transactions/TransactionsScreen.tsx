import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useDeferredValue, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  MoneyText,
  Screen,
  SearchInput,
  Text,
} from '@/components/ui';
import type { Repositories, TransactionCursor, TransactionFilters } from '@/data/repositories';
import { useLiveQuery } from '@/data/useLiveQuery';
import { toLocalDate } from '@/domain/dates';
import type { TransactionWithEntries } from '@/domain/types';
import { BASE_CURRENCY } from '@/features/accounts/netWorth';
import { loadLookups } from '@/features/shared/lookups';
import { activeFilterCount, useTransactionFilters } from '@/store/transactionFilters';
import { makeStyles, useTheme } from '@/theme';
import { formatLongDate } from '@/utils/format';

import { AddTransactionSheet } from './AddTransactionSheet';
import { groupByDate, type TransactionListItem } from './grouping';
import { TransactionRow } from './TransactionRow';

const PAGE_SIZE = 50;

/**
 * Re-reads every loaded page on each change so edits anywhere in the list show up.
 * Each page is an indexed keyset query, so this stays cheap at tens of thousands of rows.
 */
function loadPages(repos: Repositories, pages: number, filters: TransactionFilters) {
  const items: TransactionWithEntries[] = [];
  let cursor: TransactionCursor | null = null;
  for (let i = 0; i < pages; i++) {
    const page = repos.transactions.list({ limit: PAGE_SIZE, cursor, filters });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return {
    rows: groupByDate(items),
    count: items.length,
    hasMore: cursor !== null,
    hasAny: repos.transactions.list({ limit: 1 }).items.length > 0,
    lookups: loadLookups(repos),
    today: toLocalDate(repos.ctx.now(), repos.ctx.timeZone),
  };
}

export function TransactionsScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const theme = useTheme();
  const search = useTransactionFilters((s) => s.search);
  const setSearch = useTransactionFilters((s) => s.setSearch);
  const filters = useTransactionFilters((s) => s.filters);
  const reset = useTransactionFilters((s) => s.reset);
  const deferredSearch = useDeferredValue(search);
  const [pages, setPages] = useState(1);
  const [addSheet, setAddSheet] = useState(false);

  const load = useCallback(
    (repos: Repositories) =>
      loadPages(repos, pages, { ...filters, search: deferredSearch || undefined }),
    [pages, filters, deferredSearch],
  );
  const query = useLiveQuery(load);
  const filterCount = activeFilterCount(filters);
  const filtering = filterCount > 0 || deferredSearch.trim() !== '';

  const header = (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <SearchInput
            value={search}
            onChangeText={(text) => {
              setSearch(text);
              setPages(1);
            }}
            placeholder={t('transactions.searchPlaceholder')}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            filterCount > 0
              ? t('transactions.filtersActive', { count: filterCount })
              : t('transactions.filters')
          }
          onPress={() => router.push('/transactions/filters')}
          hitSlop={theme.hitSlop}
          style={[styles.filterButton, filterCount > 0 && styles.filterButtonActive]}>
          <Icon
            name="options-outline"
            size="md"
            color={filterCount > 0 ? 'onPrimary' : 'textSecondary'}
          />
          {filterCount > 0 ? (
            <Text variant="caption" color="onPrimary">
              {filterCount}
            </Text>
          ) : null}
        </Pressable>
      </View>
      {filtering && query.status === 'ready' ? (
        <View style={styles.resultRow}>
          <Text variant="caption" color="textSecondary">
            {query.data.hasMore
              ? t('transactions.resultsMore', { count: query.data.count })
              : t('transactions.results', { count: query.data.count })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('transactions.clearFilters')}
            onPress={() => {
              reset();
              setPages(1);
            }}
            hitSlop={theme.hitSlop}>
            <Text variant="caption" color="primary">
              {t('transactions.clearFilters')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  let body;
  if (query.status === 'loading') body = <LoadingState />;
  else if (query.status === 'error') body = <ErrorState onRetry={query.reload} />;
  else {
    const { rows, hasMore, hasAny, lookups, today } = query.data;
    body = (
      <FlashList<TransactionListItem>
        data={rows}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <View style={styles.dateHeader} accessibilityRole="header">
              <Text variant="caption" color="textSecondary">
                {formatLongDate(item.date)}
              </Text>
              {item.netMinor !== 0 ? (
                <MoneyText
                  amountMinor={item.netMinor}
                  currency={BASE_CURRENCY}
                  variant="caption"
                  tone="muted"
                  sign="always"
                />
              ) : null}
            </View>
          ) : (
            <TransactionRow
              transaction={item.transaction}
              lookups={lookups}
              today={today}
              showDate={false}
            />
          )
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) setPages((n) => n + 1);
        }}
        ListEmptyComponent={
          hasAny ? (
            <EmptyState
              icon="search-outline"
              title={t('transactions.noMatchesTitle')}
              message={t('transactions.noMatchesBody')}
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={t('transactions.emptyTitle')}
              message={t('transactions.emptyBody')}
              action={{ label: t('transactions.add'), onPress: () => setAddSheet(true) }}
            />
          )
        }
        contentContainerStyle={styles.listContent}
      />
    );
  }

  return (
    <Screen>
      {header}
      <View style={styles.list}>{body}</View>
      <View style={styles.fab}>
        <Button label={t('transactions.add')} icon="add" onPress={() => setAddSheet(true)} />
      </View>
      <AddTransactionSheet visible={addSheet} onClose={() => setAddSheet(false)} />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  header: { paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[2], gap: t.spacing[2] },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] },
  search: { flex: 1 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing[1],
    minWidth: t.touchTarget - t.spacing[1],
    minHeight: t.touchTarget - t.spacing[1],
    justifyContent: 'center',
    paddingHorizontal: t.spacing[2],
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceAlt,
  },
  filterButtonActive: { backgroundColor: t.colors.primary },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { flex: 1 },
  listContent: { paddingBottom: t.touchTarget * 2 },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: t.spacing[4],
    paddingTop: t.spacing[4],
    paddingBottom: t.spacing[1],
    backgroundColor: t.colors.background,
  },
  fab: { position: 'absolute', end: t.spacing[4], bottom: t.spacing[4] },
}));
