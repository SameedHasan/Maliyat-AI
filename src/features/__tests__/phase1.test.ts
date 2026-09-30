import type { ExportEntryRow } from '@/data/repositories';
import type { Account, TransactionWithEntries } from '@/domain/types';
import { groupAccounts, groupOf } from '@/features/accounts/groups';
import { percentChange, savingsRate, shareOf } from '@/features/analytics/metrics';
import { moveSibling } from '@/features/categories/reorder';
import { compareMonthlySpending } from '@/features/home/spendingComparison';
import { shouldRelock } from '@/features/security/lock';
import { entriesToCsv, exportFileName } from '@/features/settings/exportRows';
import { groupByDate } from '@/features/transactions/grouping';

const sync = {
  userId: 'u',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  deletedAt: null,
  version: 1,
};

function account(id: string, patch: Partial<Account> = {}): Account {
  return {
    ...sync,
    id,
    name: id.toUpperCase(),
    type: 'bank',
    accountClass: 'asset',
    currency: 'PKR',
    institution: null,
    last4: null,
    creditLimitMinor: null,
    color: null,
    icon: null,
    sortOrder: 0,
    isArchived: false,
    ...patch,
  } as Account;
}

function tx(
  id: string,
  occurredOn: string,
  kind: TransactionWithEntries['kind'],
  amounts: number[],
): TransactionWithEntries {
  return {
    ...sync,
    id,
    kind,
    status: 'cleared',
    occurredOn,
    occurredAt: null,
    payee: null,
    notes: null,
    source: 'manual',
    sourceFingerprint: null,
    refundOfId: null,
    entries: amounts.map((amountMinor, i) => ({
      ...sync,
      id: `${id}-e${i}`,
      transactionId: id,
      accountId: 'a',
      categoryId: null,
      currency: 'PKR',
      amountMinor,
    })),
  } as TransactionWithEntries;
}

describe('groupAccounts', () => {
  it('orders groups, drops empty ones and subtotals base-currency balances', () => {
    const accounts = [
      account('card', { type: 'credit_card', accountClass: 'liability' }),
      account('hbl'),
      account('usd', { currency: 'USD' }),
      account('wallet', { type: 'wallet' }),
      account('gold', { type: 'other_asset' }),
    ];
    const balances = new Map([
      ['card', -40_000],
      ['hbl', 100_000],
      ['usd', 5_000],
      ['wallet', 2_500],
    ]);
    const sections = groupAccounts(accounts, balances);
    expect(sections.map((s) => s.group)).toEqual(['bank', 'wallet', 'credit_card', 'other']);
    expect(sections[0]).toMatchObject({ subtotalMinor: 100_000 });
    expect(sections[0]?.data.map((row) => row.account.id)).toEqual(['hbl', 'usd']);
    expect(sections[2]).toMatchObject({ subtotalMinor: -40_000 });
    expect(sections[3]?.data[0]).toMatchObject({ balanceMinor: 0 });
  });

  it('maps both "other" types into one group', () => {
    expect(groupOf('other_asset')).toBe('other');
    expect(groupOf('other_liability')).toBe('other');
    expect(groupOf('committee')).toBe('committee');
  });
});

describe('moveSibling', () => {
  it('swaps with the neighbour in the given direction', () => {
    expect(moveSibling(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveSibling(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('returns null at either end or for unknown ids', () => {
    expect(moveSibling(['a', 'b'], 'a', -1)).toBeNull();
    expect(moveSibling(['a', 'b'], 'b', 1)).toBeNull();
    expect(moveSibling(['a', 'b'], 'z', 1)).toBeNull();
  });
});

describe('groupByDate', () => {
  it('adds a header per day with the net of non-transfer entries', () => {
    const items = groupByDate([
      tx('t1', '2026-09-30', 'expense', [-1_000]),
      tx('t2', '2026-09-30', 'transfer', [-5_000, 5_000 - 100]),
      tx('t3', '2026-09-30', 'income', [20_000]),
      tx('t4', '2026-09-29', 'refund', [300]),
    ]);
    expect(items.map((item) => item.key)).toEqual([
      'h-2026-09-30',
      't1',
      't2',
      't3',
      'h-2026-09-29',
      't4',
    ]);
    expect(items[0]).toMatchObject({ type: 'header', netMinor: 19_000 });
    expect(items[4]).toMatchObject({ type: 'header', netMinor: 300 });
  });

  it('returns nothing for an empty list', () => {
    expect(groupByDate([])).toEqual([]);
  });
});

describe('compareMonthlySpending', () => {
  it('accumulates spend and compares at the same day of month', () => {
    const current = [100, 0, 200, 50, 0];
    const previous = [300, 300, 0, 0, 0, 1_000, 1_000];
    const result = compareMonthlySpending(current, previous, '2026-09-03');
    expect(result.current).toEqual([100, 100, 300, null, null]);
    expect(result.previous).toEqual([300, 600, 600, 600, 600]);
    expect(result.currentToDateMinor).toBe(300);
    expect(result.previousToDateMinor).toBe(600);
  });

  it('holds last month flat when it is shorter than this month', () => {
    const result = compareMonthlySpending([0, 0, 0, 0], [10, 20], '2026-09-04');
    expect(result.previous).toEqual([10, 30, 30, 30]);
    expect(result.previousToDateMinor).toBe(30);
  });
});

describe('analytics metrics', () => {
  it('computes savings rate, including overspending', () => {
    expect(savingsRate(100_000, 75_000)).toBe(25);
    expect(savingsRate(100_000, 150_000)).toBe(-50);
    expect(savingsRate(0, 10_000)).toBeNull();
  });

  it('computes percent change against the previous value', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });

  it('never returns NaN for shares', () => {
    expect(shareOf(1, 3)).toBe(33);
    expect(shareOf(5, 0)).toBe(0);
  });
});

describe('shouldRelock', () => {
  it('locks once the timeout has elapsed', () => {
    expect(shouldRelock(0, 59_999, 60)).toBe(false);
    expect(shouldRelock(0, 60_000, 60)).toBe(true);
    expect(shouldRelock(1_000, 1_000, 0)).toBe(true);
  });
});

describe('CSV export', () => {
  const base: ExportEntryRow = {
    transactionId: 'tx1',
    occurredOn: '2026-09-30',
    kind: 'expense',
    status: 'cleared',
    payee: 'Imtiaz, Gulberg',
    notes: '=HYPERLINK("x")',
    source: 'manual',
    accountName: 'HBL',
    categoryName: 'Groceries',
    parentCategoryName: 'Food',
    amountMinor: -250_050,
    currency: 'PKR',
  };

  it('writes one row per entry with signed decimal amounts and split categories', () => {
    const csv = entriesToCsv([
      base,
      { ...base, categoryName: 'Salary', parentCategoryName: null, amountMinor: 5, notes: null },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'date,type,status,account,category,subcategory,amount,currency,payee,notes,source,transaction_id',
    );
    expect(lines[1]).toBe(
      `2026-09-30,expense,cleared,HBL,Food,Groceries,-2500.50,PKR,"Imtiaz, Gulberg","'=HYPERLINK(""x"")",manual,tx1`,
    );
    expect(lines[2]).toBe(
      '2026-09-30,expense,cleared,HBL,Salary,,0.05,PKR,"Imtiaz, Gulberg",,manual,tx1',
    );
    expect(lines[3]).toBe('');
  });

  it('names the file after the export date', () => {
    expect(exportFileName('2026-09-30')).toBe('maliyat-transactions-2026-09-30.csv');
  });
});
