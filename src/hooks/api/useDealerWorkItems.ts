import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { EffectiveWorkItem } from '@dk/shared/types';


/** Query key for a dealer's effective work list (defaults − hidden + custom). */
export function dealerWorkItemsQueryKey(dealerId: string | undefined) {
  return ['staff', 'work-items', dealerId] as const;
}

/**
 * The dealer's EFFECTIVE work list — the global active catalog minus the codes
 * this dealer hid, plus their custom items. This is what the award picker and
 * the pending-submission panel resolve against (not the raw global catalog), so
 * hidden/custom work stays consistent with what the server will accept on
 * finalize. Cached hard: the list changes only when the dealer edits it.
 */
export function useDealerWorkItems(dealerId: string | undefined) {
  return useQuery<EffectiveWorkItem[]>({
    queryKey: dealerWorkItemsQueryKey(dealerId),
    enabled: !!dealerId,
    staleTime: 24 * 60 * 60 * 1000, // a day — the effective list rarely changes
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: () =>
      api.get<EffectiveWorkItem[]>(`/v1/dealers/${dealerId}/work-items`),
  });
}
