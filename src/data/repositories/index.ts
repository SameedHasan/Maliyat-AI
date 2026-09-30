import { createAccountsRepository } from './accounts';
import { createAnalyticsRepository } from './analytics';
import { createCategoriesRepository } from './categories';
import type { RepoContext } from './context';
import { createTransactionsRepository } from './transactions';

export function createRepositories(ctx: RepoContext) {
  return {
    ctx,
    accounts: createAccountsRepository(ctx),
    categories: createCategoriesRepository(ctx),
    transactions: createTransactionsRepository(ctx),
    analytics: createAnalyticsRepository(ctx),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

export type { RepoContext } from './context';
export { RepositoryError } from './errors';
export type { AccountBalance } from './accounts';
export type { CategorySpend, IncomeExpenseSummary, PeriodRange } from './analytics';
export type { CategoryNode } from './categories';
export type { TransactionCursor, TransactionPage } from './transactions';
