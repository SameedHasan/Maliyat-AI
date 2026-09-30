import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Seconds in the background before the app locks again. */
export const LOCK_TIMEOUTS = [0, 60, 300, 900] as const;
export type LockTimeout = (typeof LOCK_TIMEOUTS)[number];

interface PreferencesState {
  theme: ThemePreference;
  hideAmounts: boolean;
  appLockEnabled: boolean;
  lockTimeout: LockTimeout;
  blockScreenshots: boolean;
  setTheme: (theme: ThemePreference) => void;
  toggleHideAmounts: () => void;
  setAppLockEnabled: (enabled: boolean) => void;
  setLockTimeout: (timeout: LockTimeout) => void;
  setBlockScreenshots: (enabled: boolean) => void;
}

// Synchronous storage so preferences are hydrated before the first frame (no theme flash).
const storage = createJSONStorage(() => ({
  getItem: (key: string) => Storage.getItemSync(key),
  setItem: (key: string, value: string) => Storage.setItemSync(key, value),
  removeItem: (key: string) => {
    Storage.removeItemSync(key);
  },
}));

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      hideAmounts: false,
      appLockEnabled: false,
      lockTimeout: 60,
      blockScreenshots: false,
      setTheme: (theme) => set({ theme }),
      toggleHideAmounts: () => set((s) => ({ hideAmounts: !s.hideAmounts })),
      setAppLockEnabled: (appLockEnabled) => set({ appLockEnabled }),
      setLockTimeout: (lockTimeout) => set({ lockTimeout }),
      setBlockScreenshots: (blockScreenshots) => set({ blockScreenshots }),
    }),
    {
      name: 'maliyat.preferences',
      version: 1,
      storage,
      partialize: ({ theme, hideAmounts, appLockEnabled, lockTimeout, blockScreenshots }) => ({
        theme,
        hideAmounts,
        appLockEnabled,
        lockTimeout,
        blockScreenshots,
      }),
    },
  ),
);
