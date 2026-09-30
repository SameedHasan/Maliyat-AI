import {
  amountToInput,
  buildTransactionInput,
  emptyFormState,
  formStateFromTransaction,
  splitRemaining,
  type TransactionFormState,
} from '../transactionForm';
import type { TransactionWithEntries } from '../types';

const BANK = '00000000-0000-7000-8000-0000000000b1';
const WALLET = '00000000-0000-7000-8000-0000000000b2';
const FOOD = '00000000-0000-7000-8000-0000000000c1';
const HOME = '00000000-0000-7000-8000-0000000000c2';
const FEES = '00000000-0000-7000-8000-0000000000c3';
const TODAY = '2026-09-30';

function state(patch: Partial<TransactionFormState>): TransactionFormState {
  return { ...emptyFormState('expense', TODAY), accountId: BANK, ...patch };
}

describe('buildTransactionInput', () => {
  it('builds a negative expense entry', () => {
    const result = buildTransactionInput(
      state({ amount: '2,500.50', categoryId: FOOD, payee: ' Imtiaz ' }),
      'PKR',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.entries).toEqual([
      { accountId: BANK, categoryId: FOOD, amountMinor: -250_050 },
    ]);
    expect(result.input.kind).toBe('expense');
    expect(result.input.refundOfId).toBeNull();
  });

  it('builds positive income and refund entries', () => {
    const income = buildTransactionInput(
      state({ kind: 'income', amount: '1000', categoryId: FOOD }),
      'PKR',
    );
    expect(income.ok && income.input.entries[0]?.amountMinor).toBe(100_000);

    const refund = buildTransactionInput(
      state({ kind: 'refund', amount: '500', categoryId: FOOD, refundOfId: HOME }),
      'PKR',
    );
    expect(refund.ok && refund.input.entries[0]?.amountMinor).toBe(50_000);
    expect(refund.ok && refund.input.refundOfId).toBe(HOME);
  });

  it('reports missing and invalid fields', () => {
    const result = buildTransactionInput(state({ amount: '', accountId: null }), 'PKR');
    expect(result).toEqual({
      ok: false,
      errors: { amount: 'required', accountId: 'required', categoryId: 'required' },
    });
    expect(buildTransactionInput(state({ amount: '0', categoryId: FOOD }), 'PKR')).toMatchObject({
      errors: { amount: 'must_be_positive' },
    });
    expect(
      buildTransactionInput(state({ amount: '1.234', categoryId: FOOD }), 'PKR'),
    ).toMatchObject({
      errors: { amount: 'too_many_decimals' },
    });
    expect(buildTransactionInput(state({ amount: 'abc', categoryId: FOOD }), 'PKR')).toMatchObject({
      errors: { amount: 'invalid' },
    });
  });

  it('splits one expense across categories when the lines add up', () => {
    const splits = [
      { key: 'a', categoryId: FOOD, amount: '1,500' },
      { key: 'b', categoryId: HOME, amount: '500.25' },
    ];
    const ok = buildTransactionInput(state({ amount: '2000.25', split: true, splits }), 'PKR');
    expect(ok.ok && ok.input.entries).toEqual([
      { accountId: BANK, categoryId: FOOD, amountMinor: -150_000 },
      { accountId: BANK, categoryId: HOME, amountMinor: -50_025 },
    ]);

    const mismatch = buildTransactionInput(state({ amount: '2500', split: true, splits }), 'PKR');
    expect(mismatch).toEqual({ ok: false, errors: { splits: 'split_mismatch' } });
  });

  it('validates each split line', () => {
    const result = buildTransactionInput(
      state({
        amount: '100',
        split: true,
        splits: [
          { key: 'a', categoryId: null, amount: '50' },
          { key: 'b', categoryId: HOME, amount: '' },
        ],
      }),
      'PKR',
    );
    expect(result).toEqual({
      ok: false,
      errors: { 'splits.0.categoryId': 'required', 'splits.1.amount': 'required' },
    });
    expect(
      buildTransactionInput(
        state({
          amount: '100',
          split: true,
          splits: [{ key: 'a', categoryId: FOOD, amount: '100' }],
        }),
        'PKR',
      ),
    ).toMatchObject({ errors: { splits: 'split_too_few' } });
  });

  it('shows the unallocated remainder while splitting', () => {
    const remaining = splitRemaining(
      state({
        amount: '1000',
        split: true,
        splits: [
          { key: 'a', categoryId: FOOD, amount: '250' },
          { key: 'b', categoryId: HOME, amount: 'oops' },
        ],
      }),
      'PKR',
    );
    expect(remaining?.amountMinor).toBe(75_000);
  });

  it('builds transfers with an optional fee on the source account', () => {
    const plain = buildTransactionInput(
      state({ kind: 'transfer', amount: '10000', toAccountId: WALLET }),
      'PKR',
    );
    expect(plain.ok && plain.input.entries).toEqual([
      { accountId: BANK, categoryId: null, amountMinor: -1_000_000 },
      { accountId: WALLET, categoryId: null, amountMinor: 1_000_000 },
    ]);

    const withFee = buildTransactionInput(
      state({
        kind: 'transfer',
        amount: '10000',
        toAccountId: WALLET,
        fee: '50',
        feeCategoryId: FEES,
      }),
      'PKR',
    );
    expect(withFee.ok && withFee.input.entries[2]).toEqual({
      accountId: BANK,
      categoryId: FEES,
      amountMinor: -5_000,
    });
  });

  it('rejects transfers to the same account and fees without a category', () => {
    expect(
      buildTransactionInput(state({ kind: 'transfer', amount: '10', toAccountId: BANK }), 'PKR'),
    ).toEqual({ ok: false, errors: { toAccountId: 'same_account' } });
    expect(
      buildTransactionInput(
        state({ kind: 'transfer', amount: '10', toAccountId: WALLET, fee: '1' }),
        'PKR',
      ),
    ).toEqual({ ok: false, errors: { feeCategoryId: 'required' } });
  });
});

function tx(
  kind: TransactionWithEntries['kind'],
  entries: { accountId: string; categoryId: string | null; amountMinor: number }[],
): TransactionWithEntries {
  const sync = { userId: 'u', createdAt: '', updatedAt: '', deletedAt: null, version: 1 };
  return {
    ...sync,
    id: '00000000-0000-7000-8000-0000000000f1',
    kind,
    status: 'cleared',
    occurredOn: '2026-09-12',
    occurredAt: null,
    payee: 'Imtiaz',
    notes: 'weekly shop',
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
  };
}

describe('formStateFromTransaction', () => {
  let n = 0;
  const key = () => `k${++n}`;

  it('round-trips a split expense for editing', () => {
    const original = tx('expense', [
      { accountId: BANK, categoryId: FOOD, amountMinor: -150_000 },
      { accountId: BANK, categoryId: HOME, amountMinor: -50_025 },
    ]);
    const form = formStateFromTransaction(original, 'edit', TODAY, key);
    expect(form).toMatchObject({
      kind: 'expense',
      amount: '2000.25',
      split: true,
      occurredOn: '2026-09-12',
      notes: 'weekly shop',
    });
    const rebuilt = buildTransactionInput(form!, 'PKR');
    expect(rebuilt.ok && rebuilt.input.entries).toEqual([
      { accountId: BANK, categoryId: FOOD, amountMinor: -150_000 },
      { accountId: BANK, categoryId: HOME, amountMinor: -50_025 },
    ]);
  });

  it('prepares refunds and duplicates dated today', () => {
    const original = tx('expense', [{ accountId: BANK, categoryId: FOOD, amountMinor: -80_000 }]);
    expect(formStateFromTransaction(original, 'refund', TODAY, key)).toMatchObject({
      kind: 'refund',
      amount: '800',
      categoryId: FOOD,
      refundOfId: original.id,
      occurredOn: TODAY,
      notes: '',
    });
    expect(formStateFromTransaction(original, 'duplicate', TODAY, key)).toMatchObject({
      kind: 'expense',
      occurredOn: TODAY,
      refundOfId: null,
    });
  });

  it('restores transfer legs and fee', () => {
    const transfer = tx('transfer', [
      { accountId: BANK, categoryId: null, amountMinor: -1_000_000 },
      { accountId: WALLET, categoryId: null, amountMinor: 1_000_000 },
      { accountId: BANK, categoryId: FEES, amountMinor: -2_500 },
    ]);
    expect(formStateFromTransaction(transfer, 'edit', TODAY, key)).toMatchObject({
      kind: 'transfer',
      amount: '10000',
      accountId: BANK,
      toAccountId: WALLET,
      fee: '25',
      feeCategoryId: FEES,
    });
    expect(formStateFromTransaction(transfer, 'refund', TODAY, key)).toBeNull();
  });

  it('does not edit adjustments or opening balances', () => {
    const adjustment = tx('adjustment', [{ accountId: BANK, categoryId: null, amountMinor: 10 }]);
    expect(formStateFromTransaction(adjustment, 'edit', TODAY, key)).toBeNull();
  });
});

describe('amountToInput', () => {
  it('formats minor units as plain editable text', () => {
    expect(amountToInput(-250_000, 'PKR')).toBe('2500');
    expect(amountToInput(250_050, 'PKR')).toBe('2500.50');
    expect(amountToInput(5, 'PKR')).toBe('0.05');
  });
});
