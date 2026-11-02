import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { DealerWemmisLoginView, WemmisResetState, WemmisResetView } from '@dk/shared/types';

/**
 * Where the outlet's eMaaptaul login stands, for the box MDG posts in the chat
 * (`message.wemmisLogin`, ADR 0029) — and, while the owner is resetting a
 * forgotten password with an OTP, where that reset stands.
 *
 * The login view says whether the login is saved, missing or was refused by the
 * site, and whether this user may fill it — never the password. It is asked for
 * only by a box that is on screen, so a chat with no box in it never makes the
 * call.
 */

/** How often the box asks where a password reset stands. */
export const RESET_POLL_MS = 1_500;

/**
 * The states in which the robot is still working or waiting for the owner, so the
 * box keeps asking. `done`, `failed` and `expired` are the ends: nothing changes
 * after them, and asking on would only spend the owner's data.
 */
const LIVE_STATES: ReadonlySet<WemmisResetState> = new Set([
  'starting',
  'otp_sent',
  'checking',
  'wrong_otp',
  'need_captcha',
  'choose_user',
  'resetting',
]);

export function resetIsLive(state: WemmisResetState): boolean {
  return LIVE_STATES.has(state);
}

export const wemmisLoginKey = ['wemmis-login', 'me'] as const;
export const wemmisResetKey = (id: string) => ['wemmis-login', 'reset', id] as const;

const LOGIN_PATH = '/v1/me/wemmis-login';
const resetPath = (id: string) => `${LOGIN_PATH}/reset/${encodeURIComponent(id)}`;

export function useWemmisLogin() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: wemmisLoginKey,
    enabled: !!token,
    // Long enough that two boxes in one thread share one answer; a box that MDG
    // posts, or a save from this phone, replaces it right away.
    staleTime: 30_000,
    queryFn: () => api.get<DealerWemmisLoginView>(LOGIN_PATH),
  });
}

export interface SaveWemmisLoginVars {
  username: string;
  password: string;
}

/**
 * Save the login. The answer is the fresh view, which goes straight into the
 * cache so every box in the thread flips to "saved" at once.
 *
 * The password is in `variables` for as long as the mutation lives, so it is
 * dropped the moment the call settles (`gcTime: 0`), and the caller resets it
 * too. Never retried: a refused or rate-limited save would only be refused again.
 */
export function useSaveWemmisLogin() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: ({ username, password }: SaveWemmisLoginVars) =>
      api.put<DealerWemmisLoginView>(LOGIN_PATH, { username, password }),
    onSuccess: (view) => {
      qc.setQueryData(wemmisLoginKey, view);
    },
  });
}

/**
 * "Send OTP": ask the server to open the eMaaptaul site and have the OTP sent to
 * the registered mobile. The answer is the login view with the new reset in it;
 * the reset goes into its own cache entry so the box can start following it with
 * no second call.
 */
export function useStartWemmisReset() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: ({ mobile }: { mobile: string }) =>
      api.post<DealerWemmisLoginView>(`${LOGIN_PATH}/reset`, { mobile }),
    onSuccess: (view) => {
      qc.setQueryData(wemmisLoginKey, view);
      if (view.reset) qc.setQueryData(wemmisResetKey(view.reset.id), view.reset);
    },
  });
}

/**
 * Follow a reset. The robot has about two minutes, so this asks again every
 * 1.5 seconds for as long as the reset is going (starting, waiting for the OTP,
 * checking it, …) and stops by itself when it ends, and when the box leaves the
 * screen. A reset the box already holds (`seed`) is shown at once.
 */
export function useWemmisReset(id: string | null, seed?: WemmisResetView | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: wemmisResetKey(id ?? ''),
    enabled: !!token && !!id,
    retry: false,
    // Always worth asking: this is a live exchange with a robot on a clock.
    staleTime: 0,
    // The owner steps out to read the SMS and back in: look again the moment they
    // return rather than at the next tick.
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && resetIsLive(state) ? RESET_POLL_MS : false;
    },
    initialData: seed && id && seed.id === id ? seed : undefined,
    queryFn: () => api.get<WemmisResetView>(resetPath(id ?? '')),
  });
}

export interface AnswerWemmisResetVars {
  otp?: string;
  captcha?: string;
  username?: string;
}

/**
 * Hand the robot what it is waiting for — the OTP (with the picture's letters
 * when it asked for them) or the login the owner picked. The answer is the fresh
 * reset, which goes straight into the cache.
 *
 * The OTP is in `variables` for as long as the mutation lives, so it is dropped
 * the moment the call settles (`gcTime: 0`), and the caller resets it too.
 */
export function useAnswerWemmisReset(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (vars: AnswerWemmisResetVars) =>
      api.put<WemmisResetView>(resetPath(id ?? ''), vars),
    onSuccess: (view) => {
      if (id) qc.setQueryData(wemmisResetKey(id), view);
    },
  });
}

/** Ask the server again — a box MDG just posted may have a new state behind it. */
export function invalidateWemmisLogin(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: wemmisLoginKey });
}
