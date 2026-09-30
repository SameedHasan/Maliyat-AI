export const CURRENCIES = {
  PKR: { minorDigits: 2, symbol: 'Rs.' },
  USD: { minorDigits: 2, symbol: '$' },
  AED: { minorDigits: 2, symbol: 'AED' },
  SAR: { minorDigits: 2, symbol: 'SAR' },
  GBP: { minorDigits: 2, symbol: '£' },
  EUR: { minorDigits: 2, symbol: '€' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = [
  'PKR',
  'USD',
  'AED',
  'SAR',
  'GBP',
  'EUR',
] as const satisfies readonly CurrencyCode[];

export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function assertMinorUnits(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(`Amount must be a safe integer of minor units, got ${amountMinor}`);
  }
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  assertMinorUnits(amountMinor);
  if (!isCurrencyCode(currency)) {
    throw new MoneyError(`Unsupported currency ${String(currency)}`);
  }
  // Normalise -0 so equality and formatting never see a negative zero.
  return { amountMinor: amountMinor === 0 ? 0 : amountMinor, currency };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.amountMinor, a.currency);
}

export function abs(a: Money): Money {
  return money(Math.abs(a.amountMinor), a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce<Money>((acc, item) => add(acc, item), zero(currency));
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0;
}

export function isNegative(a: Money): boolean {
  return a.amountMinor < 0;
}

export function isPositive(a: Money): boolean {
  return a.amountMinor > 0;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/**
 * Splits `total` across `ratios` without losing or inventing minor units
 * (largest-remainder method). Results always sum exactly to `total`.
 */
export function allocate(total: Money, ratios: readonly number[]): Money[] {
  if (ratios.length === 0) {
    throw new MoneyError('allocate requires at least one ratio');
  }
  if (ratios.some((r) => !Number.isFinite(r) || r < 0)) {
    throw new MoneyError('allocate ratios must be finite and non-negative');
  }
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  if (ratioSum <= 0) {
    throw new MoneyError('allocate ratios must not all be zero');
  }

  const sign = total.amountMinor < 0 ? -1 : 1;
  const absTotal = Math.abs(total.amountMinor);
  const raw = ratios.map((r) => (absTotal * r) / ratioSum);
  const floors = raw.map(Math.floor);
  let remainder = absTotal - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    remainder -= 1;
  }

  return floors.map((units) => money(sign * units, total.currency));
}

export type ParseMoneyError = 'empty' | 'invalid' | 'too_many_decimals' | 'too_large';

export type ParseMoneyResult = { ok: true; money: Money } | { ok: false; error: ParseMoneyError };

const MAX_INTEGER_DIGITS = 13;

/**
 * Parses user input such as "2,500.50", "Rs. 1,000", "-500" or "1000" into minor units
 * using string arithmetic only (no floating point).
 */
export function parseMoneyInput(input: string, currency: CurrencyCode): ParseMoneyResult {
  const { minorDigits, symbol } = CURRENCIES[currency];
  let text = input.trim();
  if (text.length === 0) return { ok: false, error: 'empty' };

  let negative = false;
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = true;
    text = text.slice(1).trim();
  }

  for (const prefix of [symbol, currency, 'Rs', 'PKR']) {
    if (text.toUpperCase().startsWith(prefix.toUpperCase())) {
      text = text.slice(prefix.length).replace(/^\.?\s*/, '');
      break;
    }
  }

  if (!negative && (text.startsWith('-') || text.startsWith('−'))) {
    negative = true;
    text = text.slice(1).trim();
  }

  text = text.replace(/[\s,]/g, '');
  if (text.length === 0) return { ok: false, error: 'empty' };

  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) return { ok: false, error: 'invalid' };

  const integerPart = (match[1] ?? '').replace(/^0+(?=\d)/, '');
  const fractionPart = match[2] ?? '';
  if (integerPart.length === 0 && fractionPart.length === 0) {
    return { ok: false, error: 'invalid' };
  }
  if (fractionPart.length > minorDigits) return { ok: false, error: 'too_many_decimals' };
  if (integerPart.length > MAX_INTEGER_DIGITS) return { ok: false, error: 'too_large' };

  const minorString = (integerPart || '0') + fractionPart.padEnd(minorDigits, '0');
  const amountMinor = Number(minorString);
  if (!Number.isSafeInteger(amountMinor)) return { ok: false, error: 'too_large' };

  return { ok: true, money: money(negative ? -amountMinor : amountMinor, currency) };
}

export interface FormatMoneyOptions {
  /** 'auto' shows "-" for negatives only, 'always' also shows "+", 'never' shows neither. */
  sign?: 'auto' | 'always' | 'never';
  /** Replace digits with a mask for hide-amounts mode. */
  hide?: boolean;
  /** Short form for charts: 1.2K, 3.4M, 1.2B. */
  compact?: boolean;
  /** 'auto' drops ".00" for whole amounts; 'always' keeps all minor digits. */
  fraction?: 'auto' | 'always';
  showSymbol?: boolean;
}

const HIDDEN_MASK = '•••••';
const MINUS = '-';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCompact(absMinor: number, minorDigits: number): string {
  const major = absMinor / 10 ** minorDigits;
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [threshold, suffix] of units) {
    if (major >= threshold) {
      const scaled = Math.floor((major / threshold) * 10) / 10;
      return `${scaled.toFixed(1).replace(/\.0$/, '')}${suffix}`;
    }
  }
  return groupThousands(String(Math.floor(major)));
}

export function formatMoney(value: Money, options: FormatMoneyOptions = {}): string {
  const {
    sign = 'auto',
    hide = false,
    compact = false,
    fraction = 'auto',
    showSymbol = true,
  } = options;
  const { minorDigits, symbol } = CURRENCIES[value.currency];
  const absMinor = Math.abs(value.amountMinor);

  let body: string;
  if (hide) {
    body = HIDDEN_MASK;
  } else if (compact) {
    body = formatCompact(absMinor, minorDigits);
  } else {
    const digits = String(absMinor).padStart(minorDigits + 1, '0');
    const integerPart = digits.slice(0, digits.length - minorDigits);
    const fractionPart = digits.slice(digits.length - minorDigits);
    const showFraction = fraction === 'always' || /[1-9]/.test(fractionPart);
    body =
      groupThousands(integerPart) + (showFraction && minorDigits > 0 ? `.${fractionPart}` : '');
  }

  const withSymbol = showSymbol ? `${symbol} ${body}` : body;

  let prefix = '';
  if (!hide && sign !== 'never') {
    if (value.amountMinor < 0) prefix = `${MINUS} `;
    else if (value.amountMinor > 0 && sign === 'always') prefix = '+ ';
  }
  return prefix + withSymbol;
}

/** Plain decimal string for exports, e.g. -2500.50 */
export function toDecimalString(value: Money): string {
  const { minorDigits } = CURRENCIES[value.currency];
  const absMinor = Math.abs(value.amountMinor);
  const digits = String(absMinor).padStart(minorDigits + 1, '0');
  const integerPart = digits.slice(0, digits.length - minorDigits);
  const fractionPart = digits.slice(digits.length - minorDigits);
  const text = minorDigits > 0 ? `${integerPart}.${fractionPart}` : integerPart;
  return value.amountMinor < 0 ? `-${text}` : text;
}
