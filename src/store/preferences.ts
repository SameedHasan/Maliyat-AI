import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

interface PreferencesState {
  theme: ThemePreference;
  hideAmounts: boolean;
  setTheme: (theme: ThemePreference) => void;
  toggleHideAmounts: () => void;
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
      setTheme: (theme) => set({ theme }),
      toggleHideAmounts: () => set((s) => ({ hideAmounts: !s.hideAmounts })),
    }),
    {
      name: 'maliyat.preferences',
      version: 1,
      storage,
      partialize: ({ theme, hideAmounts }) => ({ theme, hideAmounts }),
    },
  ),
);
