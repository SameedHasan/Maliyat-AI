import { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Divider, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import type { Repositories } from '@/data/repositories';
import type { TransactionCursor } from '@/data/repositories/transactions';
import { useLiveQuery } from '@/data/useLiveQuery';
import { toLocalDate } from '@/domain/dates';
import type { TransactionWithEntries } from '@/domain/types';
import { loadLookups } from '@/features/shared/lookups';

import { TransactionRow } from './TransactionRow';

const PAGE_SIZE = 50;

/**
 * Re-reads every loaded page on each change so edits anywhere in the list show up.
 * Cheap at this scale; revisit with a windowed query once lists grow into the tens of
 * thousands.
 */
function loadPages(repos: Repositories, pages: number) {
  const items: TransactionWithEntries[] = [];
  let cursor: TransactionCursor | null = null;
  for (let i = 0; i < pages; i++) {
    const page = repos.transactions.list({ limit: PAGE_SIZE, cursor });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return {
    items,
    hasMore: cursor !== null,
    lookups: loadLookups(repos),
    today: toLocalDate(repos.ctx.now(), repos.ctx.timeZone),
  };
}

export function TransactionsScreen() {
  const { t } = useTranslation();
  const [pages, setPages] = useState(1);
  const load = useCallback((repos: Repositories) => loadPages(repos, pages), [pages]);
  const query = useLiveQuery(load);

  if (query.status === 'loading') return <LoadingState />;
  if (query.status === 'error') return <ErrorState onRetry={query.reload} />;

  const { items, hasMore, lookups, today } = query.data;
  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionRow transaction={item} lookups={lookups} today={today} />
        )}
        ItemSeparatorComponent={InsetDivider}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) setPages((n) => n + 1);
        }}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title={t('transactions.emptyTitle')}
            message={t('transactions.emptyBody')}
          />
        }
        contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : undefined}
      />
    </Screen>
  );
}

function InsetDivider() {
  return <Divider inset />;
}
