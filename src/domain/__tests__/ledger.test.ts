import {
  availableCredit,
  computeBalance,
  validateTransaction,
  type EntryDraft,
  type LedgerCategoryInfo,
  type LedgerContext,
  type LedgerIssueCode,
  type TransactionDraft,
} from '../ledger';
import { money } from '../money';
import { entryCountsTowardIncomeExpense, type TransactionKind } from '../types';

const BANK = 'bank';
const WALLET = 'wallet';
const USD_BANK = 'usd-bank';
const OLD = 'archived-account';

const GROCERIES = 'groceries';
const HOUSEHOLD = 'household';
const BANK_CHARGES = 'bank-charges';
const SALARY = 'salary';
const OLD_CATEGORY = 'archived-category';
const INVESTMENTS = 'investments';

const accounts = {
  [BANK]: { currency: 'PKR', isArchived: false },
  [WALLET]: { currency: 'PKR', isArchived: false },
  [USD_BANK]: { currency: 'USD', isArchived: false },
  [OLD]: { currency: 'PKR', isArchived: true },
} as const;

const categories: Record<string, LedgerCategoryInfo> = {
  [GROCERIES]: { kind: 'expense', isArchived: false },
  [HOUSEHOLD]: { kind: 'expense', isArchived: false },
  [BANK_CHARGES]: { kind: 'expense', isArchived: false },
  [SALARY]: { kind: 'income', isArchived: false },
  [OLD_CATEGORY]: { kind: 'expense', isArchived: true },
  [INVESTMENTS]: { kind: 'system', isArchived: false },
};

const ctx: LedgerContext = {
  getAccount: (id) => accounts[id as keyof typeof accounts],
  getCategory: (id) => categories[id],
};

const entry = (
  accountId: string,
  amountMinor: number,
  categoryId: string | null = null,
): EntryDraft => ({
  accountId,
  categoryId,
  amountMinor,
});

const draft = (kind: TransactionKind, ...entries: EntryDraft[]): TransactionDraft => ({
  kind,
  entries,
});

function codes(d: TransactionDraft, context: LedgerContext = ctx): LedgerIssueCode[] {
  const result = validateTransaction(d, context);
  return result.ok ? [] : result.issues.map((i) => i.code);
}

describe('validateTransaction — valid cases', () => {
  it.each<[string, TransactionDraft]>([
    ['expense', draft('expense', entry(BANK, -250000, GROCERIES))],
    [
      'split expense',
      draft('expense', entry(BANK, -150000, GROCERIES), entry(BANK, -50000, HOUSEHOLD)),
    ],
    ['income', draft('income', entry(BANK, 15000000, SALARY))],
    ['transfer', draft('transfer', entry(BANK, -1000000), entry(WALLET, 1000000))],
    [
      'transfer with fee',
      draft(
        'transfer',
        entry(BANK, -1000000),
        entry(WALLET, 1000000),
        entry(BANK, -5000, BANK_CHARGES),
      ),
    ],
    ['refund', draft('refund', entry(BANK, 50000, GROCERIES))],
    ['positive adjustment', draft('adjustment', entry(BANK, 1234))],
    ['negative adjustment', draft('adjustment', entry(BANK, -1234))],
    ['opening balance', draft('opening_balance', entry(BANK, 5000000))],
    [
      'negative opening balance (credit card owed)',
      draft('opening_balance', entry(BANK, -5000000)),
    ],
  ])('%s', (_, d) => {
    expect(validateTransaction(d, ctx)).toEqual({ ok: true });
  });
});

describe('validateTransaction — invalid cases', () => {
  it.each<[string, TransactionDraft, LedgerIssueCode[]]>([
    ['no entries', draft('expense'), ['no_entries']],
    ['non-integer amount', draft('expense', entry(BANK, -10.5, GROCERIES)), ['amount_not_integer']],
    ['zero amount', draft('expense', entry(BANK, 0, GROCERIES)), ['amount_zero']],
    ['unknown account', draft('expense', entry('nope', -100, GROCERIES)), ['unknown_account']],
    ['archived account', draft('expense', entry(OLD, -100, GROCERIES)), ['archived_account']],
    ['unknown category', draft('expense', entry(BANK, -100, 'nope')), ['unknown_category']],
    ['archived category', draft('expense', entry(BANK, -100, OLD_CATEGORY)), ['archived_category']],
    ['expense with positive amount', draft('expense', entry(BANK, 100, GROCERIES)), ['wrong_sign']],
    ['expense without category', draft('expense', entry(BANK, -100)), ['category_required']],
    [
      'expense with income category',
      draft('expense', entry(BANK, -100, SALARY)),
      ['wrong_category_kind'],
    ],
    [
      'expense with system category',
      draft('expense', entry(BANK, -100, INVESTMENTS)),
      ['wrong_category_kind'],
    ],
    [
      'split across multiple accounts',
      draft('expense', entry(BANK, -100, GROCERIES), entry(WALLET, -100, HOUSEHOLD)),
      ['multiple_accounts'],
    ],
    ['income with negative amount', draft('income', entry(BANK, -100, SALARY)), ['wrong_sign']],
    [
      'income with expense category',
      draft('income', entry(BANK, 100, GROCERIES)),
      ['wrong_category_kind'],
    ],
    ['refund with negative amount', draft('refund', entry(BANK, -100, GROCERIES)), ['wrong_sign']],
    ['transfer with one leg', draft('transfer', entry(BANK, -100)), ['transfer_legs']],
    [
      'transfer with three legs',
      draft('transfer', entry(BANK, -100), entry(WALLET, 50), entry(WALLET, 50)),
      ['transfer_legs'],
    ],
    [
      'transfer to same account',
      draft('transfer', entry(BANK, -100), entry(BANK, 100)),
      ['transfer_same_account'],
    ],
    [
      'transfer legs not netting to zero',
      draft('transfer', entry(BANK, -100), entry(WALLET, 90)),
      ['transfer_unbalanced'],
    ],
    [
      'transfer with both legs negative',
      draft('transfer', entry(BANK, -100), entry(WALLET, -100)),
      ['wrong_sign', 'transfer_unbalanced'],
    ],
    [
      'cross-currency transfer',
      draft('transfer', entry(BANK, -100), entry(USD_BANK, 100)),
      ['transfer_currency_mismatch'],
    ],
    [
      'transfer fee on destination account',
      draft('transfer', entry(BANK, -100), entry(WALLET, 100), entry(WALLET, -5, BANK_CHARGES)),
      ['fee_invalid'],
    ],
    [
      'transfer fee with positive amount',
      draft('transfer', entry(BANK, -100), entry(WALLET, 100), entry(BANK, 5, BANK_CHARGES)),
      ['fee_invalid'],
    ],
    [
      'transfer fee with income category',
      draft('transfer', entry(BANK, -100), entry(WALLET, 100), entry(BANK, -5, SALARY)),
      ['wrong_category_kind'],
    ],
    [
      'transfer with two fees',
      draft(
        'transfer',
        entry(BANK, -100),
        entry(WALLET, 100),
        entry(BANK, -5, BANK_CHARGES),
        entry(BANK, -5, BANK_CHARGES),
      ),
      ['fee_invalid'],
    ],
    [
      'adjustment with category',
      draft('adjustment', entry(BANK, 100, GROCERIES)),
      ['category_not_allowed'],
    ],
    [
      'adjustment with two entries',
      draft('adjustment', entry(BANK, 100), entry(WALLET, 100)),
      ['entry_count'],
    ],
    [
      'opening balance with category',
      draft('opening_balance', entry(BANK, 100, SALARY)),
      ['category_not_allowed'],
    ],
  ])('%s', (_, d, expected) => {
    expect(codes(d)).toEqual(expected);
  });

  it('reports the offending entry index', () => {
    const result = validateTransaction(
      draft('expense', entry(BANK, -100, GROCERIES), entry(BANK, 100, HOUSEHOLD)),
      ctx,
    );
    expect(result).toEqual({ ok: false, issues: [{ code: 'wrong_sign', entryIndex: 1 }] });
  });

  it('allows archived accounts and categories when editing history', () => {
    const d = draft('expense', entry(OLD, -100, OLD_CATEGORY));
    expect(codes(d, { ...ctx, allowArchived: true })).toEqual([]);
  });
});

describe('computeBalance()', () => {
  it('sums entries exactly', () => {
    const entries = [{ amountMinor: 5000000 }, { amountMinor: -250050 }, { amountMinor: -1 }];
    expect(computeBalance(entries, 'PKR')).toEqual(money(4749949, 'PKR'));
  });

  it('is zero for no entries', () => {
    expect(computeBalance([], 'PKR')).toEqual(money(0, 'PKR'));
  });
});

describe('availableCredit()', () => {
  it('is limit plus the (negative) balance', () => {
    expect(availableCredit(money(10000000, 'PKR'), money(-2500000, 'PKR'))).toEqual(
      money(7500000, 'PKR'),
    );
  });
});

describe('entryCountsTowardIncomeExpense()', () => {
  it.each<[TransactionKind, 'expense' | 'income' | 'system' | null, boolean]>([
    ['expense', 'expense', true],
    ['income', 'income', true],
    ['refund', 'expense', true],
    ['transfer', null, false],
    ['transfer', 'expense', true],
    ['adjustment', null, false],
    ['opening_balance', null, false],
    ['expense', 'system', false],
  ])('%s with %s category → %s', (kind, categoryKind, expected) => {
    expect(entryCountsTowardIncomeExpense(kind, categoryKind)).toBe(expected);
  });
});
