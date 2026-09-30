import type { z } from 'zod';

import type { LedgerIssue } from '@/domain/ledger';

export type RepositoryErrorCode =
  | 'invalid_input'
  | 'ledger_violation'
  | 'not_found'
  | 'category_in_use'
  | 'category_has_children'
  | 'invalid_parent';

export class RepositoryError extends Error {
  override name = 'RepositoryError';

  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
    readonly details?: { zodIssues?: z.core.$ZodIssue[]; ledgerIssues?: LedgerIssue[] },
  ) {
    super(message);
  }
}

export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new RepositoryError('invalid_input', 'Invalid input', { zodIssues: result.error.issues });
  }
  return result.data;
}
