import { toCsv } from '../csv';

describe('toCsv', () => {
  it('quotes separators, quotes and newlines', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['x,y', 'say "hi"'],
          ['line\nbreak', null],
        ],
      ),
    ).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",\r\n');
  });

  it('neutralises spreadsheet formulas in text but keeps numeric columns', () => {
    const csv = toCsv(['payee', 'amount'], [['=HYPERLINK("x")', '-2500.00']], new Set([1]));
    expect(csv).toBe('payee,amount\r\n"\'=HYPERLINK(""x"")",-2500.00\r\n');
  });
});
