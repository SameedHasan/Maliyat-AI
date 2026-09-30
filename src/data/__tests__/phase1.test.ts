/**
 * @jest-environment node
 */
import { budgetCategories } from '@/db/schema';
import { seedDatabase } from '@/db/seed';

import { RepositoryError } from '../repositories';
import { createTestRepositories, type TestRepositories } from '../testing/createTestRepositories';

let r: TestRepositories;
let categoryIds: Map<string, string>;

const cat = (key: string) => {
  const id = categoryIds.get(key);
  if (!id) throw new Error(`missing category ${key}`);
  return id;
};

function expectError(fn: () => unknown, code: RepositoryError['code']) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).code).toBe(code);
    return;
  }
  throw new Error(`Expected RepositoryError ${code}`);
}

function expense(
  accountId: string,
  categoryId: string,
  amount: number,
  occurredOn: string,
  payee?: string,
) {
  return r.transactions.create({
    kind: 'expense',
    occurredOn,
    payee,
    entries: [{ accountId, categoryId, amountMinor: -amount }],
  });
}

function income(accountId: string, categoryId: string, amount: number, occurredOn: string) {
  return r.transactions.create({
    kind: 'income',
    occurredOn,
    entries: [{ accountId, categoryId, amountMinor: amount }],
  });
}

beforeEach(() => {
  r = createTestRepositories();
  categoryIds = r.categories.seedDefaults();
});

afterEach(() => r.close());

describe('accounts (phase 1)', () => {
  it('summarises activity for an account in a range', () => {
    const bank = r.accounts.create({ name: 'Bank', type: 'bank', openingBalanceMinor: 1_000_000 });
    const cash = r.accounts.create({ name: 'Cash', type: 'cash' });
    income(bank.id, cat('salary'), 500_000, '2026-09-01');
    expense(bank.id, cat('groceries'), 30_000, '2026-09-05');
    r.transactions.create({
      kind: 'transfer',
      occurredOn: '2026-09-06',
      entries: [
        { accountId: bank.id, categoryId: null, amountMinor: -100_000 },
        { accountId: cash.id, categoryId: null, amountMinor: 100_000 },
        { accountId: bank.id, categoryId: cat('transfer_fees'), amountMinor: -500 },
      ],
    });
    expense(bank.id, cat('groceries'), 99_999, '2026-08-31');

    expect(r.accounts.activity(bank.id, { start: '2026-09-01', end: '2026-09-30' })).toEqual({
      incomeMinor: 500_000,
      expenseMinor: 30_500,
      transfersInMinor: 0,
      transfersOutMinor: 100_000,
    });
    expect(r.accounts.activity(cash.id, { start: '2026-09-01', end: '2026-09-30' })).toEqual({
      incomeMinor: 0,
      expenseMinor: 0,
      transfersInMinor: 100_000,
      transfersOutMinor: 0,
    });
  });

  it('builds month-end balance history', () => {
    const bank = r.accounts.create({ name: 'Bank', type: 'bank', openingBalanceMinor: 100_000 });
    expense(bank.id, cat('groceries'), 10_000, '2026-07-15');
    expense(bank.id, cat('groceries'), 20_000, '2026-09-02');
    const history = r.accounts.balanceHistory(bank.id, '2026-09-30', 4);
    // Opening balance is dated today (2026-09-30).
    expect(history).toEqual([
      { month: '2026-06', balanceMinor: 0 },
      { month: '2026-07', balanceMinor: -10_000 },
      { month: '2026-08', balanceMinor: -10_000 },
      { month: '2026-09', balanceMinor: 70_000 },
    ]);
  });

  it('deletes only accounts without history', () => {
    const empty = r.accounts.create({ name: 'Empty', type: 'cash' });
    const used = r.accounts.create({ name: 'Used', type: 'cash', openingBalanceMinor: 100 });
    expect(r.accounts.hasHistory(empty.id)).toBe(false);
    r.accounts.remove(empty.id);
    expect(r.accounts.get(empty.id)).toBeUndefined();
    expectError(() => r.accounts.remove(used.id), 'account_has_history');
  });
});

describe('transactions filters', () => {
  let bank: string;
  let cash: string;

  beforeEach(() => {
    bank = r.accounts.create({ name: 'Bank', type: 'bank' }).id;
    cash = r.accounts.create({ name: 'Cash', type: 'cash' }).id;
    expense(bank, cat('groceries'), 5_000, '2026-09-01', 'Imtiaz 100%');
    expense(cash, cat('restaurants'), 12_000, '2026-09-10', 'Kolachi');
    expense(cash, cat('fuel'), 8_000, '2026-09-12', 'PSO');
    income(bank, cat('salary'), 500_000, '2026-09-01');
  });

  const payees = (filters: Parameters<TestRepositories['transactions']['list']>[0]) =>
    r.transactions
      .list(filters)
      .items.map((t) => t.payee ?? t.kind)
      .sort();

  it('searches payee and notes, escaping LIKE wildcards', () => {
    expect(payees({ filters: { search: 'kola' } })).toEqual(['Kolachi']);
    expect(payees({ filters: { search: '100%' } })).toEqual(['Imtiaz 100%']);
    expect(payees({ filters: { search: '%' } })).toEqual(['Imtiaz 100%']);
  });

  it('filters by kind, account, dates and amount', () => {
    expect(payees({ filters: { kinds: ['income'] } })).toEqual(['income']);
    expect(payees({ filters: { accountIds: [cash] } })).toEqual(['Kolachi', 'PSO']);
    expect(payees({ filters: { from: '2026-09-10', to: '2026-09-11' } })).toEqual(['Kolachi']);
    expect(payees({ filters: { minAmountMinor: 8_000, maxAmountMinor: 12_000 } })).toEqual([
      'Kolachi',
      'PSO',
    ]);
  });

  it('includes subcategories when filtering by a parent category', () => {
    expect(payees({ filters: { categoryIds: [cat('food')] } })).toEqual(['Imtiaz 100%', 'Kolachi']);
    expect(payees({ filters: { categoryIds: [cat('fuel')] } })).toEqual(['PSO']);
  });

  it('paginates filtered results', () => {
    const first = r.transactions.list({ limit: 1, filters: { accountIds: [cash] } });
    expect(first.items[0]?.payee).toBe('PSO');
    const second = r.transactions.list({
      limit: 1,
      cursor: first.nextCursor,
      filters: { accountIds: [cash] },
    });
    expect(second.items[0]?.payee).toBe('Kolachi');
  });

  it('exports one row per entry with category paths', () => {
    const rows = r.transactions.exportEntries();
    expect(rows).toHaveLength(4);
    const kolachi = rows.find((row) => row.payee === 'Kolachi');
    expect(kolachi).toMatchObject({
      accountName: 'Cash',
      categoryName: 'Restaurants',
      parentCategoryName: 'Food',
      amountMinor: -12_000,
    });
  });

  it('lists refunds of an expense', () => {
    const original = expense(bank, cat('clothing'), 10_000, '2026-09-03', 'Outfitters');
    r.transactions.create({
      kind: 'refund',
      occurredOn: '2026-09-04',
      refundOfId: original.id,
      entries: [{ accountId: bank, categoryId: cat('clothing'), amountMinor: 4_000 }],
    });
    expect(r.transactions.refundsOf(original.id)).toHaveLength(1);
  });
});

describe('analytics (phase 1)', () => {
  let bank: string;
  const september = { start: '2026-09-01', end: '2026-09-30' };

  beforeEach(() => {
    bank = r.accounts.create({ name: 'Bank', type: 'bank' }).id;
    expense(bank, cat('groceries'), 5_000, '2026-09-01', 'Imtiaz');
    expense(bank, cat('restaurants'), 12_000, '2026-09-10', 'Kolachi');
    expense(bank, cat('food'), 1_000, '2026-09-11', 'imtiaz ');
    expense(bank, cat('fuel'), 8_000, '2026-09-12', 'PSO');
    income(bank, cat('salary'), 500_000, '2026-09-01');
  });

  it('breaks spending down by top-level and subcategory', () => {
    const top = r.analytics.categoryBreakdown(september, 'expense');
    expect(top.map((c) => [c.categoryName, c.amountMinor, c.hasChildren])).toEqual([
      ['Food', 18_000, true],
      ['Transport', 8_000, true],
    ]);
    const food = r.analytics.categoryBreakdown(september, 'expense', cat('food'));
    expect(food.map((c) => [c.categoryName, c.amountMinor])).toEqual([
      ['Restaurants', 12_000],
      ['Groceries', 5_000],
      ['Food', 1_000],
    ]);
    expect(r.analytics.categoryBreakdown(september, 'income')[0]?.amountMinor).toBe(500_000);
  });

  it('produces a complete cashflow series', () => {
    const daily = r.analytics.cashflowSeries(september, 'day');
    expect(daily).toHaveLength(30);
    expect(daily[0]).toEqual({ key: '2026-09-01', incomeMinor: 500_000, expenseMinor: 5_000 });
    const monthly = r.analytics.cashflowSeries({ start: '2026-08-01', end: '2026-09-30' }, 'month');
    expect(monthly).toEqual([
      { key: '2026-08', incomeMinor: 0, expenseMinor: 0 },
      { key: '2026-09', incomeMinor: 500_000, expenseMinor: 26_000 },
    ]);
  });

  it('groups payees case-insensitively and ranks by spend', () => {
    const payees = r.analytics.topPayees(september, 2);
    expect(payees.map((p) => [p.payee.toLowerCase(), p.expenseMinor, p.count])).toEqual([
      ['kolachi', 12_000, 1],
      ['pso', 8_000, 1],
    ]);
    const all = r.analytics.topPayees(september, 10);
    expect(all.find((p) => p.payee.toLowerCase() === 'imtiaz')).toMatchObject({
      expenseMinor: 6_000,
      count: 2,
    });
  });

  it('computes spending by account and net change', () => {
    expect(r.analytics.spendingByAccount(september)).toEqual([
      { accountId: bank, accountName: 'Bank', expenseMinor: 26_000 },
    ]);
    expect(r.analytics.netChange(september, 'PKR')).toBe(500_000 - 26_000);
  });
});

describe('budgets', () => {
  let bank: string;

  beforeEach(() => {
    bank = r.accounts.create({ name: 'Bank', type: 'bank' }).id;
  });

  it('creates a budget with categories and queues the aggregate', () => {
    const budget = r.budgets.create({
      name: 'Food',
      period: 'monthly',
      startOn: '2026-09-01',
      amountMinor: 50_000,
      categoryIds: [cat('food')],
    });
    expect(r.budgets.get(budget.id)?.categoryIds).toEqual([cat('food')]);
    expect(r.budgets.list()).toHaveLength(1);
  });

  it('tracks spend including subcategories and refunds', () => {
    const budget = r.budgets.create({
      name: 'Food',
      period: 'monthly',
      startOn: '2026-09-01',
      amountMinor: 50_000,
      categoryIds: [cat('food')],
    });
    const meal = expense(bank, cat('restaurants'), 30_000, '2026-09-10');
    expense(bank, cat('groceries'), 15_000, '2026-09-11');
    expense(bank, cat('fuel'), 99_000, '2026-09-11');
    r.transactions.create({
      kind: 'refund',
      occurredOn: '2026-09-12',
      refundOfId: meal.id,
      entries: [{ accountId: bank, categoryId: cat('restaurants'), amountMinor: 5_000 }],
    });
    const status = r.budgets.statusOf(r.budgets.get(budget.id)!, '2026-09-30');
    expect(status).toMatchObject({ spentMinor: 40_000, remainingMinor: 10_000, percentUsed: 80 });
    expect(status?.state).toBe('warning');
  });

  it('carries unused amounts forward with rollover', () => {
    const budget = r.budgets.create({
      name: 'Transport',
      period: 'monthly',
      startOn: '2026-08-01',
      amountMinor: 10_000,
      rollover: true,
      categoryIds: [cat('transport')],
    });
    expense(bank, cat('fuel'), 4_000, '2026-08-20');
    expense(bank, cat('fuel'), 12_000, '2026-09-20');
    const status = r.budgets.statusOf(r.budgets.get(budget.id)!, '2026-09-30');
    expect(status).toMatchObject({ carryOverMinor: 6_000, availableMinor: 16_000, state: 'ok' });
  });

  it('rejects income categories and updates category links', () => {
    expectError(
      () =>
        r.budgets.create({
          name: 'Bad',
          period: 'monthly',
          startOn: '2026-09-01',
          amountMinor: 100,
          categoryIds: [cat('salary')],
        }),
      'invalid_input',
    );
    const budget = r.budgets.create({
      name: 'Mixed',
      period: 'weekly',
      startOn: '2026-09-01',
      amountMinor: 100,
      categoryIds: [cat('food')],
    });
    const updated = r.budgets.update(budget.id, {
      name: 'Mixed',
      period: 'weekly',
      startOn: '2026-09-01',
      amountMinor: 200,
      categoryIds: [cat('transport'), cat('shopping')],
    });
    expect(updated.categoryIds.sort()).toEqual([cat('transport'), cat('shopping')].sort());
    r.budgets.remove(budget.id);
    expect(r.budgets.get(budget.id)).toBeUndefined();
  });

  it('follows a replacement when a tracked category is deleted', () => {
    const budget = r.budgets.create({
      name: 'Coffee',
      period: 'monthly',
      startOn: '2026-09-01',
      amountMinor: 100,
      categoryIds: [cat('coffee')],
    });
    expense(bank, cat('coffee'), 500, '2026-09-10');
    r.categories.remove(cat('coffee'), cat('restaurants'));
    expect(r.budgets.get(budget.id)?.categoryIds).toEqual([cat('restaurants')]);

    const other = r.budgets.create({
      name: 'Books',
      period: 'monthly',
      startOn: '2026-09-01',
      amountMinor: 100,
      categoryIds: [cat('books'), cat('fees')],
    });
    r.categories.remove(cat('books'));
    expect(r.budgets.get(other.id)?.categoryIds).toEqual([cat('fees')]);
    expect(r.ctx.db.select().from(budgetCategories).all()).toHaveLength(2);
  });

  it('counts category usage', () => {
    expense(bank, cat('coffee'), 500, '2026-09-10');
    expect(r.categories.usageCount(cat('coffee'))).toBe(1);
    expect(r.categories.usageCount(cat('books'))).toBe(0);
  });
});

describe('seed', () => {
  it('seeds demo budgets without queueing sync changes', () => {
    seedDatabase(r, { months: 4 });
    const statuses = r.budgets.listWithStatus();
    expect(statuses).toHaveLength(3);
    expect(statuses.every((b) => b.status !== null)).toBe(true);
  });
});
