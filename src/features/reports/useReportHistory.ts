import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ReportHistoryPage, ReportKind, ReportSummary, TodayReport } from '@dk/shared/types';

/**
 * Cache key of the Reports list; the kinds (and a page size, when one is asked for) are part of it, so
 * each chip keeps its own pages. With no `limit` the key is the one older callers know.
 */
export const reportHistoryKey = (kinds?: readonly ReportKind[], limit?: number) =>
  [
    'report-history',
    kinds && kinds.length > 0 ? [...kinds].sort().join(',') : 'all',
    ...(limit !== undefined ? [limit] : []),
  ] as const;

/** One page: `GET /v1/me/reports?cursor=&kinds=&limit=`. `limit` (1 to 40) is left out when not given: the server's page is 40. */
export const fetchReportHistory = (cursor: string | undefined, kinds?: readonly ReportKind[], limit?: number) =>
  api.get<ReportHistoryPage>('/v1/me/reports', {
    ...(cursor ? { cursor } : {}),
    ...(kinds && kinds.length > 0 ? { kinds: kinds.join(',') } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });

/**
 * The Reports list: the last 30 days, newest first, 40 to a page (or `limit`), as an infinite list. The
 * server's `nextCursor` is the page parameter and the last page has none. A family chip is
 * `kinds={kindsOfGroup(group)}`; no kinds is every report. `enabled: false` asks for nothing (the page
 * has decided there is nothing to ask for, for instance no report needs a look).
 */
export function useReportHistory(kinds?: readonly ReportKind[], options: { limit?: number; enabled?: boolean } = {}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useInfiniteQuery({
    queryKey: reportHistoryKey(kinds, options.limit),
    enabled: !!token && role !== 'admin' && options.enabled !== false,
    staleTime: 20_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchReportHistory(pageParam, kinds, options.limit),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Days the 30-day picture covers. */
export const SUMMARY_DAYS = 30;

/** `GET /v1/me/reports/summary?days=30`: counts and business days per kind, from message tags only. */
export const fetchReportSummary = (days: number = SUMMARY_DAYS) =>
  api.get<ReportSummary>('/v1/me/reports/summary', { days });

/**
 * The 30-day picture behind the Reports pill's top card. An older server has no such route, and a slow
 * phone may not get it: the query never retries and the page draws NO card until it answers (a card made
 * of guesses would say "nothing needed a look" over reports it never counted). Its data is
 * `undefined` until then, and again after an error.
 */
export function useReportSummary(days: number = SUMMARY_DAYS) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: reportSummaryKey(days),
    enabled: !!token && role !== 'admin',
    staleTime: 60_000,
    retry: false,
    queryFn: () => fetchReportSummary(days),
  });
}

export const reportSummaryKey = (days: number = SUMMARY_DAYS) => ['report-summary', days] as const;

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
  void qc.invalidateQueries({ queryKey: ['report-summary'] });
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
