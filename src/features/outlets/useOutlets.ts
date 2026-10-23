import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { postToNative } from '@/lib/nativeBridge';
import { useAuthStore } from '@/store/auth';
import type { AuthLoginResponse, OutletChoice, OutletsView } from '@dk/shared/types';

/**
 * One person, several pumps (onboarding v2, phase 9).
 *
 * An owner who runs two pumps has one login per pump, with one password and one
 * `personId`. The app asks which pumps the person has only when the signed-in
 * user carries a `personId` — which is nearly nobody, and costs nobody else a
 * request. `GET /v1/auth/outlets` answers the pump this login is in and the
 * others a switch may go to.
 */
/** `GET /v1/auth/outlets` and `POST /v1/auth/switch-outlet` answer the shared shapes. */
export type { OutletsView } from '@dk/shared/types';
export type SwitchOutletResponse = AuthLoginResponse;

export const outletsKey = ['auth', 'outlets'] as const;

export function useOutlets() {
  const token = useAuthStore((s) => s.token);
  const personId = useAuthStore((s) => s.user?.personId);
  return useQuery({
    queryKey: [...outletsKey, personId ?? null],
    enabled: !!token && !!personId,
    // Who the person's pumps are changes only when MDG adds one.
    staleTime: 5 * 60_000,
    queryFn: () => api.get<OutletsView>('/v1/auth/outlets'),
  });
}

/** Whether this person has another pump to switch to — what shows the chip and the Settings row. */
export function hasOtherOutlets(view: OutletsView | undefined): view is OutletsView & { current: OutletChoice } {
  return !!view?.current && view.outlets.length > 0;
}

/**
 * Open the chat list afresh. A full load, not a route change: the other pump has
 * its own chats, services and cards, and a fresh start is the one way to be sure
 * nothing of the first one is still on screen or in a socket.
 */
export function reloadIntoChat(): void {
  window.location.assign('/chat');
}

/**
 * Switch to another of the person's pumps. The server answers a fresh token for
 * that pump's login, which replaces this one (the store's `login` also drops every
 * cached answer from the pump just left), and the app reloads into it. The native
 * shell is told, so push notifications follow the pump the person is now in.
 */
export function useSwitchOutlet(onSwitched: () => void = reloadIntoChat) {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    retry: false,
    mutationFn: (userId: string) =>
      api.post<SwitchOutletResponse>('/v1/auth/switch-outlet', { userId }),
    onSuccess: (data) => {
      login({ token: data.token, user: data.user });
      postToNative({ type: 'auth:login', token: data.token });
      onSwitched();
    },
  });
}
