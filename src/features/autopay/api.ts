import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { paymentsQueryKey } from '@/features/payments/api';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { StopAutopayDealerInput } from '@dk/shared/schemas';
import type { DealerAutopay, DealerAutopayStatus } from '@dk/shared/types';

/**
 * The owner's side of autopay (ADR 0022 §13). Both routes are the OWNER's: the
 * server answers a manager (dealer-staff) 403, so the screens never ask on a
 * manager's behalf — `useAutopayStatus` is switched off for anyone else.
 *
 * Nothing here can start an autopay. The app only reads it and stops it; turning
 * it on happens outside the app (Google Play's Payments policy).
 */

/** Under the payments key, so a payment confirmed elsewhere re-reads autopay too. */
export const autopayQueryKey = [...paymentsQueryKey, 'autopay'] as const;

const AUTOPAY_PATH = '/v1/payments/me/autopay';

/** True for the owner of the pump; the managers' answer to autopay is "not yours to change". */
export function useIsOwner(): boolean {
  return useAuthStore((s) => s.user?.role === 'dealer-owner');
}

/**
 * The autopay of the signed-in pump, or `{ autopay: null }` when there is
 * nothing to show.
 *
 * `staleTime: 0`, like the payments list: autopay can be stopped from the UPI
 * app while this screen sits in the background, and a screen that still says
 * "On" is worse than one more small request. Off for anyone but the owner.
 */
export function useAutopayStatus() {
  const token = useAuthStore((s) => s.token);
  const isOwner = useIsOwner();
  return useQuery<DealerAutopayStatus, ApiError>({
    queryKey: autopayQueryKey,
    enabled: !!token && isOwner,
    staleTime: 0,
    queryFn: () => api.get<DealerAutopayStatus>(AUTOPAY_PATH),
  });
}

/**
 * The autopay to SHOW on the Help screen and the Payments page: the owner's
 * autopay once the server has answered with one, and null in every other case —
 * loading, failed, none, or a manager. Those two pages draw their row only when
 * this is non-null, so a slow or failed answer simply leaves it out.
 *
 * Called by the PAGE, after its own content's query, rather than by the row: a
 * child's request goes out before its parent's, and on a slow link the bills and
 * the videos are what the page is for.
 */
export function useOwnerAutopay(): DealerAutopay | null {
  return useAutopayStatus().data?.autopay ?? null;
}

/** 404 `NO_AUTOPAY`: there is nothing to stop — it is already gone. */
export function isNoAutopay(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'NO_AUTOPAY';
}

/**
 * Stop it. Idempotent on the server: asking again of one that is already off
 * answers 200 with state `off`. A failure leaves everything as it was (503
 * `RAZORPAY_UNREACHABLE` means Razorpay could not be reached and nothing
 * changed), so the screen only changes after the server has said yes.
 *
 * On success the answer goes straight into the cache, so every screen showing
 * autopay flips together, and the bills are read again: a due bill's "Autopay
 * will take this" line is gone now. On `NO_AUTOPAY` the status is read again so
 * the screen shows what is true.
 */
export function useStopAutopay() {
  const qc = useQueryClient();
  return useMutation<DealerAutopayStatus, ApiError, StopAutopayDealerInput>({
    mutationFn: (body) => api.post<DealerAutopayStatus>(`${AUTOPAY_PATH}/stop`, body),
    onSuccess: (status) => {
      qc.setQueryData<DealerAutopayStatus>(autopayQueryKey, status);
      // Not the autopay key itself: the answer above is already the truth.
      void qc.invalidateQueries({
        queryKey: paymentsQueryKey,
        predicate: (q) => q.queryKey[1] !== 'autopay',
      });
    },
    onError: (err) => {
      if (isNoAutopay(err)) void qc.invalidateQueries({ queryKey: autopayQueryKey });
    },
  });
}
