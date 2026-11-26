import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { PlannerConvertInput } from '@dk/shared/schemas';
import type { PlannerView, User } from '@dk/shared/types';

import { isPlannerUser } from './isPlanner';

/**
 * Where the planner's New Pump Guide plan stands (`GET /v1/me/planner`): paid or
 * not, through when, and what the last bill did. The home card, the Settings page
 * and the strip in the chat all read this one answer.
 */
export const plannerKey = ['planner', 'me'] as const;

export function usePlannerView() {
  const token = useAuthStore((s) => s.token);
  const planner = useAuthStore((s) => isPlannerUser(s.user));
  return useQuery({
    queryKey: plannerKey,
    // Only a planner has a plan: an outlet's app never asks.
    enabled: !!token && planner,
    staleTime: 30_000,
    // The payment is made outside the app (the WhatsApp/SMS link): coming back to
    // the app is exactly when the plan may have just become active.
    refetchOnWindowFocus: true,
    queryFn: () => api.get<PlannerView>('/v1/me/planner'),
  });
}

export function invalidatePlanner(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: plannerKey });
}

/**
 * What the two "send it to my phone" actions answer: where it went. Read loosely,
 * because the planner's route may say less than the outlet's resend does; a field
 * that is missing is simply not named.
 */
export interface PlannerSendResult {
  whatsapp?: boolean;
  sms?: boolean;
  email?: boolean;
}

/**
 * "Send the payment link again": the open bill goes again on WhatsApp and SMS,
 * never into the app (ADR 0058 §5; Google Play's payments rule). The server keeps
 * the outlet resend's limits (2 minutes apart, 5 a day) and answers 429 past them.
 */
export function useResendPlannerBill() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: () => api.post<PlannerSendResult>('/v1/me/planner/bill/resend'),
    onSettled: () => invalidatePlanner(qc),
  });
}

/** "Start again": after autopay stopped or a charge failed, a fresh approval goes to the phone. */
export function useRestartPlanner() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: () => api.post<PlannerSendResult>('/v1/me/planner/restart'),
    onSettled: () => invalidatePlanner(qc),
  });
}

/**
 * "My pump is open now" (ADR 0058 §7): the same account becomes a Dealer Kavach
 * outlet in setup. On success the profile is read again, so the app stops being a
 * planner's at once, and every cached answer is dropped: the home, the chips, the
 * setup cards and the tabs all change with it.
 */
export function useConvertPlanner() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    retry: false,
    mutationFn: async (input: PlannerConvertInput) => {
      await api.post<unknown>('/v1/me/planner/convert', input);
      // The switch has happened even if this read fails (see onSuccess).
      const user = await api.get<User>('/v1/me').catch(() => null);
      return user;
    },
    onSuccess: (user) => {
      if (user) {
        setUser(user);
      } else {
        // The switch went through but the fresh profile did not arrive: say what the
        // server just did (the dealer is in setup now), rather than keep showing a
        // planner's app to an outlet. The shell's next /me read corrects anything else.
        const current = useAuthStore.getState().user;
        if (current) setUser({ ...current, dealerStatus: 'ONBOARDING' });
      }
      // Not awaited: on a slow link the button should not spin while every screen's
      // answer is fetched again; the screens refetch as they mount.
      void qc.invalidateQueries();
    },
  });
}
