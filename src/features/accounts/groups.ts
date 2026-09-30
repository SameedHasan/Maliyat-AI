import type { IconName } from '@/components/ui';
import type { Account, AccountType } from '@/domain/types';

import { BASE_CURRENCY } from './netWorth';

export const ACCOUNT_GROUPS = [
  'cash',
  'bank',
  'wallet',
  'credit_card',
  'loan',
  'committee',
  'other',
] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

export function groupOf(type: AccountType): AccountGroup {
  return type === 'other_asset' || type === 'other_liability' ? 'other' : type;
}

export const ACCOUNT_TYPE_ICONS: Record<AccountType, IconName> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'phone-portrait-outline',
  credit_card: 'card-outline',
  loan: 'document-text-outline',
  committee: 'people-outline',
  other_asset: 'briefcase-outline',
  other_liability: 'remove-circle-outline',
};

export interface AccountWithBalance {
  account: Account;
  balanceMinor: number;
}

export interface AccountGroupSection {
  group: AccountGroup;
  data: AccountWithBalance[];
  /** Signed sum of base-currency balances in the group. */
  subtotalMinor: number;
}

/** Groups in the fixed display order; empty groups are omitted. */
export function groupAccounts(
  accounts: readonly Account[],
  balances: ReadonlyMap<string, number>,
): AccountGroupSection[] {
  return ACCOUNT_GROUPS.flatMap((group) => {
    const data = accounts
      .filter((account) => groupOf(account.type) === group)
      .map((account) => ({ account, balanceMinor: balances.get(account.id) ?? 0 }));
    if (data.length === 0) return [];
    const subtotalMinor = data
      .filter((row) => row.account.currency === BASE_CURRENCY)
      .reduce((total, row) => total + row.balanceMinor, 0);
    return [{ group, data, subtotalMinor }];
  });
}
