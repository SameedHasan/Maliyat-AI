/**
 * @jest-environment node
 */
import { outbox } from '@/db/schema';

import { RepositoryError } from '../repositories';
import { insertTransactionsBulk } from '../repositories/transactions';
import { createTestRepositories, type TestRepositories } from '../testing/createTestRepositories';

let r: TestRepositories;
let categoryIds: Map<string, string>;

const cat = (key: string) => {
  const id = categoryIds.get(key);
  if (!id) throw new Error(`missing category ${key}`);
  return id;
};

function outboxRows() {
  return r.ctx.db.select().from(outbox).all();
}

function expectError(fn: () => unknown, code: RepositoryError['code']) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).code).toBe(code);
    return error as RepositoryError;
  }
  throw new Error(`Expected RepositoryError ${code}`);
}

beforeEach(() => {
  r = createTestRepositories();
  categoryIds = r.categories.seedDefaults();
});

afterEach(() => r.close());

describe('accounts', () => {
  it('creates an account with an opening balance entry', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank', openingBalanceMinor: 5_000_000 });
    expect(bank.accountClass).toBe('asset');
    expect(r.accounts.balanceOf(bank.id)).toBe(5_000_000);

    const page = r.transactions.list();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.kind).toBe('opening_balance');
  });

  it('classifies credit cards as liabilities', () => {
    const card = r.accounts.create({
      name: 'Card',
      type: 'credit_card',
      creditLimitMinor: 20_000_000,
      openingBalanceMinor: -1_000_000,
    });
    expect(card.accountClass).toBe('liability');
    expect(r.accounts.balanceOf(card.id)).toBe(-1_000_000);
  });

  it('skips the opening balance transaction when zero', () => {
    r.accounts.create({ name: 'Cash', type: 'cash' });
    expect(r.transactions.list().items).toHaveLength(0);
  });

  it('reconciles by creating an adjustment for the difference', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank', openingBalanceMinor: 100_000 });
    const adjustmentId = r.accounts.reconcile(bank.id, 90_000);
    expect(adjustmentId).not.toBeNull();
    expect(r.accounts.balanceOf(bank.id)).toBe(90_000);
    expect(r.accounts.reconcile(bank.id, 90_000)).toBeNull();
  });

  it('archives instead of deleting and hides archived accounts by default', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank' });
    r.accounts.setArchived(bank.id, true);
    expect(r.accounts.list()).toHaveLength(0);
    expect(r.accounts.list({ includeArchived: true })).toHaveLength(1);
  });

  it('rejects invalid input', () => {
    expectError(() => r.accounts.create({ name: '', type: 'bank' }), 'invalid_input');
    expectError(
      () => r.accounts.create({ name: 'X', type: 'cash', creditLimitMinor: 100 }),
      'invalid_input',
    );
  });
});

describe('transactions', () => {
  let bankId: string;
  let walletId: string;

  beforeEach(() => {
    bankId = r.accounts.create({ name: 'HBL', type: 'bank', openingBalanceMinor: 10_000_000 }).id;
    walletId = r.accounts.create({ name: 'JazzCash', type: 'wallet' }).id;
  });

  it('records an expense and updates the balance', () => {
    r.transactions.create({
      kind: 'expense',
      occurredOn: '2026-09-30',
      payee: 'Imtiaz',
      entries: [{ accountId: bankId, categoryId: cat('groceries'), amountMinor: -250_000 }],
    });
    expect(r.accounts.balanceOf(bankId)).toBe(9_750_000);
  });

  it('records a transfer with a fee atomically', () => {
    r.transactions.create({
      kind: 'transfer',
      occurredOn: '2026-09-30',
      entries: [
        { accountId: bankId, categoryId: null, amountMinor: -1_000_000 },
        { accountId: walletId, categoryId: null, amountMinor: 1_000_000 },
        { accountId: bankId, categoryId: cat('transfer_fees'), amountMinor: -5_000 },
      ],
    });
    expect(r.accounts.balanceOf(bankId)).toBe(8_995_000);
    expect(r.accounts.balanceOf(walletId)).toBe(1_000_000);
  });

  it('rejects ledger violations without writing anything', () => {
    const before = outboxRows().length;
    const error = expectError(
      () =>
        r.transactions.create({
          kind: 'transfer',
          occurredOn: '2026-09-30',
          entries: [
            { accountId: bankId, categoryId: null, amountMinor: -1_000_000 },
            { accountId: walletId, categoryId: null, amountMinor: 900_000 },
          ],
        }),
      'ledger_violation',
    );
    expect(error.details?.ledgerIssues?.map((i) => i.code)).toEqual(['transfer_unbalanced']);
    expect(r.accounts.balanceOf(bankId)).toBe(10_000_000);
    expect(outboxRows()).toHaveLength(before);
  });

  it('bulk-inserts all-or-nothing, optionally skipping the outbox', () => {
    const expense = (amountMinor: number) => ({
      kind: 'expense' as const,
      occurredOn: '2026-09-30',
      entries: [{ accountId: bankId, categoryId: cat('groceries'), amountMinor }],
    });
    const before = outboxRows().length;

    expect(() =>
      r.ctx.db.transaction((tx) =>
        insertTransactionsBulk(tx, r.ctx, [expense(-100), expense(100)], { enqueue: true }),
      ),
    ).toThrow(RepositoryError);
    expect(r.accounts.balanceOf(bankId)).toBe(10_000_000);

    r.ctx.db.transaction((tx) =>
      insertTransactionsBulk(tx, r.ctx, [expense(-100), expense(-200)], { enqueue: false }),
    );
    expect(r.accounts.balanceOf(bankId)).toBe(9_999_700);
    expect(outboxRows()).toHaveLength(before);

    r.ctx.db.transaction((tx) =>
      insertTransactionsBulk(tx, r.ctx, [expense(-50)], { enqueue: true }),
    );
    expect(outboxRows()).toHaveLength(before + 1);
  });

  it('rejects references to unknown accounts', () => {
    expectError(
      () =>
        r.transactions.create({
          kind: 'expense',
          occurredOn: '2026-09-30',
          entries: [
            {
              accountId: '00000000-0000-7000-8000-0000000000ff',
              categoryId: cat('groceries'),
              amountMinor: -100,
            },
          ],
        }),
      'ledger_violation',
    );
  });

  it('updates by replacing entries as a unit', () => {
    const created = r.transactions.create({
      kind: 'expense',
      occurredOn: '2026-09-30',
      entries: [{ accountId: bankId, categoryId: cat('groceries'), amountMinor: -250_000 }],
    });
    const updated = r.transactions.update(created.id, {
      kind: 'expense',
      occurredOn: '2026-09-29',
      entries: [
        { accountId: bankId, categoryId: cat('groceries'), amountMinor: -150_000 },
        { accountId: bankId, categoryId: cat('household'), amountMinor: -50_000 },
      ],
    });
    expect(updated.entries).toHaveLength(2);
    expect(r.transactions.get(created.id)?.entries).toHaveLength(2);
    expect(r.accounts.balanceOf(bankId)).toBe(9_800_000);
  });

  it('soft deletes and restores (undo)', () => {
    const created = r.transactions.create({
      kind: 'expense',
      occurredOn: '2026-09-30',
      entries: [{ accountId: bankId, categoryId: cat('groceries'), amountMinor: -250_000 }],
    });
    r.transactions.remove(created.id);
    expect(r.transactions.get(created.id)).toBeUndefined();
    expect(r.accounts.balanceOf(bankId)).toBe(10_000_000);

    r.transactions.restore(created.id);
    expect(r.transactions.get(created.id)).toBeDefined();
    expect(r.accounts.balanceOf(bankId)).toBe(9_750_000);
  });

  it('paginates newest first with a keyset cursor', () => {
    for (let day = 1; day <= 25; day++) {
      r.transactions.create({
        kind: 'expense',
        occurredOn: `2026-09-${String(day).padStart(2, '0')}`,
        entries: [{ accountId: bankId, categoryId: cat('coffee'), amountMinor: -10_000 }],
      });
    }
    const seen: string[] = [];
    let cursor = null;
    do {
      const page: ReturnType<typeof r.transactions.list> = r.transactions.list({
        limit: 10,
        cursor,
      });
      seen.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor;
    } while (cursor);

    // 25 expenses + 1 opening balance, no duplicates, newest date first.
    expect(seen).toHaveLength(26);
    expect(new Set(seen).size).toBe(26);
    expect(r.transactions.get(seen[0]!)?.occurredOn).toBe('2026-09-30');
  });
});

describe('outbox', () => {
  it('queues one change per write and coalesces repeated edits', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank' });
    const before = outboxRows().filter((o) => o.recordId === bank.id);
    expect(before).toHaveLength(1);

    r.accounts.update(bank.id, { name: 'HBL Main' });
    r.accounts.update(bank.id, { name: 'HBL Salary' });
    const after = outboxRows().filter((o) => o.recordId === bank.id);
    expect(after).toHaveLength(1);
    expect((after[0]?.payload as { name: string }).name).toBe('HBL Salary');
    // Still an unsynced insert, so the base version stays null.
    expect(after[0]?.baseVersion).toBeNull();
  });

  it('queues transaction aggregates with their entries', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank', openingBalanceMinor: 100 });
    const change = outboxRows().find((o) => o.entity === 'transaction');
    const payload = change?.payload as { entries: { accountId: string }[] };
    expect(payload.entries[0]?.accountId).toBe(bank.id);
  });
});

describe('categories', () => {
  it('seeds a two-level default tree', () => {
    const tree = r.categories.tree('expense');
    const food = tree.find((c) => c.name === 'Food');
    expect(food?.children.map((c) => c.name)).toContain('Groceries');
    expect(r.categories.tree('income').length).toBeGreaterThan(0);
  });

  it('rejects nesting deeper than two levels or across kinds', () => {
    expectError(
      () => r.categories.create({ name: 'Organic', kind: 'expense', parentId: cat('groceries') }),
      'invalid_parent',
    );
    expectError(
      () => r.categories.create({ name: 'Bonus', kind: 'income', parentId: cat('food') }),
      'invalid_parent',
    );
  });

  it('requires a replacement when deleting a used category', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank' });
    r.transactions.create({
      kind: 'expense',
      occurredOn: '2026-09-30',
      entries: [{ accountId: bank.id, categoryId: cat('coffee'), amountMinor: -10_000 }],
    });

    expectError(() => r.categories.remove(cat('coffee')), 'category_in_use');
    expectError(() => r.categories.remove(cat('coffee'), cat('salary')), 'category_in_use');

    r.categories.remove(cat('coffee'), cat('restaurants'));
    expect(r.categories.get(cat('coffee'))).toBeUndefined();
    const txn = r.transactions.list().items[0];
    expect(txn?.entries[0]?.categoryId).toBe(cat('restaurants'));
  });

  it('refuses to delete a category with subcategories', () => {
    expectError(() => r.categories.remove(cat('food')), 'category_has_children');
  });
});

describe('analytics', () => {
  it('counts expenses, income and refunds but not transfers, adjustments or openings', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank', openingBalanceMinor: 10_000_000 });
    const wallet = r.accounts.create({ name: 'JazzCash', type: 'wallet' });
    const on = '2026-09-15';

    r.transactions.create({
      kind: 'income',
      occurredOn: on,
      entries: [{ accountId: bank.id, categoryId: cat('salary'), amountMinor: 15_000_000 }],
    });
    r.transactions.create({
      kind: 'expense',
      occurredOn: on,
      entries: [
        { accountId: bank.id, categoryId: cat('groceries'), amountMinor: -300_000 },
        { accountId: bank.id, categoryId: cat('household'), amountMinor: -100_000 },
      ],
    });
    r.transactions.create({
      kind: 'refund',
      occurredOn: on,
      entries: [{ accountId: bank.id, categoryId: cat('groceries'), amountMinor: 50_000 }],
    });
    r.transactions.create({
      kind: 'transfer',
      occurredOn: on,
      entries: [
        { accountId: bank.id, categoryId: null, amountMinor: -1_000_000 },
        { accountId: wallet.id, categoryId: null, amountMinor: 1_000_000 },
        { accountId: bank.id, categoryId: cat('transfer_fees'), amountMinor: -2_000 },
      ],
    });
    r.accounts.reconcile(bank.id, 1_000);

    const summary = r.analytics.incomeExpense({ start: '2026-09-01', end: '2026-09-30' });
    expect(summary).toEqual({
      incomeMinor: 15_000_000,
      expenseMinor: 352_000,
      netMinor: 14_648_000,
    });

    const byCategory = r.analytics.spendingByCategory({ start: '2026-09-01', end: '2026-09-30' });
    expect(byCategory.map((c) => [c.categoryName, c.expenseMinor])).toEqual([
      ['Food', 250_000],
      ['Shopping', 100_000],
      ['Bank Charges', 2_000],
    ]);
  });

  it('respects the date range', () => {
    const bank = r.accounts.create({ name: 'HBL', type: 'bank' });
    r.transactions.create({
      kind: 'expense',
      occurredOn: '2026-08-31',
      entries: [{ accountId: bank.id, categoryId: cat('coffee'), amountMinor: -10_000 }],
    });
    expect(r.analytics.incomeExpense({ start: '2026-09-01', end: '2026-09-30' }).expenseMinor).toBe(
      0,
    );
  });
});
