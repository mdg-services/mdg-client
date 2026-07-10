import { useQuery } from '@tanstack/react-query';


import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { StaffWorkItem } from '@dk/shared/types';

export const staffWorkItemsQueryKey = ['staff', 'work-items'] as const;

/**
 * The seeded, global 66-item work catalog (read-only). It changes only when the
 * seed is bumped, so it's cached hard — one fetch per session is plenty.
 */
export function useStaffWorkItems() {
  const token = useAuthStore((s) => s.token);
  return useQuery<StaffWorkItem[]>({
    queryKey: staffWorkItemsQueryKey,
    enabled: !!token,
    staleTime: 24 * 60 * 60 * 1000, // a day — the catalog rarely changes
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: () => api.get<StaffWorkItem[]>('/v1/staff-work-items'),
  });
}
