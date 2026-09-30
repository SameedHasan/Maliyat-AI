import { create } from 'zustand';

import type { TransactionFilters } from '@/data/repositories';

interface TransactionFiltersState {
  search: string;
  /** Everything except the search text, which is edited inline on the list. */
  filters: TransactionFilters;
  setSearch: (search: string) => void;
  setFilters: (filters: TransactionFilters) => void;
  reset: () => void;
}

/** UI state only; not persisted, so every app start shows the full list. */
export const useTransactionFilters = create<TransactionFiltersState>()((set) => ({
  search: '',
  filters: {},
  setSearch: (search) => set({ search }),
  setFilters: (filters) => set({ filters }),
  reset: () => set({ search: '', filters: {} }),
}));

export function activeFilterCount(filters: TransactionFilters): number {
  let count = 0;
  if (filters.kinds?.length) count++;
  if (filters.accountIds?.length) count++;
  if (filters.categoryIds?.length) count++;
  if (filters.sources?.length) count++;
  if (filters.from || filters.to) count++;
  if (filters.minAmountMinor !== undefined || filters.maxAmountMinor !== undefined) count++;
  return count;
}
