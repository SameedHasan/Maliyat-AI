import { createAccountsRepository } from './accounts';
import { createAnalyticsRepository } from './analytics';
import { createBudgetsRepository } from './budgets';
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
    budgets: createBudgetsRepository(ctx),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

export type { RepoContext } from './context';
export { RepositoryError, type RepositoryErrorCode } from './errors';
export type { AccountActivity, AccountBalance, BalancePoint } from './accounts';
export type {
  AccountSpend,
  CashflowPoint,
  CategoryAmount,
  CategorySpend,
  IncomeExpenseSummary,
  PayeeSpend,
  PeriodRange,
} from './analytics';
export type { BudgetWithStatus } from './budgets';
export type { CategoryNode } from './categories';
export type {
  ExportEntryRow,
  TransactionCursor,
  TransactionFilters,
  TransactionPage,
} from './transactions';
