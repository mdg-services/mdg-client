import { useQuery } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ReportDetail, TodayReport } from '@dk/shared/types';

/** Cache key of one opened report (ADR 0056). */
export const reportKey = (messageId: string) => ['report', messageId] as const;

/** The one call behind the overlay: `GET /v1/me/reports/:messageId`. */
export const fetchReport = (messageId: string) =>
  api.get<ReportDetail>(`/v1/me/reports/${encodeURIComponent(messageId)}`);

/**
 * Why a report would not open, in the words the overlay's banner needs:
 *  - `gone`           410: the team removed the message, or it never existed
 *  - `not_available`  404: not in any of the person's chats, not a report, or the owner's alone
 *  - `offline`        the request never got an answer (no network, a stalled link)
 *  - `other`          anything else
 */
export type ReportLoadProblem = 'gone' | 'not_available' | 'offline' | 'other';

export function reportLoadProblem(err: unknown): ReportLoadProblem {
  if (err instanceof ApiError) {
    if (err.status === 410) return 'gone';
    if (err.status === 404) return 'not_available';
    if (err.status === 0 || err.code === 'TIMEOUT' || err.code === 'NETWORK') return 'offline';
    return 'other';
  }
  // `fetch` itself failing (no network) is a TypeError, not an ApiError.
  return err instanceof TypeError ? 'offline' : 'other';
}

/** Never retried: 404 and 410 are answers, not hiccups. A stalled link is retried twice. */
function retryReport(failures: number, err: unknown): boolean {
  const problem = reportLoadProblem(err);
  if (problem === 'gone' || problem === 'not_available') return false;
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return failures < 2;
}

/**
 * A feed or history row as the overlay's first frame, while the server answers. The
 * snapshot on it is already everything the overlay draws; the server adds the live state
 * ("a newer report", "corrected"), so the first frame says nothing about those.
 */
export function placeholderDetail(row: TodayReport): ReportDetail {
  return { ...row, live: {} };
}

/**
 * One report for the overlay: the tag, the snapshot, the signed pictures of an old
 * picture message, and what the server knows now. It never reads the Today feed.
 *
 * `placeholder` is a row the caller already holds (a tile, an alert, a history row); it is
 * drawn at once and replaced by the server's copy. It is NOT `initialData`: that would
 * count as fresh and the live banners would never be asked for.
 */
export function useReport(messageId: string | undefined, opts: { placeholder?: TodayReport } = {}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: reportKey(messageId ?? 'none'),
    // The dealer app's own route: an admin who signs in here has no outlet.
    enabled: !!token && role !== 'admin' && !!messageId,
    // A newer report or a correction can arrive while the overlay is open: the sockets mark it stale.
    staleTime: 30_000,
    retry: retryReport,
    placeholderData: opts.placeholder ? placeholderDetail(opts.placeholder) : undefined,
    queryFn: () => fetchReport(messageId!),
  });
}
