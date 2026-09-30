import { useTranslation } from 'react-i18next';

import {
  formatMoney,
  toDecimalString,
  type CurrencyCode,
  type FormatMoneyOptions,
} from '@/domain/money';
import { usePreferences } from '@/store/preferences';
import type { TypographyVariant } from '@/theme';

import { Text } from './Text';

export interface MoneyTextProps {
  amountMinor: number;
  currency: CurrencyCode;
  variant?: TypographyVariant;
  sign?: FormatMoneyOptions['sign'];
  compact?: boolean;
  /**
   * 'signed' tints positives as income and negatives as expense. The sign prefix is
   * always shown too, so colour is never the only signal (plan §7.5).
   */
  tone?: 'neutral' | 'signed' | 'muted';
  /** Ignore the global hide-amounts preference (e.g. inside an unlocked detail view). */
  alwaysVisible?: boolean;
}

/** The only component that renders amounts (plan §7.3). */
export function MoneyText({
  amountMinor,
  currency,
  variant = 'mono',
  sign = 'auto',
  compact = false,
  tone = 'neutral',
  alwaysVisible = false,
}: MoneyTextProps) {
  const { t } = useTranslation();
  const hidden = usePreferences((s) => s.hideAmounts) && !alwaysVisible;
  const value = { amountMinor, currency };
  const effectiveSign = tone === 'signed' && sign === 'auto' ? 'always' : sign;

  const color =
    tone === 'muted'
      ? 'textMuted'
      : tone === 'signed' && !hidden && amountMinor !== 0
        ? amountMinor > 0
          ? 'income'
          : 'expense'
        : 'text';

  const absolute = toDecimalString({ amountMinor: Math.abs(amountMinor), currency }).replace(
    /\.00$/,
    '',
  );
  const currencyName = t(`money.currency.${currency}`, {
    count: Math.abs(amountMinor) === 100 ? 1 : 2,
  });
  const accessibilityLabel = hidden
    ? t('money.hidden')
    : t(amountMinor < 0 ? 'money.spokenNegative' : 'money.spoken', {
        amount: absolute,
        currency: currencyName,
      });

  return (
    <Text
      variant={variant}
      color={color}
      tabular
      numberOfLines={1}
      accessibilityLabel={accessibilityLabel}>
      {formatMoney(value, { sign: effectiveSign, hide: hidden, compact })}
    </Text>
  );
}
