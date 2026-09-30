import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { getCalendars } from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState, Screen } from '@/components/ui';
import { openDatabase, type ExpoDatabase } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { DEFAULT_TIMEZONE } from '@/domain/dates';
import { newId } from '@/utils/id';

import { createRepositories, type Repositories } from './repositories';

/** Fixed until auth lands; then this comes from the Supabase session (plan §25). */
export const DEV_USER_ID = '00000000-0000-7000-8000-000000000001';

let database: ExpoDatabase | null = null;
function getDatabase(): ExpoDatabase {
  database ??= openDatabase();
  return database;
}

const RepositoriesContext = createContext<Repositories | null>(null);

export function DatabaseProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const [db] = useState(getDatabase);
  const { success, error } = useMigrations(db, migrations);

  const repos = useMemo(
    () =>
      createRepositories({
        db,
        userId: DEV_USER_ID,
        timeZone: getCalendars()[0]?.timeZone ?? DEFAULT_TIMEZONE,
        now: () => new Date(),
        newId,
      }),
    [db],
  );

  const settled = success || error !== undefined;
  useEffect(() => {
    if (settled) void SplashScreen.hideAsync();
  }, [settled]);

  if (error) {
    return (
      <Screen>
        <ErrorState
          title={t('startup.migrationFailedTitle')}
          message={t('startup.migrationFailedBody')}
          details={__DEV__ ? error.message : undefined}
        />
      </Screen>
    );
  }
  // The splash screen stays up while migrations run, so nothing needs rendering here.
  if (!success) return null;

  return <RepositoriesContext value={repos}>{children}</RepositoriesContext>;
}

export function useRepositories(): Repositories {
  const repos = use(RepositoriesContext);
  if (!repos) throw new Error('useRepositories must be used inside <DatabaseProvider>');
  return repos;
}
