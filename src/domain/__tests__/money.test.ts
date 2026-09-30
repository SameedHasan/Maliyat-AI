import {
  abs,
  add,
  allocate,
  compare,
  equals,
  formatMoney,
  isCurrencyCode,
  money,
  MoneyError,
  negate,
  parseMoneyInput,
  subtract,
  sum,
  toDecimalString,
  zero,
} from '../money';

const pkr = (minor: number) => money(minor, 'PKR');

describe('money()', () => {
  it('accepts safe integers', () => {
    expect(pkr(250050)).toEqual({ amountMinor: 250050, currency: 'PKR' });
  });

  it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects %p', (value) => {
    expect(() => pkr(value)).toThrow(MoneyError);
  });

  it('normalises negative zero', () => {
    expect(Object.is(pkr(-0).amountMinor, 0)).toBe(true);
  });

  it('recognises supported currencies', () => {
    expect(isCurrencyCode('PKR')).toBe(true);
    expect(isCurrencyCode('XYZ')).toBe(false);
  });
});

describe('arithmetic', () => {
  it('adds, subtracts, negates without float drift', () => {
    const tenPaisa = pkr(10);
    const twentyPaisa = pkr(20);
    expect(add(tenPaisa, twentyPaisa)).toEqual(pkr(30));
    expect(subtract(tenPaisa, twentyPaisa)).toEqual(pkr(-10));
    expect(negate(pkr(500))).toEqual(pkr(-500));
    expect(abs(pkr(-500))).toEqual(pkr(500));
  });

  it('sums many small amounts exactly', () => {
    const items = Array.from({ length: 10_000 }, () => pkr(1));
    expect(sum(items, 'PKR')).toEqual(pkr(10_000));
    expect(sum([], 'PKR')).toEqual(zero('PKR'));
  });

  it('throws on currency mismatch', () => {
    expect(() => add(pkr(1), money(1, 'USD'))).toThrow(MoneyError);
    expect(() => compare(pkr(1), money(1, 'USD'))).toThrow(MoneyError);
  });

  it('compares and checks equality', () => {
    expect(compare(pkr(1), pkr(2))).toBe(-1);
    expect(compare(pkr(2), pkr(2))).toBe(0);
    expect(compare(pkr(3), pkr(2))).toBe(1);
    expect(equals(pkr(2), pkr(2))).toBe(true);
    expect(equals(pkr(2), money(2, 'USD'))).toBe(false);
  });

  it('throws on overflow beyond safe integers', () => {
    expect(() => add(pkr(Number.MAX_SAFE_INTEGER), pkr(1))).toThrow(MoneyError);
  });
});

describe('allocate()', () => {
  const total = (parts: { amountMinor: number }[]) => parts.reduce((a, p) => a + p.amountMinor, 0);

  it('splits evenly when possible', () => {
    expect(allocate(pkr(900), [1, 1, 1]).map((m) => m.amountMinor)).toEqual([300, 300, 300]);
  });

  it('never loses a paisa', () => {
    const parts = allocate(pkr(100), [1, 1, 1]);
    expect(parts.map((m) => m.amountMinor)).toEqual([34, 33, 33]);
    expect(total(parts)).toBe(100);
  });

  it('respects uneven ratios', () => {
    const parts = allocate(pkr(1000), [70, 20, 10]);
    expect(parts.map((m) => m.amountMinor)).toEqual([700, 200, 100]);
  });

  it('handles negative totals symmetrically', () => {
    const parts = allocate(pkr(-100), [1, 1, 1]);
    expect(parts.map((m) => m.amountMinor)).toEqual([-34, -33, -33]);
    expect(total(parts)).toBe(-100);
  });

  it('allows zero ratios', () => {
    expect(allocate(pkr(100), [0, 1]).map((m) => m.amountMinor)).toEqual([0, 100]);
  });

  it('rejects invalid ratios', () => {
    expect(() => allocate(pkr(100), [])).toThrow(MoneyError);
    expect(() => allocate(pkr(100), [0, 0])).toThrow(MoneyError);
    expect(() => allocate(pkr(100), [-1, 2])).toThrow(MoneyError);
  });
});

describe('parseMoneyInput()', () => {
  it.each([
    ['2,500.50', 250050],
    ['2500.5', 250050],
    ['1000', 100000],
    ['Rs. 1,000', 100000],
    ['Rs.1,000', 100000],
    ['Rs 1,000', 100000],
    ['PKR 1,000', 100000],
    ['  750  ', 75000],
    ['.5', 50],
    ['0.01', 1],
    ['007', 700],
    ['-500', -50000],
    ['- Rs. 2,500', -250000],
    ['Rs. -2,500', -250000],
    ['1 000', 100000],
  ])('parses %p', (input, expected) => {
    expect(parseMoneyInput(input, 'PKR')).toEqual({ ok: true, money: pkr(expected) });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['Rs.', 'empty'],
    ['abc', 'invalid'],
    ['1.2.3', 'invalid'],
    ['12a', 'invalid'],
    ['.', 'invalid'],
    ['1.234', 'too_many_decimals'],
    ['99999999999999', 'too_large'],
  ])('rejects %p as %p', (input, error) => {
    expect(parseMoneyInput(input, 'PKR')).toEqual({ ok: false, error });
  });
});

describe('formatMoney()', () => {
  it('formats whole amounts without decimals by default', () => {
    expect(formatMoney(pkr(5_000_000))).toBe('Rs. 50,000');
  });

  it('keeps non-zero fractions', () => {
    expect(formatMoney(pkr(250050))).toBe('Rs. 2,500.50');
    expect(formatMoney(pkr(5))).toBe('Rs. 0.05');
  });

  it('can always show fractions', () => {
    expect(formatMoney(pkr(100000), { fraction: 'always' })).toBe('Rs. 1,000.00');
  });

  it('shows signs per option', () => {
    expect(formatMoney(pkr(-250000))).toBe('- Rs. 2,500');
    expect(formatMoney(pkr(5_000_000), { sign: 'always' })).toBe('+ Rs. 50,000');
    expect(formatMoney(pkr(-250000), { sign: 'never' })).toBe('Rs. 2,500');
    expect(formatMoney(pkr(0), { sign: 'always' })).toBe('Rs. 0');
  });

  it('hides amounts', () => {
    expect(formatMoney(pkr(-250000), { hide: true })).toBe('Rs. •••••');
  });

  it('formats compact values', () => {
    expect(formatMoney(pkr(120_000_000), { compact: true })).toBe('Rs. 1.2M');
    expect(formatMoney(pkr(150_000), { compact: true })).toBe('Rs. 1.5K');
    expect(formatMoney(pkr(99_900), { compact: true })).toBe('Rs. 999');
    expect(formatMoney(pkr(300_000_000_000), { compact: true })).toBe('Rs. 3B');
  });

  it('can omit the symbol', () => {
    expect(formatMoney(pkr(123456789), { showSymbol: false })).toBe('1,234,567.89');
  });

  it('uses the currency symbol', () => {
    expect(formatMoney(money(1999, 'USD'))).toBe('$ 19.99');
  });
});

describe('toDecimalString()', () => {
  it.each([
    [250050, '2500.50'],
    [-250050, '-2500.50'],
    [5, '0.05'],
    [0, '0.00'],
  ])('%p → %p', (minor, expected) => {
    expect(toDecimalString(pkr(minor))).toBe(expected);
  });
});
