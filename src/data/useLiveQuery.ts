import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { dataChanges } from '@/db/client';

import { useRepositories } from './DatabaseProvider';
import type { Repositories } from './repositories';

export type LiveQueryState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: Error };

export type LiveQuery<T> = LiveQueryState<T> & { reload: () => void };

const LOADING = { status: 'loading', data: undefined, error: undefined } as const;

/**
 * Runs a synchronous repository read and re-runs it whenever the local database changes.
 * `load` must be referentially stable (the React Compiler memoizes inline closures;
 * otherwise wrap it in `useCallback`). Refreshes keep showing the previous data rather
 * than flashing a loading state.
 */
export function useLiveQuery<T>(load: (repos: Repositories) => T): LiveQuery<T> {
  const repos = useRepositories();
  const version = useSyncExternalStore(dataChanges.subscribe, dataChanges.getVersion);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LiveQueryState<T>>(LOADING);

  useEffect(() => {
    let cancelled = false;
    // Deferred one tick so the current frame (e.g. a loading state) paints first.
    const handle = setTimeout(() => {
      try {
        const data = load(repos);
        if (!cancelled) setState({ status: 'ready', data, error: undefined });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            data: undefined,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [load, repos, version, attempt]);

  const reload = useCallback(() => {
    setState(LOADING);
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
