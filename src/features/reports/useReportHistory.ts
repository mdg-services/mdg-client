import { useInfiniteQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ReportHistoryPage, ReportKind, TodayReport } from '@dk/shared/types';

/** Cache key of the Reports tab's list; the kinds are part of it, so each chip keeps its own pages. */
export const reportHistoryKey = (kinds?: readonly ReportKind[]) =>
  ['report-history', kinds && kinds.length > 0 ? [...kinds].sort().join(',') : 'all'] as const;

/** One page: `GET /v1/me/reports?cursor=&kinds=`. */
export const fetchReportHistory = (cursor: string | undefined, kinds?: readonly ReportKind[]) =>
  api.get<ReportHistoryPage>('/v1/me/reports', {
    ...(cursor ? { cursor } : {}),
    ...(kinds && kinds.length > 0 ? { kinds: kinds.join(',') } : {}),
  });

/**
 * The Reports tab: the last 30 days, newest first, 40 to a page, as an infinite list. The
 * server's `nextCursor` is the page parameter and the last page has none. A family chip is
 * `kinds={kindsOfGroup(group)}`; no kinds is every report.
 */
export function useReportHistory(kinds?: readonly ReportKind[]) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useInfiniteQuery({
    queryKey: reportHistoryKey(kinds),
    enabled: !!token && role !== 'admin',
    staleTime: 20_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchReportHistory(pageParam, kinds),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Every loaded row of an infinite history, in order, each report once. */
export function historyItems(pages: ReadonlyArray<ReportHistoryPage> | undefined): TodayReport[] {
  const seen = new Set<string>();
  const out: TodayReport[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.messageId)) continue;
      seen.add(item.messageId);
      out.push(item);
    }
  }
  return out;
}

/** A report arrived or changed: the open overlays and every history list are out of date. */
export function invalidateReports(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['report'] });
  void qc.invalidateQueries({ queryKey: ['report-history'] });
}

const REFRESH_WINDOW_MS = 1500;
const refreshGate = new WeakMap<QueryClient, { timer: ReturnType<typeof setTimeout> | undefined; again: boolean }>();

/**
 * {@link invalidateReports} for the chat's sockets (a message arrived or was deleted, a chat
 * changed, the socket came back): the report open on screen asks the server again (so its
 * "newer report" and "removed" banners can appear) and the Reports tab gains or loses its rows.
 * Bursts are folded as the Today feed's are: the first call goes through at once, the rest within
 * the next second and a half become ONE more, so a busy afternoon is not a read per message over
 * what may be a 2G link. Only what is on screen is fetched; the rest is only marked out of date.
 */
export function invalidateReportsSoon(qc: QueryClient): void {
  let gate = refreshGate.get(qc);
  if (!gate) {
    gate = { timer: undefined, again: false };
    refreshGate.set(qc, gate);
  }
  if (gate.timer !== undefined) {
    gate.again = true;
    return;
  }
  invalidateReports(qc);
  const g = gate;
  g.timer = setTimeout(() => {
    g.timer = undefined;
    if (g.again) {
      g.again = false;
      invalidateReportsSoon(qc);
    }
  }, REFRESH_WINDOW_MS);
}
