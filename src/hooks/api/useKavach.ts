import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type {
  Attachment,
  KavachItem,
  KavachProgramme,
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

interface MarkDoneVars {
  itemId: string;
  proof?: Attachment;
  note?: string;
}

/**
 * Mark a Kavach item done. Optimistic: the item is set "done" (status nudged to
 * VALID) and the score is bumped immediately so the dealer sees instant cause
 * and effect; the server response replaces the optimistic item in place. On a
 * flaky network the optimistic change is rolled back so the dealer sees the
 * true state and can tap to retry — never a dead toast.
 */
export function useMarkKavachItemDone() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<KavachItem, ApiError, MarkDoneVars, { previous?: KavachMe | null }>(
    {
      mutationFn: ({ itemId, proof, note }: MarkDoneVars) =>
        api.post<KavachItem>(`/v1/kavach/items/${itemId}/mark-done`, {
          ...(proof ? { proof } : {}),
          ...(note ? { note } : {}),
        }),
      onMutate: async ({ itemId }) => {
        await qc.cancelQueries({ queryKey: kavachMeQueryKey });
        const previous = qc.getQueryData<KavachMe | null>(kavachMeQueryKey);

        qc.setQueryData<KavachMe | null>(kavachMeQueryKey, (old) => {
          if (!old) return old;
          const target = old.items.find((it) => it.id === itemId);
          if (!target) return old;

          const items = old.items.map((it) =>
            it.id === itemId
              ? { ...it, status: 'VALID' as const, lastDoneAt: new Date().toISOString() }
              : it,
          );

          // Nudge the overall score up by the item's share of total points so
          // the health ring visibly ticks forward in the same gesture.
          const wasCounting =
            target.status === 'VALID' || target.status === 'EXPIRING_SOON';
          const total = old.programme.score.totalPoints || 0;
          const gain =
            !wasCounting && total > 0 ? (target.points / total) * 100 : 0;
          const overallPct = Math.min(
            100,
            Math.round((old.programme.score.overallPct + gain) * 10) / 10,
          );

          return {
            ...old,
            items,
            programme: {
              ...old.programme,
              score: { ...old.programme.score, overallPct },
            },
          };
        });

        return { previous };
      },
      onError: (err, _vars, ctx) => {
        // Always roll the optimistic change back so the dealer sees true state.
        if (ctx && ctx.previous !== undefined) {
          qc.setQueryData(kavachMeQueryKey, ctx.previous);
        }
        // A 4xx is a hard, non-retryable rejection (item paused / validation):
        // explain it once and don't leave the dealer tapping a button that
        // will keep failing. Network (status 0) and 5xx are transient, so we
        // keep the in-place tap-to-retry the card already shows — no toast.
        if (err.status >= 400 && err.status < 500) {
          toast.error(err.message);
        }
      },
      onSuccess: (updated) => {
        qc.setQueryData<KavachMe | null>(kavachMeQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((it) => (it.id === updated.id ? updated : it)),
          };
        });
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: kavachMeQueryKey });
      },
    },
  );
}
