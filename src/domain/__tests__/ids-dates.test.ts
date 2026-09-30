import { randomBytes } from 'node:crypto';

import { addDays, isLocalDate, monthRange, toLocalDate } from '../dates';
import { isUuid, uuidV7 } from '../ids';

describe('uuidV7()', () => {
  it('produces a valid v7 UUID', () => {
    const id = uuidV7(randomBytes(16), Date.now());
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const now = 1_790_000_000_123;
    const id = uuidV7(new Uint8Array(16), now);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(now);
  });

  it('sorts by creation time', () => {
    const earlier = uuidV7(randomBytes(16), 1_000);
    const later = uuidV7(randomBytes(16), 2_000);
    expect(earlier < later).toBe(true);
  });

  it('rejects short randomness and bad timestamps', () => {
    expect(() => uuidV7(new Uint8Array(8), 1)).toThrow();
    expect(() => uuidV7(new Uint8Array(16), -1)).toThrow();
    expect(() => uuidV7(new Uint8Array(16), 1.5)).toThrow();
  });
});

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-1-01')).toBe(false);
  });

  it('uses the user timezone for the calendar date', () => {
    // 20:30 UTC on the 31st is already 01:30 on the 1st in Pakistan (UTC+5).
    const instant = new Date('2026-08-31T20:30:00Z');
    expect(toLocalDate(instant, 'Asia/Karachi')).toBe('2026-09-01');
    expect(toLocalDate(instant, 'UTC')).toBe('2026-08-31');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('computes month ranges', () => {
    expect(monthRange('2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2028-02-01')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthRange('2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});
