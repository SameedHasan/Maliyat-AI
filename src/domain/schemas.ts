import { z } from 'zod';

import { isLocalDate } from './dates';
import { CURRENCY_CODES } from './money';
import { ACCOUNT_TYPES, TRANSACTION_KINDS, TRANSACTION_SOURCES } from './types';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const localDateSchema = z.string().refine(isLocalDate, { message: 'invalid_date' });

export const accountInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    type: z.enum(ACCOUNT_TYPES),
    currency: z.enum(CURRENCY_CODES).default('PKR'),
    institution: optionalText(60),
    last4: z
      .string()
      .regex(/^\d{4}$/, { message: 'last4_digits' })
      .nullish()
      .transform((value) => value ?? null),
    creditLimitMinor: z
      .int()
      .nonnegative()
      .nullish()
      .transform((value) => value ?? null),
    openingBalanceMinor: z.int().default(0),
  })
  .refine((a) => a.creditLimitMinor === null || a.type === 'credit_card', {
    message: 'credit_limit_only_for_cards',
    path: ['creditLimitMinor'],
  });
export type AccountInput = z.input<typeof accountInputSchema>;
export type AccountInputParsed = z.output<typeof accountInputSchema>;

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  institution: optionalText(60).optional(),
  last4: z
    .string()
    .regex(/^\d{4}$/, { message: 'last4_digits' })
    .nullish()
    .transform((value) => value ?? null)
    .optional(),
  creditLimitMinor: z
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? null)
    .optional(),
  sortOrder: z.int().optional(),
});
export type AccountUpdate = z.input<typeof accountUpdateSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(['expense', 'income']),
  parentId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  icon: optionalText(40),
  color: optionalText(20),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;
export type CategoryInputParsed = z.output<typeof categoryInputSchema>;

export const entryInputSchema = z.object({
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  amountMinor: z.int(),
});

export const transactionInputSchema = z.object({
  kind: z.enum(TRANSACTION_KINDS),
  occurredOn: localDateSchema,
  occurredAt: z.iso
    .datetime()
    .nullish()
    .transform((value) => value ?? null),
  payee: optionalText(120),
  notes: optionalText(1000),
  source: z.enum(TRANSACTION_SOURCES).default('manual'),
  sourceFingerprint: optionalText(128),
  refundOfId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  entries: z.array(entryInputSchema).min(1).max(50),
});
export type TransactionInput = z.input<typeof transactionInputSchema>;
export type TransactionInputParsed = z.output<typeof transactionInputSchema>;
