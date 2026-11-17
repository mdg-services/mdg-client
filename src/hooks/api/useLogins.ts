import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LoginPortal, LoginsView } from '@/features/logins/types';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

import { portalLoginsKey } from './usePortalLogins';

/**
 * The owner's "IDs and passwords" page: every login the outlet has or needs, with its
 * ID and its history. Never a password. Held in memory only, like every other query.
 */
export const loginsKey = ['logins', 'me'] as const;

export function useLogins() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: loginsKey,
    enabled: !!token,
    // A change made from the chat box, or by MDG's team, shows when the page is opened again.
    staleTime: 0,
    queryFn: () => api.get<LoginsView>('/v1/me/logins'),
  });
}

/**
 * The owner's "show": one login's password, or one old entry's (`versionId`).
 *
 * A plain call and not a query or a mutation on purpose: the answer must not sit in
 * the query cache. The page keeps it in the state of the one row that asked, and drops
 * it after half a minute.
 */
export function showLogin(portal: LoginPortal, versionId?: string): Promise<{ username: string; password: string }> {
  return api.post<{ username: string; password: string }>(
    `/v1/me/logins/${portal}/reveal`,
    versionId ? { versionId } : {},
  );
}

export interface SaveLoginVars {
  portal: LoginPortal;
  username: string;
  password: string;
}

/**
 * Save one login: the same two routes the chat box uses (`PUT /me/portal-logins/:portal`,
 * and `/me/wemmis-login` for eMaaptaul), so every rule on them still holds (refused-pair,
 * reset in progress, rate limit). The page then asks again, and the chat box's own view
 * is refreshed, so the two never disagree.
 *
 * The password sits in `variables` while the call lives, so it is dropped the moment it
 * settles (`gcTime: 0`). Never retried.
 */
export function useSaveLogin() {
  const qc = useQueryClient();
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: ({ portal, username, password }: SaveLoginVars) =>
      portal === 'wemmis'
        ? api.put<unknown>('/v1/me/wemmis-login', { username, password })
        : api.put<unknown>(`/v1/me/portal-logins/${portal}`, { username, password }),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: portalLoginsKey });
      await qc.invalidateQueries({ queryKey: loginsKey });
    },
  });
}
