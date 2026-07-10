import { useQuery } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { DealerRecord, RecordType } from '@dk/shared/types';

export const recordsQueryKey = (type?: RecordType) =>
  type ? (['records', { type }] as const) : (['records'] as const);

export function useRecords(type?: RecordType) {
  const token = useAuthStore((s) => s.token);
  return useQuery<DealerRecord[]>({
    queryKey: recordsQueryKey(type),
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await api.get<DealerRecord[]>('/v1/records', { type });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return [];
        throw err;
      }
    },
  });
}

export function useRecord(id: string | undefined) {
  const token = useAuthStore((s) => s.token);
  return useQuery<DealerRecord>({
    queryKey: ['record', id],
    enabled: !!token && !!id,
    queryFn: () => api.get<DealerRecord>(`/v1/records/${id}`),
  });
}
