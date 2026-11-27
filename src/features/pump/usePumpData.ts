import { useQuery } from '@tanstack/react-query';

import { paymentsListQueryKey } from '@/features/payments/api';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ResolvedDealerProfileField } from '@dk/shared';
import type { DealerDocumentAskList, DealerPaymentsList, MeServicesView, User } from '@dk/shared/types';

/**
 * The reads behind My pump and Papers and licences (spec 4.5). One hook per source, so each row of the
 * page asks for its own thing and fails alone. Every key carries the outlet, so a person who switches
 * pump never sees the other pump's answer, and every read that is owner only takes `enabled`, so a
 * manager's phone never asks for what the server would refuse.
 *
 * None of these answers is ever the first thing on a screen: the page draws from what it has and fills
 * in. None invents a route: each is an endpoint that exists today, except `/me/services`, which is new
 * and is allowed to be absent (an older server answers 404, and the row simply is not drawn).
 */

const FIVE_MIN = 5 * 60_000;

/** `GET /v1/me/outlet`: the dealer-visible outlet file, a list of `{ key, label, value, ... }`. */
export function useMyOutlet() {
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);
  return useQuery({
    queryKey: ['pump', 'outlet', dealerId],
    enabled: !!token,
    staleTime: FIVE_MIN,
    queryFn: async (): Promise<ResolvedDealerProfileField[]> => {
      const res = await api.get<{ fields?: ResolvedDealerProfileField[] }>('/v1/me/outlet');
      return Array.isArray(res?.fields) ? res.fields : [];
    },
  });
}

/** `GET /v1/asks/me/on-file`: the papers MDG has accepted, each with its end date when it has one. */
export function useDocumentsOnFile() {
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);
  return useQuery({
    queryKey: ['pump', 'on-file', dealerId],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: () => api.get<DealerDocumentAskList>('/v1/asks/me/on-file'),
  });
}

/**
 * `GET /v1/me/services`: what MDG runs, with a plain run state. NEW on the server, so a 404 (an older
 * server) is an answer of its own, `null`: "not there", and the page hides the row rather than say
 * anything about it. Any other failure is an error.
 */
export function usePumpServices() {
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);
  return useQuery({
    queryKey: ['pump', 'services', dealerId],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async (): Promise<MeServicesView | null> => {
      try {
        const view = await api.get<MeServicesView>('/v1/me/services');
        return view && Array.isArray(view.services) ? view : null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

/** The bills, for ONE line of days. The owner's only: a manager's phone never calls it. */
export function usePumpBill(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  return useQuery<DealerPaymentsList>({
    queryKey: paymentsListQueryKey,
    enabled: !!token && enabled,
    staleTime: 60_000,
    queryFn: () => api.get<DealerPaymentsList>('/v1/payments/me'),
  });
}

/** The key the team list is held under: one list, shared by My pump's team row and the Team page. */
export const teamKey = (dealerId: string | null | undefined) => ['dealer-users', dealerId ?? null] as const;

/**
 * `GET /v1/dealers/:id/users`: the people who can sign in. A 403 or a 404 is not an error to draw, it
 * is "not yours to see": the answer is `null`, which hides the team row and the Team card.
 */
export function useTeamUsers(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId);
  return useQuery({
    queryKey: teamKey(dealerId),
    enabled: !!token && !!dealerId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<User[] | null> => {
      try {
        return await api.get<User[]>(`/v1/dealers/${dealerId}/users`);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return null;
        throw err;
      }
    },
  });
}
