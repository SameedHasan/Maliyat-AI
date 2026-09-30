import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';

import * as schema from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { uuidV7 } from '@/domain/ids';

import { createRepositories } from '../repositories';

export const TEST_USER_ID = '00000000-0000-7000-8000-00000000000a';

/**
 * In-memory SQLite running the real app migrations, for repository tests in Node.
 * Uses a controllable clock and deterministic, time-ordered IDs.
 */
export function createTestRepositories(start = new Date('2026-09-30T07:00:00Z')) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema }) as unknown as AppDatabase;
  migrate(db as never, {
    migrationsFolder: path.join(__dirname, '../../db/migrations'),
  });

  let nowMs = start.getTime();
  let counter = 0;
  const newId = () => {
    counter += 1;
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(12, counter);
    return uuidV7(bytes, nowMs);
  };

  const repos = createRepositories({
    db,
    userId: TEST_USER_ID,
    timeZone: 'Asia/Karachi',
    now: () => new Date(nowMs),
    newId,
  });

  return {
    ...repos,
    sqlite,
    advance(ms: number) {
      nowMs += ms;
    },
    close() {
      sqlite.close();
    },
  };
}

export type TestRepositories = ReturnType<typeof createTestRepositories>;
