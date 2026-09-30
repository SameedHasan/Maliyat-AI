import type { Repositories } from '@/data/repositories';
import type { Account, Category } from '@/domain/types';

export interface Lookups {
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
}

/** Includes archived rows so historical transactions still resolve their names. */
export function loadLookups(repos: Repositories): Lookups {
  return {
    accounts: new Map(repos.accounts.list({ includeArchived: true }).map((a) => [a.id, a])),
    categories: new Map(repos.categories.list({ includeArchived: true }).map((c) => [c.id, c])),
  };
}
