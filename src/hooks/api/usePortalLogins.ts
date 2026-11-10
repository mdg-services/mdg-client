import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  sdmsResetIsLive,
  type OtpResetPortal,
  type PortalId,
  type PortalLoginsView,
  type SdmsResetView,
} from '@dk/shared/types';

/**
 * Where the outlet's portal logins stand — SDMS and IRAS for an Indian Oil outlet,
 * the one BPCL or HPCL portal for one of those — for the login box MDG posts in
 * the chat (`message.portalLogin`).
 *
 * The view says whether each login is saved, missing or was refused by the
 * portal, and whether this user may fill it — never the user ID or the password.
 * It is asked for only by a box that is on screen, so a chat with no box in it
 * never makes the call.
 */

export const portalLoginsKey = ['portal-logins', 'me'] as const;

/** How often the box asks again while a password reset is running on the server. */
export const RESET_POLL_MS = 4_000;

export function usePortalLogins() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: portalLoginsKey,
    enabled: !!token,
    // Long enough that several boxes in one thread share one answer; a box that
    // MDG posts, or a save from this phone, replaces it right away (see below).
    staleTime: 30_000,
    // A reset ends in about a minute. The server also says so over the socket, but a
    // phone that was asleep may have missed it: while one runs, ask now and then.
    refetchInterval: (query) =>
      query.state.data?.portals.some((p) => p.reset?.state === 'running') ? RESET_POLL_MS : false,
    queryFn: () => api.get<PortalLoginsView>('/v1/me/portal-logins'),
  });
}

/** The owner answers "do you also own a tanker?". The answer is the fresh view. */
export function useSaveTankerAnswer() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (owns: boolean) => api.put<PortalLoginsView>('/v1/me/portal-logins/tanker', { owns }),
    onSuccess: (view) => {
      qc.setQueryData(portalLoginsKey, view);
    },
  });
}

export interface ResetPortalPasswordVars {
  portal: PortalId;
  /** Only when no user ID is saved: the one the owner typed. */
  username?: string;
}

/**
 * The owner's "Forgot password?": MDG asks the portal for a new password. The answer
 * is the view with the reset running; its end arrives by socket and by the poll above.
 * Never retried: a second press is a second new password.
 */
export function useResetPortalPassword() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: ({ portal, username }: ResetPortalPasswordVars) =>
      api.post<PortalLoginsView>(`/v1/me/portal-logins/${portal}/reset`, username ? { username } : {}),
    onSuccess: (view) => {
      qc.setQueryData(portalLoginsKey, view);
    },
  });
}

export interface SavePortalLoginVars {
  portal: PortalId;
  username: string;
  password: string;
}

/**
 * Save one login. The answer is the fresh view, which goes straight into the
 * cache so every box in the thread flips to "saved" at once.
 *
 * The password is in `variables` for as long as the mutation lives, so it is
 * dropped the moment the call settles (`gcTime: 0`), and the caller resets it
 * too. Never retried: a refused or rate-limited save would only be refused again.
 */
export function useSavePortalLogin() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: ({ portal, username, password }: SavePortalLoginVars) =>
      api.put<PortalLoginsView>(`/v1/me/portal-logins/${portal}`, { username, password }),
    onSuccess: (view) => {
      qc.setQueryData(portalLoginsKey, view);
    },
  });
}

/** Ask the server again — a box MDG just posted may have a new state behind it. */
export function invalidatePortalLogins(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: portalLoginsKey });
}

// ── SDMS "Forgot password?" ───────────────────────────────────────────────

/** How often the box asks where a reset stands while it is going. */
export const SDMS_RESET_POLL_MS = 1_500;

/** Following and answering a reset is the same for both portals: by its id, under the SDMS path. */
const RESET_PATH = '/v1/me/portal-logins/sdms/reset';
/** Starting one is per portal: the old SDMS's start takes the user ID typed in its row. */
const RESET_START_PATH: Record<OtpResetPortal, string> = {
  sdms: RESET_PATH,
  sdmsOld: '/v1/me/portal-logins/sdms-old/reset',
};
export const sdmsResetKey = (id: string) => ['portal-logins', 'sdms-reset', id] as const;

/** This portal's reset inside the login box's view. */
export function otpResetOf(view: PortalLoginsView, portal: OtpResetPortal): SdmsResetView | null {
  return (portal === 'sdmsOld' ? view.sdmsOldReset : view.sdmsReset) ?? null;
}

/**
 * "Forgot password?" → "Send OTP". The answer is the login box's view with the
 * reset in it — this owner's new one, or the one another owner already started
 * (the server keeps one per outlet). The old SDMS's start carries the user ID typed
 * in its row, when one was.
 */
export function useStartSdmsReset(portal: OtpResetPortal = 'sdms') {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (username?: string) =>
      api.post<PortalLoginsView>(RESET_START_PATH[portal], portal === 'sdmsOld' && username ? { username } : {}),
    onSuccess: (view) => {
      qc.setQueryData(portalLoginsKey, view);
      const reset = otpResetOf(view, portal);
      if (reset) qc.setQueryData(sdmsResetKey(reset.id), reset);
    },
  });
}

/**
 * Follow one reset: every 1.5 seconds while it is going, and at once when the
 * owner comes back from reading the SMS; it stops by itself when the reset ends.
 */
export function useSdmsReset(id: string | null, seed?: SdmsResetView | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: sdmsResetKey(id ?? ''),
    enabled: !!token && !!id,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && sdmsResetIsLive(state) ? SDMS_RESET_POLL_MS : false;
    },
    initialData: seed && id && seed.id === id ? seed : undefined,
    queryFn: () => api.get<SdmsResetView>(`${RESET_PATH}/${encodeURIComponent(id ?? '')}`),
  });
}

/**
 * The OTP and the new password, together. They live in `variables` only as long
 * as the call does (`gcTime: 0`), and the caller clears its fields too.
 */
export function useAnswerSdmsReset(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (vars: { otp: string; password: string }) =>
      api.put<SdmsResetView>(`${RESET_PATH}/${encodeURIComponent(id ?? '')}`, vars),
    onSuccess: (view) => {
      if (id) qc.setQueryData(sdmsResetKey(id), view);
    },
  });
}
