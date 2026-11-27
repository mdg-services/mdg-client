import { mustChooseLanguage } from '@/components/ChooseLanguageScreen';
import { api, apiFetch } from '@/lib/api';
import { postToNative } from '@/lib/nativeBridge';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
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

/**
 * The language this phone's owner picked on the first-open screen (spec 4.9), handed to the account
 * at the first sign-in so the app never asks a second time. It is the very update the signed-in
 * picker (`ChooseLanguageScreen`) sends: `PATCH /v1/me { lang }`, which is what sets `langChosenAt`
 * on the server. Only for a dealer login that has never chosen (`langChosenAt: null`) and only when
 * the choice on this phone was deliberate (`explicit`); a save that fails is dropped, and the signed-in
 * picker then asks once, as it always did.
 */
function handOverChosenLanguage(user: AuthLoginResponse['user']): void {
  const { explicit, lang } = useLangStore.getState();
  if (!explicit || !mustChooseLanguage(user)) return;
  useAuthStore.getState().setUser({ ...user, lang, langChosenAt: new Date().toISOString() });
  void api.patch('/v1/me', { lang }).catch(() => undefined);
}

/** Keep the session, and tell the native shell (if any) to register for push notifications. */
export function startSession(data: AuthLoginResponse): void {
  useAuthStore.getState().login({ token: data.token, user: data.user });
  // No-op in a normal browser.
  postToNative({ type: 'auth:login', token: data.token });
  handOverChosenLanguage(data.user);
}
