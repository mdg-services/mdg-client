import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { postToNative } from '@/lib/nativeBridge';
import { queryClient } from '@/lib/queryClient';
import type { User } from '@dk/shared/types';

interface AuthState {
  token: string | null;
  user: User | null;
  login: (payload: { token: string; user: User }) => void;
  logout: () => void;
  setUser: (user: User) => void;
  /**
   * Swap in a token the server rolled forward (see `REFRESHED_TOKEN_HEADER`).
   * Ignored when signed out, so a response that overtakes a logout cannot sign
   * the dealer back in.
   */
  setToken: (token: string) => void;
}

/**
 * Best-effort: unregister the push token with the backend (while the auth
 * token is still valid) and tell the native shell we logged out. Never blocks
 * or throws — logout must always proceed. Done via dynamic imports to avoid a
 * static import cycle with `lib/api` (which imports from this module).
 */
function teardownPushOnLogout(authToken: string | null): void {
  try {
    void (async () => {
      try {
        const [
          { getRegisteredPushToken, clearRegisteredPushToken },
          { buildUrl },
        ] = await Promise.all([
          import('@/hooks/usePushBridge'),
          import('@/lib/api'),
        ]);
        const pushToken = getRegisteredPushToken();
        if (pushToken && authToken) {
          try {
            // DELETE carries a body, which `api.del` does not support, and we
            // must use the auth token captured before state was cleared, so
            // call fetch directly.
            await fetch(buildUrl('/v1/devices'), {
              method: 'DELETE',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({ token: pushToken }),
            });
          } catch {
            // ignore network/HTTP errors on unregister
          }
        }
        clearRegisteredPushToken();
      } catch {
        // ignore module/load errors
      }
    })();
    postToNative({ type: 'auth:logout' });
  } catch {
    // never let logout teardown throw
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: ({ token, user }) => {
        // Purge any cached queries from a previous session. The QueryClient is
        // a long-lived singleton (notably inside the Expo WebView, whose JS
        // context survives across logins), so without this a new account could
        // briefly see the previous user's cached conversation and messages.
        queryClient.clear();
        set({ token, user });
      },
      logout: () => {
        const { token } = get();
        teardownPushOnLogout(token);
        set({ token: null, user: null });
        // Drop all cached data so nothing from this session lingers for the
        // next account that signs in on the same device.
        queryClient.clear();
      },
      setUser: (user) => set({ user }),
      setToken: (token) => {
        if (!get().token) return;
        set({ token });
      },
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

/** Where an involuntary logout leaves its note for the login screen. */
export const SESSION_EXPIRED_KEY = 'mdg.client.sessionExpired';

/**
 * Sign the dealer out because the server said the token is no longer good.
 *
 * DIFFERENT FROM PRESSING "Log out", and the difference has to reach the user.
 * A dealer who opens the app and finds a blank "Welcome back" form, with nothing
 * anywhere saying what happened, has been given no reason to trust it.
 *
 * This is now RARE. A dealer's token lives a year and rolls forward on use, so
 * running out of one takes a year of not opening the app. What is left is
 * signing in on another phone, which retires the session on this one. The
 * marker is one-shot: the login screen reads it and clears it, so it cannot
 * haunt a later deliberate logout.
 */
export function clearAuth(): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
  } catch {
    // Private mode / storage disabled: the sign-out still has to happen.
  }
  useAuthStore.getState().logout();
}
