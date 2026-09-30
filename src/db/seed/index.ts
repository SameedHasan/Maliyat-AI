import { insertTransactionsBulk } from '../../data/repositories/transactions';
import type { Repositories } from '../../data/repositories';
import { addMonths, monthRange, toLocalDate } from '../../domain/dates';
import {
  accounts,
  budgetCategories,
  budgets,
  categories,
  outbox,
  syncState,
  transactionEntries,
  transactions,
} from '../schema';
import { generateSeedTransactions, type SeedAccountIds } from './generate';
import { createRandom } from './random';

export interface SeedResult {
  accounts: number;
  transactions: number;
}

/** Wipes all local data. Dev-only; real sign-out deletes the database file instead. */
export function clearDatabase(repos: Repositories): void {
  const { db } = repos.ctx;
  db.transaction((tx) => {
    tx.delete(outbox).run();
    tx.delete(syncState).run();
    tx.delete(budgetCategories).run();
    tx.delete(budgets).run();
    tx.delete(transactionEntries).run();
    tx.delete(transactions).run();
    tx.delete(categories).run();
    tx.delete(accounts).run();
  });
}

/**
 * Replaces local data with a realistic demo dataset (≈18 months of activity).
 * Every transaction goes through the same validation as real writes. Seeded changes
 * are removed from the outbox so demo data is never synced.
 */
export function seedDatabase(
  repos: Repositories,
  options: { seed?: number; months?: number } = {},
): SeedResult {
  const { seed = 42, months = 18 } = options;
  clearDatabase(repos);

  const categoryIds = repos.categories.seedDefaults();
  const category = (key: string) => {
    const id = categoryIds.get(key);
    if (!id) throw new Error(`Seed references unknown category "${key}"`);
    return id;
  };

  const create = repos.accounts.create;
  const ids: SeedAccountIds = {
    cash: create({ name: 'Cash', type: 'cash', openingBalanceMinor: 1_500_000 }).id,
    hbl: create({
      name: 'HBL Current',
      type: 'bank',
      institution: 'HBL',
      last4: '4821',
      openingBalanceMinor: 25_000_000,
    }).id,
    meezan: create({
      name: 'Meezan Savings',
      type: 'bank',
      institution: 'Meezan Bank',
      last4: '1177',
      openingBalanceMinor: 60_000_000,
    }).id,
    jazzcash: create({ name: 'JazzCash', type: 'wallet', openingBalanceMinor: 500_000 }).id,
    easypaisa: create({ name: 'Easypaisa', type: 'wallet', openingBalanceMinor: 200_000 }).id,
    card: create({
      name: 'Alfalah Credit Card',
      type: 'credit_card',
      institution: 'Bank Alfalah',
      last4: '9034',
      creditLimitMinor: 30_000_000,
      openingBalanceMinor: -2_000_000,
    }).id,
  };

  const today = toLocalDate(repos.ctx.now(), repos.ctx.timeZone);
  const drafts = generateSeedTransactions({
    today,
    months,
    random: createRandom(seed),
    accounts: ids,
    category,
  });

  const { db } = repos.ctx;
  const startOn = addMonths(monthRange(today).start, -3);
  db.transaction((tx) => {
    insertTransactionsBulk(tx, repos.ctx, drafts, { enqueue: false });
  });
  repos.budgets.create({
    name: 'Food',
    period: 'monthly',
    startOn,
    amountMinor: 6_000_000,
    categoryIds: [category('food')],
  });
  repos.budgets.create({
    name: 'Getting around',
    period: 'monthly',
    startOn,
    amountMinor: 2_500_000,
    rollover: true,
    categoryIds: [category('transport')],
  });
  repos.budgets.create({
    name: 'Shopping',
    period: 'monthly',
    startOn,
    amountMinor: 2_000_000,
    categoryIds: [category('shopping')],
  });
  db.delete(outbox).run();

  return { accounts: Object.keys(ids).length, transactions: drafts.length };
}
