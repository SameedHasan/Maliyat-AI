import type { Account, Category, TransactionWithEntries } from '@/domain/types';
import { netWorth } from '@/features/accounts/netWorth';
import type { Lookups } from '@/features/shared/lookups';
import { describeTransaction } from '@/features/transactions/describeTransaction';

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

function category(id: string, patch: Partial<Category> = {}): Category {
  return {
    ...sync,
    id,
    name: id,
    kind: 'expense',
    parentId: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isSystem: false,
    isArchived: false,
    ...patch,
  } as Category;
}

function tx(
  kind: TransactionWithEntries['kind'],
  entries: { accountId: string; categoryId: string | null; amountMinor: number }[],
  payee: string | null = null,
): TransactionWithEntries {
  return {
    ...sync,
    id: 't',
    kind,
    status: 'cleared',
    occurredOn: '2026-09-30',
    occurredAt: null,
    payee,
    notes: null,
    source: 'manual',
    sourceFingerprint: null,
    refundOfId: null,
    entries: entries.map((e, i) => ({
      ...sync,
      id: `e${i}`,
      transactionId: 't',
      currency: 'PKR',
      ...e,
    })),
  } as TransactionWithEntries;
}

describe('netWorth', () => {
  it('nets liabilities against assets and skips foreign-currency accounts', () => {
    const accounts = [
      account('hbl'),
      account('card', { type: 'credit_card', accountClass: 'liability' }),
      account('usd', { currency: 'USD' }),
    ];
    const balances = new Map([
      ['hbl', 500_000],
      ['card', -120_000],
      ['usd', 99_999],
    ]);
    expect(netWorth(accounts, balances)).toEqual({
      assetsMinor: 500_000,
      liabilitiesMinor: -120_000,
      netMinor: 380_000,
    });
  });
});

describe('describeTransaction', () => {
  const lookups: Lookups = {
    accounts: new Map([
      ['hbl', account('hbl', { name: 'HBL' })],
      ['jc', account('jc', { name: 'JazzCash', type: 'wallet' })],
    ]),
    categories: new Map([
      ['food', category('food', { name: 'Food', icon: 'restaurant-outline' })],
      ['groceries', category('groceries', { name: 'Groceries', parentId: 'food' })],
      ['fees', category('fees', { name: 'Transfer fees' })],
    ]),
  };
  const transfer = (from: string, to: string) => `${from} → ${to}`;

  it('uses payee, category and inherited parent icon for expenses', () => {
    const summary = describeTransaction(
      tx(
        'expense',
        [{ accountId: 'hbl', categoryId: 'groceries', amountMinor: -250_000 }],
        'Imtiaz',
      ),
      lookups,
      transfer,
    );
    expect(summary).toMatchObject({
      title: 'Imtiaz',
      categoryName: 'Groceries',
      accountLabel: 'HBL',
      amountMinor: -250_000,
      tone: 'signed',
      icon: 'restaurant-outline',
    });
  });

  it('shows the moved amount (not the fee) for transfers', () => {
    const summary = describeTransaction(
      tx('transfer', [
        { accountId: 'hbl', categoryId: null, amountMinor: -1_000_000 },
        { accountId: 'jc', categoryId: null, amountMinor: 1_000_000 },
        { accountId: 'hbl', categoryId: 'fees', amountMinor: -2_500 },
      ]),
      lookups,
      transfer,
    );
    expect(summary).toMatchObject({
      title: null,
      accountLabel: 'HBL → JazzCash',
      amountMinor: 1_000_000,
      tone: 'neutral',
    });
  });
});
