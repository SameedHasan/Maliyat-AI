import type { CurrencyCode } from '@/domain/money';
import type { Account } from '@/domain/types';

export const BASE_CURRENCY: CurrencyCode = 'PKR';

export interface NetWorth {
  assetsMinor: number;
  /** Signed: liabilities carry negative balances, so this is ≤ 0 for normal usage. */
  liabilitiesMinor: number;
  netMinor: number;
}

/**
 * Totals in the base currency only. Accounts in other currencies are left out until
 * exchange rates exist (plan §5), rather than being added as if they were rupees.
 */
export function netWorth(
  accounts: readonly Account[],
  balances: ReadonlyMap<string, number>,
): NetWorth {
  let assetsMinor = 0;
  let liabilitiesMinor = 0;
  for (const account of accounts) {
    if (account.currency !== BASE_CURRENCY) continue;
    const balance = balances.get(account.id) ?? 0;
    if (account.accountClass === 'asset') assetsMinor += balance;
    else liabilitiesMinor += balance;
  }
  return { assetsMinor, liabilitiesMinor, netMinor: assetsMinor + liabilitiesMinor };
}
