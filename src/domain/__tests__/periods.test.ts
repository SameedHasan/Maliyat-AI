import { addMonths, dayOfWeek, daysInRange, startOfWeek } from '../dates';
import { bucketFor, bucketKeys, presetRange, previousRange, shiftPeriod } from '../periods';

describe('date helpers', () => {
  it('adds months and clamps to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
  });

  it('starts weeks on Monday', () => {
    expect(dayOfWeek('2026-09-28')).toBe(0); // Monday
    expect(dayOfWeek('2026-10-04')).toBe(6); // Sunday
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
  });

  it('counts days inclusively', () => {
    expect(daysInRange({ start: '2026-09-01', end: '2026-09-30' })).toBe(30);
    expect(daysInRange({ start: '2026-03-28', end: '2026-03-30' })).toBe(3);
  });
});

describe('presetRange', () => {
  const today = '2026-09-30';

  it('computes each preset around the anchor date', () => {
    expect(presetRange('week', today)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(presetRange('month', today)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(presetRange('3m', today)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    expect(presetRange('6m', today)).toEqual({ start: '2026-04-01', end: '2026-09-30' });
    expect(presetRange('year', today)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('spans year boundaries', () => {
    expect(presetRange('3m', '2026-01-10')).toEqual({ start: '2025-11-01', end: '2026-01-31' });
  });
});

describe('shiftPeriod', () => {
  it('moves presets by their own length', () => {
    const month = { preset: 'month' as const, range: presetRange('month', '2026-03-31') };
    expect(shiftPeriod(month, -1).range).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(shiftPeriod(month, 1).range).toEqual({ start: '2026-04-01', end: '2026-04-30' });

    const quarter = { preset: '3m' as const, range: presetRange('3m', '2026-09-30') };
    expect(shiftPeriod(quarter, -1).range).toEqual({ start: '2026-04-01', end: '2026-06-30' });

    const week = { preset: 'week' as const, range: presetRange('week', '2026-09-30') };
    expect(shiftPeriod(week, 1).range).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('moves custom ranges by their length in days', () => {
    const custom = { preset: 'custom' as const, range: { start: '2026-09-10', end: '2026-09-19' } };
    expect(shiftPeriod(custom, -1).range).toEqual({ start: '2026-08-31', end: '2026-09-09' });
  });
});

describe('previousRange', () => {
  it('compares whole months with whole months', () => {
    expect(previousRange({ start: '2026-03-01', end: '2026-03-31' })).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(previousRange({ start: '2026-07-01', end: '2026-09-30' })).toEqual({
      start: '2026-04-01',
      end: '2026-06-30',
    });
  });

  it('uses the same number of days otherwise', () => {
    expect(previousRange({ start: '2026-09-28', end: '2026-10-04' })).toEqual({
      start: '2026-09-21',
      end: '2026-09-27',
    });
  });
});

describe('buckets', () => {
  it('uses days up to a month and months beyond', () => {
    expect(bucketFor({ start: '2026-09-01', end: '2026-09-30' })).toBe('day');
    expect(bucketFor({ start: '2026-07-01', end: '2026-09-30' })).toBe('month');
  });

  it('lists every bucket in the range', () => {
    expect(bucketKeys({ start: '2026-09-29', end: '2026-10-02' }, 'day')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(bucketKeys({ start: '2025-11-15', end: '2026-02-10' }, 'month')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});
