import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { invalidatePortalLogins } from '@/hooks/api/usePortalLogins';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { SaveSetupCompanyInput } from '@dk/shared/schemas';
import type { OutletSetupView, SetupBilling } from '@dk/shared/types';

/**
 * Where the signed-in dealer's outlet stands on the way to live service — the
 * one thing every setup card and the strip draw from.
 *
 * A card in the chat is a message, and a message cannot be edited, so no card
 * keeps its own copy of what was true when it was posted: each asks for this,
 * and an old bill card on a paid bill therefore says "paid". The server tells
 * the app when something changed (`outletSetup:changed`, see
 * `useOutletSetupSocket`) and the app asks again when the window comes back to
 * the front, so the cards follow what MDG's team does without a refresh.
 *
 * `active: false` — an outlet from before onboarding v2, or one that is already
 * live — is an answer like any other: the cards and the strip draw nothing.
 */
export const outletSetupKey = ['outlet-setup', 'me'] as const;

export function useOutletSetup({ enabled = true }: { enabled?: boolean } = {}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: outletSetupKey,
    // The dealer app's own route: an admin who happens to sign in here has no outlet.
    enabled: enabled && !!token && role !== 'admin',
    // Long enough that the strip and several cards share one answer.
    staleTime: 30_000,
    // The app's default is "never" (the WebView fires focus on every keyboard
    // open); this view is small and is the thing a dealer comes back to look at.
    refetchOnWindowFocus: true,
    queryFn: () => api.get<OutletSetupView>('/v1/me/setup'),
  });
}

/** Ask the server again — something about the outlet's setup changed. */
export function invalidateOutletSetup(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: outletSetupKey });
}

/**
 * Whether a route's answer is the whole fresh view (so it can go straight into the cache).
 *
 * Nothing here reads `services`, `billingSavedBy`, `company` or `companySavedBy`: a server
 * from before round 3 still sends the first and lacks the second, one from before the
 * company step lacks the last two, and all of them must pass.
 */
function isSetupView(data: unknown): data is OutletSetupView {
  if (!data || typeof data !== 'object') return false;
  const v = data as Partial<OutletSetupView>;
  return typeof v.stage === 'string' && Array.isArray(v.strip) && !!v.payment;
}

/**
 * Take a save's answer: the fresh view when that is what came back, so every
 * card flips at once, otherwise ask for it. The ask is RETURNED, so the save
 * does not report "done" until the new view is in — a card that closed its form
 * on the first would flash the old answer.
 */
function takeAnswer(qc: QueryClient, data: unknown): Promise<unknown> | undefined {
  if (isSetupView(data)) {
    qc.setQueryData(outletSetupKey, data);
    return undefined;
  }
  return qc.invalidateQueries({ queryKey: outletSetupKey });
}

/** Save the bill name, address, state and optional GSTIN. Never retried. */
export function useSaveSetupBilling() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (billing: SetupBilling) => api.put<unknown>('/v1/me/setup/billing', billing),
    onSuccess: (data) => takeAnswer(qc, data),
    onError: () => invalidateOutletSetup(qc),
  });
}

/**
 * Save the oil company the pump is with. Never retried.
 *
 * The company decides which portal logins are asked, so the login box is asked
 * again with the setup view: a company changed from Indian Oil to BPCL swaps
 * the SDMS and IRAS rows for the BPCL one.
 */
export function useSaveSetupCompany() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: SaveSetupCompanyInput) => api.put<unknown>('/v1/me/setup/company', input),
    onSuccess: (data) => {
      invalidatePortalLogins(qc);
      return takeAnswer(qc, data);
    },
    onError: () => invalidateOutletSetup(qc),
  });
}
