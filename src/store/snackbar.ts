import { create } from 'zustand';

export interface SnackbarMessage {
  id: number;
  message: string;
  action?: { label: string; onPress: () => void };
}

interface SnackbarState {
  current: SnackbarMessage | null;
  show: (message: Omit<SnackbarMessage, 'id'>) => void;
  dismiss: (id?: number) => void;
}

let nextId = 1;

/** One message at a time; a new one replaces the current. */
export const useSnackbar = create<SnackbarState>()((set) => ({
  current: null,
  show: (message) => set({ current: { ...message, id: nextId++ } }),
  dismiss: (id) => set((s) => (id === undefined || s.current?.id === id ? { current: null } : s)),
}));

export const showSnackbar = (message: Omit<SnackbarMessage, 'id'>) =>
  useSnackbar.getState().show(message);
