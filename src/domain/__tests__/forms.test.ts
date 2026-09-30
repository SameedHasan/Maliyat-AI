import {
  accountFormFromAccount,
  balanceFromDisplay,
  buildAccountInput,
  buildAccountUpdate,
  displayBalance,
  emptyAccountForm,
} from '../accountForm';
import { budgetFormFromBudget, buildBudgetInput, emptyBudgetForm } from '../budgetForm';
import type { Account, BudgetWithCategories } from '../types';

const sync = {
  userId: 'u',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  deletedAt: null,
  version: 1,
};

describe('account form', () => {
  it('builds an asset with its opening balance', () => {
    const result = buildAccountInput({
      ...emptyAccountForm('bank'),
      name: '  Meezan  ',
      institution: ' Meezan Bank ',
      last4: '1234',
      openingBalance: '12,500.50',
    });
    expect(result).toEqual({
      ok: true,
      input: {
        name: 'Meezan',
        type: 'bank',
        currency: 'PKR',
        institution: 'Meezan Bank',
        last4: '1234',
        creditLimitMinor: null,
        openingBalanceMinor: 1_250_050,
      },
    });
  });

  it('stores the amount owed on a liability as a negative balance', () => {
    const result = buildAccountInput({
      ...emptyAccountForm('credit_card'),
      name: 'Card',
      openingBalance: '4000',
      creditLimit: '100000',
    });
    expect(result).toMatchObject({
      ok: true,
      input: { openingBalanceMinor: -400_000, creditLimitMinor: 10_000_000 },
    });
  });

  it('treats an empty opening balance as zero, never negative zero', () => {
    const result = buildAccountInput({ ...emptyAccountForm('loan'), name: 'Loan' });
    expect(result.ok && Object.is(result.input.openingBalanceMinor, 0)).toBe(true);
  });

  it('reports every invalid field at once', () => {
    const result = buildAccountInput({
      ...emptyAccountForm('credit_card'),
      last4: '12a4',
      openingBalance: '-5',
      creditLimit: '1.234',
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        name: 'required',
        last4: 'last4_digits',
        openingBalance: 'invalid',
        creditLimit: 'too_many_decimals',
      },
    });
  });

  it('ignores the credit limit on non-card accounts', () => {
    const result = buildAccountUpdate({
      ...emptyAccountForm('cash'),
      name: 'Wallet',
      creditLimit: 'x',
    });
    expect(result).toEqual({
      ok: true,
      update: { name: 'Wallet', institution: null, last4: null, creditLimitMinor: undefined },
    });
  });

  it('round-trips an existing account without an opening balance', () => {
    const account = {
      ...sync,
      id: 'a',
      name: 'Card',
      type: 'credit_card',
      accountClass: 'liability',
      currency: 'PKR',
      institution: 'HBL',
      last4: null,
      creditLimitMinor: 5_000_000,
      color: null,
      icon: null,
      sortOrder: 0,
      isArchived: false,
    } as Account;
    expect(accountFormFromAccount(account)).toEqual({
      name: 'Card',
      type: 'credit_card',
      institution: 'HBL',
      last4: '',
      openingBalance: '',
      creditLimit: '50000',
    });
  });

  it('flips liabilities to the amount owed for display and back', () => {
    expect(displayBalance('credit_card', -2_000)).toBe(2_000);
    expect(displayBalance('bank', -2_000)).toBe(-2_000);
    expect(balanceFromDisplay('loan', 2_000)).toBe(-2_000);
    expect(balanceFromDisplay('wallet', 2_000)).toBe(2_000);
  });
});

describe('budget form', () => {
  const valid = {
    ...emptyBudgetForm('2026-09-01'),
    name: ' Food ',
    amount: '60,000',
    categoryIds: ['food'],
    rollover: true,
  };

  it('builds a monthly budget', () => {
    expect(buildBudgetInput(valid, 'PKR')).toEqual({
      ok: true,
      input: {
        name: 'Food',
        period: 'monthly',
        startOn: '2026-09-01',
        endOn: null,
        amountMinor: 6_000_000,
        currency: 'PKR',
        rollover: true,
        alertThresholds: valid.alertThresholds,
        categoryIds: ['food'],
      },
    });
  });

  it('drops rollover and keeps the end date for custom budgets', () => {
    const result = buildBudgetInput({ ...valid, period: 'custom', endOn: '2026-12-31' }, 'PKR');
    expect(result).toMatchObject({ ok: true, input: { endOn: '2026-12-31', rollover: false } });
  });

  it('validates name, categories, amount and dates', () => {
    expect(
      buildBudgetInput(
        { ...emptyBudgetForm('2026-09-10'), amount: '0', period: 'custom', endOn: '2026-09-01' },
        'PKR',
      ),
    ).toEqual({
      ok: false,
      errors: {
        name: 'required',
        categoryIds: 'required',
        amount: 'must_be_positive',
        endOn: 'end_before_start',
      },
    });
    expect(buildBudgetInput({ ...valid, amount: '' }, 'PKR')).toEqual({
      ok: false,
      errors: { amount: 'required' },
    });
    expect(buildBudgetInput({ ...valid, period: 'custom', endOn: null }, 'PKR')).toEqual({
      ok: false,
      errors: { endOn: 'required' },
    });
  });

  it('prefills from an existing budget', () => {
    const budget = {
      ...sync,
      id: 'b',
      name: 'Fuel',
      period: 'weekly',
      startOn: '2026-09-07',
      endOn: null,
      amountMinor: 250_050,
      currency: 'PKR',
      rollover: false,
      alertThresholds: [90],
      categoryIds: ['fuel'],
    } as BudgetWithCategories;
    expect(budgetFormFromBudget(budget)).toEqual({
      name: 'Fuel',
      amount: '2500.50',
      period: 'weekly',
      startOn: '2026-09-07',
      endOn: null,
      rollover: false,
      categoryIds: ['fuel'],
      alertThresholds: [90],
    });
  });
});
