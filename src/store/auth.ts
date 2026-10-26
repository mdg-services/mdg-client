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
   * the dealer back in — and ignored unless it renews THIS sign-in (see
   * {@link sameSignIn}).
   */
  setToken: (token: string) => void;
}

/**
 * Whether two tokens belong to the same sign-in: the same person (`sub`) and the
 * same session (`sid`). A renewal never changes either; a new sign-in changes
 * the session.
 *
 * WHY THE CHECK EXISTS. The renewed token rides on a response header, and a
 * browser can hand back an OLD response's headers: a GET answered `304 Not
 * Modified` is served from the cache with the headers it was first stored with.
 * So a dealer who signed out and back in on the same phone got the new token,
 * then, a moment later, a renewal of the PREVIOUS sign-in off a cached reply —
 * which the server refuses as "signed in on another device". Nothing looked
 * wrong until the next time the app opened, on the login screen. Read without
 * verifying the signature: this only decides whether to keep a token, and the
 * server checks every one it is given.
 */
function sameSignIn(a: string, b: string): boolean {
  const claims = (token: string): { sub?: unknown; sid?: unknown } | null => {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
        sub?: unknown;
        sid?: unknown;
      };
    } catch {
      return null;
    }
  };
  const x = claims(a);
  const y = claims(b);
  if (!x || !y || typeof x.sub !== 'string' || typeof x.sid !== 'string') return false;
  return x.sub === y.sub && x.sid === y.sid;
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
        const current = get().token;
        if (!current) return;
        if (!sameSignIn(current, token)) return;
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

/** Where "Delete my account" leaves its note for the login screen. One-shot, like the one above. */
export const ACCOUNT_DELETED_KEY = 'mdg.client.accountDeleted';

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

/**
 * The code the server answers with, on any route, to a member who signed in
 * with a temporary password and has not yet chosen their own. Only
 * `GET /me`, the password change and sign-out are open to them until they do.
 */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * The server says a new password is due before anything else: flag the signed-in
 * member, which swaps the whole app for the "choose a new password" screen
 * (`ProtectedLayout`). This is what catches a member whose cached profile
 * predates the flag — an admin reset their password while the app was signed in.
 */
export function requirePasswordChange(): void {
  const { user, setUser } = useAuthStore.getState();
  if (user && !user.mustChangePassword) setUser({ ...user, mustChangePassword: true });
}
