import { drizzle } from 'drizzle-orm/expo-sqlite';
import { addDatabaseChangeListener, openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

/**
 * Phase 0 uses one fixed database. Once auth lands, each signed-in user gets their own
 * file (`maliyat_<userId>.db`) and sign-out deletes it (plan §25).
 */
export const DATABASE_NAME = 'maliyat_dev.db';

export function openDatabase() {
  const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
  sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return drizzle(sqlite, { schema });
}

export type ExpoDatabase = ReturnType<typeof openDatabase>;

const CHANGE_DEBOUNCE_MS = 60;

let dataVersion = 0;
const subscribers = new Set<() => void>();
let pending: ReturnType<typeof setTimeout> | null = null;
let nativeSubscription: { remove(): void } | null = null;

function notify() {
  pending = null;
  dataVersion += 1;
  for (const subscriber of subscribers) subscriber();
}

/**
 * A counter bumped (debounced) whenever any row changes. SQLite reports every row
 * individually, so a bulk write produces one bump rather than thousands of re-renders.
 */
export const dataChanges = {
  getVersion: () => dataVersion,
  subscribe(subscriber: () => void) {
    subscribers.add(subscriber);
    nativeSubscription ??= addDatabaseChangeListener(() => {
      pending ??= setTimeout(notify, CHANGE_DEBOUNCE_MS);
    });
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) {
        nativeSubscription?.remove();
        nativeSubscription = null;
      }
    };
  },
};
