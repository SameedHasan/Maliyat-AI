import type { TFunction } from 'i18next';

import { RepositoryError } from '@/data/repositories';

/** A user-facing message for a failed write; never exposes internal details. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof RepositoryError) {
    switch (error.code) {
      case 'ledger_violation':
        return t('errors.ledger_violation');
      case 'not_found':
        return t('errors.not_found');
      case 'category_in_use':
        return t('errors.category_in_use');
      case 'category_has_children':
        return t('errors.category_has_children');
      case 'invalid_parent':
        return t('errors.invalid_parent');
      case 'account_has_history':
        return t('errors.account_has_history');
      case 'invalid_input':
        return t('errors.invalid_input');
    }
  }
  return t('states.errorBody');
}
