import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { PortalId, PortalLoginsView } from '@dk/shared/types';

/**
 * Where the outlet's SDMS and IRAS logins stand, for the login box MDG posts in
 * the chat (`message.portalLogin`).
 *
 * The view says whether each login is saved, missing or was refused by the
 * portal, and whether this user may fill it — never the user ID or the password.
 * It is asked for only by a box that is on screen, so a chat with no box in it
 * never makes the call.
 */

export const portalLoginsKey = ['portal-logins', 'me'] as const;

export function usePortalLogins() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: portalLoginsKey,
    enabled: !!token,
    // Long enough that several boxes in one thread share one answer; a box that
    // MDG posts, or a save from this phone, replaces it right away (see below).
    staleTime: 30_000,
    queryFn: () => api.get<PortalLoginsView>('/v1/me/portal-logins'),
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
