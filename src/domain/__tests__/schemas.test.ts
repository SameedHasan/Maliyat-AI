import { accountInputSchema, categoryInputSchema, transactionInputSchema } from '../schemas';

const ACCOUNT_ID = '0192f000-0000-7000-8000-000000000001';
const CATEGORY_ID = '0192f000-0000-7000-8000-000000000002';

describe('accountInputSchema', () => {
  it('applies defaults and normalises empty values', () => {
    const parsed = accountInputSchema.parse({ name: '  HBL  ', type: 'bank', institution: '' });
    expect(parsed).toEqual({
      name: 'HBL',
      type: 'bank',
      currency: 'PKR',
      institution: null,
      last4: null,
      creditLimitMinor: null,
      openingBalanceMinor: 0,
    });
  });

  it('rejects full account numbers', () => {
    expect(
      accountInputSchema.safeParse({ name: 'HBL', type: 'bank', last4: '12345678' }).success,
    ).toBe(false);
  });

  it('only allows credit limits on credit cards', () => {
    expect(
      accountInputSchema.safeParse({ name: 'Card', type: 'credit_card', creditLimitMinor: 100 })
        .success,
    ).toBe(true);
    expect(
      accountInputSchema.safeParse({ name: 'Cash', type: 'cash', creditLimitMinor: 100 }).success,
    ).toBe(false);
  });

  it('rejects fractional minor units', () => {
    expect(
      accountInputSchema.safeParse({ name: 'Cash', type: 'cash', openingBalanceMinor: 1.5 })
        .success,
    ).toBe(false);
  });
});

describe('categoryInputSchema', () => {
  it('does not allow creating system categories', () => {
    expect(categoryInputSchema.safeParse({ name: 'X', kind: 'system' }).success).toBe(false);
  });
});

describe('transactionInputSchema', () => {
  const base = {
    kind: 'expense',
    occurredOn: '2026-09-30',
    entries: [{ accountId: ACCOUNT_ID, categoryId: CATEGORY_ID, amountMinor: -250000 }],
  };

  it('parses a minimal expense', () => {
    const parsed = transactionInputSchema.parse(base);
    expect(parsed.source).toBe('manual');
    expect(parsed.payee).toBeNull();
    expect(parsed.refundOfId).toBeNull();
  });

  it('rejects invalid dates and non-integer amounts', () => {
    expect(transactionInputSchema.safeParse({ ...base, occurredOn: '2026-02-30' }).success).toBe(
      false,
    );
    expect(
      transactionInputSchema.safeParse({
        ...base,
        entries: [{ accountId: ACCOUNT_ID, categoryId: CATEGORY_ID, amountMinor: -2500.5 }],
      }).success,
    ).toBe(false);
  });

  it('requires at least one entry', () => {
    expect(transactionInputSchema.safeParse({ ...base, entries: [] }).success).toBe(false);
  });
});
