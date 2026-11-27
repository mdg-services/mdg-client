import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ReportHistoryPage, ReportKind, TodayReport } from '@dk/shared/types';

/** A service page shows its reports ten at a time (spec 4.3.6). */
export const SERVICE_PAGE_SIZE = 10;

/**
 * "Last 30 days" of one service: `GET /v1/me/reports?kinds=<its kinds>&limit=10`, newest first, with
 * "Show 10 more" walking the cursor. The key starts with `report-history`, so a report arriving over
 * the socket (`invalidateReports`) refreshes it with every other list. A server from before `limit`
 * ignores it and sends its usual page: the list then simply shows more at once, and still continues.
 */
export function useServiceHistory(serviceId: string, kinds: readonly ReportKind[]) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const kindList = [...kinds].sort().join(',');
  return useInfiniteQuery({
    queryKey: ['report-history', 'service', serviceId, kindList],
    enabled: !!token && role !== 'admin' && kinds.length > 0,
    staleTime: 20_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<ReportHistoryPage>('/v1/me/reports', {
        kinds: kindList,
        limit: SERVICE_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) =>
      last && typeof last.nextCursor === 'string' ? last.nextCursor : undefined,
  });
}

/** Every loaded row, each report once, in the order the server sent (newest first). */
export function loadedReports(pages: ReadonlyArray<ReportHistoryPage> | undefined): TodayReport[] {
  const seen = new Set<string>();
  const out: TodayReport[] = [];
  for (const page of pages ?? []) {
    for (const item of Array.isArray(page?.items) ? page.items : []) {
      if (seen.has(item.messageId)) continue;
      seen.add(item.messageId);
      out.push(item);
    }
  }
  return out;
}
