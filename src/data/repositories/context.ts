import type { AppDatabase } from '@/db/types';
import type { IdGenerator } from '@/domain/ids';

export interface RepoContext {
  db: AppDatabase;
  userId: string;
  timeZone: string;
  now: () => Date;
  newId: IdGenerator;
}

export function timestamp(ctx: RepoContext): string {
  return ctx.now().toISOString();
}
