import type { User } from '@dk/shared/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  user: User | null;
  login: (payload: { token: string; user: User }) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: ({ token, user }) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'mdg.client.auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);

/** Imperative accessor for the fetch client (outside React). */
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

export function clearAuth(): void {
  useAuthStore.getState().logout();
}
