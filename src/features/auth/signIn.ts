import { apiFetch } from '@/lib/api';
import { postToNative } from '@/lib/nativeBridge';
import { useAuthStore } from '@/store/auth';
import type { AuthLoginResponse } from '@dk/shared/types';

/**
 * The sign-in request, as the sign-in screen and a just-finished registration
 * both make it. `identifier` is ten plain digits for a mobile, lower case for an
 * email. A 401 here is "that password is wrong", not "your session ended".
 */
export function requestSignIn(identifier: string, password: string): Promise<AuthLoginResponse> {
  return apiFetch<AuthLoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: { identifier, password },
    signOutOn401: false,
  });
}

/** Keep the session, and tell the native shell (if any) to register for push notifications. */
export function startSession(data: AuthLoginResponse): void {
  useAuthStore.getState().login({ token: data.token, user: data.user });
  // No-op in a normal browser.
  postToNative({ type: 'auth:login', token: data.token });
}
