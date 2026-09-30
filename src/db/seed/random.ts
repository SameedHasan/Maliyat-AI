/** Small deterministic PRNG (mulberry32) so seed data is reproducible. */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    chance: (p: number) => next() < p,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    /** Number of events for a daily rate, e.g. 1.4 → 1 or 2. */
    count: (rate: number) => Math.floor(rate) + (next() < rate - Math.floor(rate) ? 1 : 0),
    /** Whole-rupee amount in minor units, rounded to `step` rupees. */
    rupees: (min: number, max: number, step = 10) =>
      Math.round((Math.floor(next() * (max - min + 1)) + min) / step) * step * 100,
  };
}

export type Random = ReturnType<typeof createRandom>;
