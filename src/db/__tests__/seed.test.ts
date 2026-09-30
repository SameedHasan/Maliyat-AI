/**
 * @jest-environment node
 */
import { createTestRepositories } from '../../data/testing/createTestRepositories';
import { outbox } from '../schema';
import { clearDatabase, seedDatabase } from '../seed';

describe('seedDatabase', () => {
  it('creates a large, valid, reproducible dataset without queuing sync changes', () => {
    const a = createTestRepositories();
    const result = seedDatabase(a);

    expect(result.accounts).toBe(6);
    expect(result.transactions).toBeGreaterThan(3_500);
    expect(result.transactions).toBeLessThan(7_000);
    expect(a.ctx.db.select().from(outbox).all()).toHaveLength(0);

    const kinds = new Set<string>();
    let cursor = null;
    let count = 0;
    do {
      const page: ReturnType<typeof a.transactions.list> = a.transactions.list({
        limit: 200,
        cursor,
      });
      page.items.forEach((t) => kinds.add(t.kind));
      count += page.items.length;
      cursor = page.nextCursor;
    } while (cursor);

    // Generated transactions + one opening balance per account.
    expect(count).toBe(result.transactions + 6);
    expect([...kinds].sort()).toEqual([
      'expense',
      'income',
      'opening_balance',
      'refund',
      'transfer',
    ]);

    const b = createTestRepositories();
    expect(seedDatabase(b).transactions).toBe(result.transactions);

    a.close();
    b.close();
  });

  it('clears all data', () => {
    const r = createTestRepositories();
    seedDatabase(r, { months: 1 });
    clearDatabase(r);
    expect(r.accounts.list({ includeArchived: true })).toHaveLength(0);
    expect(r.transactions.list().items).toHaveLength(0);
    r.close();
  });
});
