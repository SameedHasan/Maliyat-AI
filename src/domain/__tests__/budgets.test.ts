import {
  budgetPeriodFor,
  budgetPeriodsThrough,
  computeBudgetStatus,
  expandCategoryScope,
  type BudgetRules,
} from '../budgets';

const monthly: BudgetRules = {
  period: 'monthly',
  startOn: '2026-07-15',
  endOn: null,
  amountMinor: 3_000_000,
  rollover: false,
  alertThresholds: [80, 100],
};

describe('budget periods', () => {
  it('uses the calendar month containing the date', () => {
    expect(budgetPeriodFor(monthly, '2026-09-30')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('counts the whole first month even if the budget started mid-month', () => {
    expect(budgetPeriodFor(monthly, '2026-07-02')).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    });
    expect(budgetPeriodFor(monthly, '2026-06-30')).toBeNull();
  });

  it('supports weekly and custom periods', () => {
    const weekly = { ...monthly, period: 'weekly' as const, startOn: '2026-09-01' };
    expect(budgetPeriodFor(weekly, '2026-09-30')).toEqual({
      start: '2026-09-28',
      end: '2026-10-04',
    });

    const custom = {
      ...monthly,
      period: 'custom' as const,
      startOn: '2026-12-01',
      endOn: '2026-12-31',
    };
    expect(budgetPeriodFor(custom, '2026-12-15')).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
    });
    expect(budgetPeriodFor(custom, '2027-01-01')).toBeNull();
  });

  it('lists every period since the start only when rolling over', () => {
    expect(budgetPeriodsThrough(monthly, '2026-09-30')).toHaveLength(1);
    const rolling = { ...monthly, rollover: true };
    expect(budgetPeriodsThrough(rolling, '2026-09-30').map((r) => r.start)).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ]);
  });
});

describe('expandCategoryScope', () => {
  it('includes subcategories of selected parents', () => {
    const categories = [
      { id: 'food', parentId: null },
      { id: 'groceries', parentId: 'food' },
      { id: 'coffee', parentId: 'food' },
      { id: 'fuel', parentId: 'transport' },
    ];
    expect(expandCategoryScope(['food'], categories).sort()).toEqual([
      'coffee',
      'food',
      'groceries',
    ]);
    expect(expandCategoryScope(['fuel'], categories)).toEqual(['fuel']);
  });
});

describe('computeBudgetStatus', () => {
  const range = { start: '2026-09-01', end: '2026-09-30' };

  it('reports spent, remaining and crossed thresholds', () => {
    const status = computeBudgetStatus(monthly, [{ range, spentMinor: 2_250_000 }]);
    expect(status).toMatchObject({
      availableMinor: 3_000_000,
      spentMinor: 2_250_000,
      remainingMinor: 750_000,
      percentUsed: 75,
      crossedThresholds: [],
      state: 'ok',
    });
  });

  it('warns at thresholds and flags overspending', () => {
    expect(computeBudgetStatus(monthly, [{ range, spentMinor: 2_400_000 }])).toMatchObject({
      percentUsed: 80,
      crossedThresholds: [80],
      state: 'warning',
    });
    expect(computeBudgetStatus(monthly, [{ range, spentMinor: 3_600_000 }])).toMatchObject({
      remainingMinor: -600_000,
      percentUsed: 120,
      crossedThresholds: [80, 100],
      state: 'over',
    });
  });

  it('treats net refunds (negative spend) as nothing spent', () => {
    expect(computeBudgetStatus(monthly, [{ range, spentMinor: -50_000 }])).toMatchObject({
      percentUsed: 0,
      remainingMinor: 3_050_000,
      state: 'ok',
    });
  });

  it('carries unused and overspent amounts forward with rollover', () => {
    const rolling = { ...monthly, rollover: true };
    const status = computeBudgetStatus(rolling, [
      { range: { start: '2026-07-01', end: '2026-07-31' }, spentMinor: 2_000_000 }, // +1,000,000
      { range: { start: '2026-08-01', end: '2026-08-31' }, spentMinor: 4_500_000 }, // -500,000
      { range, spentMinor: 1_000_000 },
    ]);
    expect(status).toMatchObject({
      carryOverMinor: -500_000,
      availableMinor: 2_500_000,
      remainingMinor: 1_500_000,
      percentUsed: 40,
    });
  });

  it('is over budget when rollover has eaten the whole budget', () => {
    const rolling = { ...monthly, rollover: true };
    const status = computeBudgetStatus(rolling, [
      { range: { start: '2026-08-01', end: '2026-08-31' }, spentMinor: 7_000_000 },
      { range, spentMinor: 100 },
    ]);
    expect(status).toMatchObject({ availableMinor: -1_000_000, percentUsed: 100, state: 'over' });
  });

  it('returns null without periods', () => {
    expect(computeBudgetStatus(monthly, [])).toBeNull();
  });
});
