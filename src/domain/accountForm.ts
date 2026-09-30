import { parseMoneyInput, type CurrencyCode } from './money';
import type { AccountInput, AccountUpdate } from './schemas';
import { amountToInput } from './transactionForm';
import { accountClassFor, type Account, type AccountType } from './types';

export interface AccountFormState {
  name: string;
  type: AccountType;
  institution: string;
  last4: string;
  /** For liabilities this is the amount owed, entered as a positive number. */
  openingBalance: string;
  creditLimit: string;
}

export type AccountFormField = 'name' | 'last4' | 'openingBalance' | 'creditLimit';
export type AccountFormErrorCode =
  'required' | 'last4_digits' | 'invalid' | 'too_many_decimals' | 'too_large';
export type AccountFormErrors = Partial<Record<AccountFormField, AccountFormErrorCode>>;

export function emptyAccountForm(type: AccountType = 'bank'): AccountFormState {
  return { name: '', type, institution: '', last4: '', openingBalance: '', creditLimit: '' };
}

export function accountFormFromAccount(account: Account): AccountFormState {
  return {
    name: account.name,
    type: account.type,
    institution: account.institution ?? '',
    last4: account.last4 ?? '',
    openingBalance: '',
    creditLimit:
      account.creditLimitMinor !== null
        ? amountToInput(account.creditLimitMinor, account.currency)
        : '',
  };
}

/** Empty input means zero/none; negative input is not allowed (the sign comes from the type). */
function parseOptionalAmount(
  text: string,
  currency: CurrencyCode,
): { ok: true; minor: number | null } | { ok: false; error: AccountFormErrorCode } {
  if (text.trim() === '') return { ok: true, minor: null };
  const parsed = parseMoneyInput(text, currency);
  if (!parsed.ok) return { ok: false, error: parsed.error === 'empty' ? 'required' : parsed.error };
  if (parsed.money.amountMinor < 0) return { ok: false, error: 'invalid' };
  return { ok: true, minor: parsed.money.amountMinor };
}

function validateCommon(state: AccountFormState, currency: CurrencyCode) {
  const errors: AccountFormErrors = {};
  if (state.name.trim() === '') errors.name = 'required';
  const last4 = state.last4.trim();
  if (last4 !== '' && !/^\d{4}$/.test(last4)) errors.last4 = 'last4_digits';
  const limit =
    state.type === 'credit_card' ? parseOptionalAmount(state.creditLimit, currency) : null;
  if (limit && !limit.ok) errors.creditLimit = limit.error;
  return {
    errors,
    name: state.name.trim(),
    institution: state.institution.trim() || null,
    last4: last4 || null,
    creditLimitMinor: limit?.ok ? limit.minor : null,
  };
}

export function buildAccountInput(
  state: AccountFormState,
  currency: CurrencyCode = 'PKR',
): { ok: true; input: AccountInput } | { ok: false; errors: AccountFormErrors } {
  const common = validateCommon(state, currency);
  const opening = parseOptionalAmount(state.openingBalance, currency);
  if (!opening.ok) common.errors.openingBalance = opening.error;
  if (Object.keys(common.errors).length > 0 || !opening.ok) {
    return { ok: false, errors: common.errors };
  }
  const magnitude = opening.minor ?? 0;
  const openingBalanceMinor =
    accountClassFor(state.type) === 'liability' ? 0 - magnitude : magnitude;
  return {
    ok: true,
    input: {
      name: common.name,
      type: state.type,
      currency,
      institution: common.institution,
      last4: common.last4,
      creditLimitMinor: common.creditLimitMinor,
      openingBalanceMinor,
    },
  };
}

export function buildAccountUpdate(
  state: AccountFormState,
  currency: CurrencyCode = 'PKR',
): { ok: true; update: AccountUpdate } | { ok: false; errors: AccountFormErrors } {
  const common = validateCommon(state, currency);
  if (Object.keys(common.errors).length > 0) return { ok: false, errors: common.errors };
  return {
    ok: true,
    update: {
      name: common.name,
      institution: common.institution,
      last4: common.last4,
      creditLimitMinor: state.type === 'credit_card' ? common.creditLimitMinor : undefined,
    },
  };
}

/**
 * Liabilities are shown as the amount owed (positive when you owe money); assets as-is.
 * Used for display and for the reconcile form.
 */
export function displayBalance(accountType: AccountType, balanceMinor: number): number {
  return accountClassFor(accountType) === 'liability' ? 0 - balanceMinor : balanceMinor;
}

export function balanceFromDisplay(accountType: AccountType, displayMinor: number): number {
  return accountClassFor(accountType) === 'liability' ? 0 - displayMinor : displayMinor;
}
