import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useT } from '@/lib/i18n';
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

/**
 * Open a stored report, on a link signed a second ago.
 *
 * The URL on a record in the list was signed when the list was fetched and is
 * good for 900 seconds. A dealer who opens Reports, is called away, and comes
 * back to tap a row was handed off to Chrome and shown a page of XML beginning
 * "AccessDenied — Request has expired" — outside the app, with no way back but
 * the phone's Back key, and nothing telling them the report is perfectly fine.
 *
 * So the row presigns at the moment it is tapped. The `window.open` after an
 * await is the same shape the attachment download already uses, and the shell's
 * navigation gate hands the URL to the browser either way.
 */
export function useOpenRecord(): (recordId: string) => Promise<void> {
  const t = useT();
  const toast = useToast();
  return React.useCallback(
    async (recordId: string) => {
      try {
        const rec = await api.get<DealerRecord>(`/v1/records/${recordId}`);
        const url = rec.attachment?.url;
        if (!url) throw new Error('no url');
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        toast.error(t('common.loadFailed'));
      }
    },
    [t, toast],
  );
}
