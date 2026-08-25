import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type {
  KavachItem,
  KavachProgramme,
  SubmitKavachEvidenceInput,
} from '@dk/shared/types';

export interface KavachMe {
  programme: KavachProgramme;
  items: KavachItem[];
}

export const kavachMeQueryKey = ['kavach', 'me'] as const;

/**
 * The caller's own Kavach programme + items. Members prefer this over the
 * dealer-scoped items endpoint (spec §3 — "prefer /kavach/me").
 */
export function useKavachMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery<KavachMe | null>({
    queryKey: kavachMeQueryKey,
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await api.get<KavachMe>('/v1/kavach/me');
      } catch (err) {
        // No programme initiated yet for this dealer — treat as a calm,
        // not-yet-started state rather than an error screen.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export interface SubmitEvidenceVars extends SubmitKavachEvidenceInput {
  itemId: string;
}

/**
 * The dealer sends something towards one task — a photo, a note, or nothing.
 *
 * An EMPTY body is the unprompted claim ("I've done this"): it queues the task
 * for an admin to look at and moves neither the score nor the clock. There is
 * no `/mark-done` counterpart any more; that route is gone and `/verify` 403s
 * for a dealer token.
 *
 * Deliberately NOT optimistic. The old version nudged `overallPct` up by the
 * item's share of the total the instant the dealer tapped, which was defensible
 * while the tap WAS the completion. It no longer is: the number moves when an
 * admin rules, which may be tomorrow, and a ring that ticks forward and then
 * falls back on the next refetch is precisely the "the app lied to me" moment
 * this model exists to remove. The server's own answer replaces the item; we
 * predict nothing.
 */
export function useSubmitKavachEvidence() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation<KavachItem, ApiError, SubmitEvidenceVars>({
    mutationFn: ({ itemId, proof, note }: SubmitEvidenceVars) =>
      api.post<KavachItem>(`/v1/kavach/items/${itemId}/evidence`, {
        ...(proof ? { proof } : {}),
        ...(note ? { note } : {}),
      }),
    onSuccess: (updated) => {
      qc.setQueryData<KavachMe | null>(kavachMeQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((it) => (it.id === updated.id ? updated : it)),
        };
      });
    },
    onError: (err) => {
      // A 4xx is a hard, non-retryable rejection (task paused, programme off):
      // say it once, in our words, never the server's. Network (status 0) and
      // 5xx are transient, so the card's own tap-to-retry stays the answer and
      // a toast on top of it would just be noise.
      if (err.status >= 400 && err.status < 500) toast.error(t('kavach.sendFailed'));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: kavachMeQueryKey });
    },
  });
}
