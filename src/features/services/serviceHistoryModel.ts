import { rowHeadline, rowStatus } from '@/features/reports/reportsHistoryView';
import type { ReportStatusKey } from '@/features/reports/types';
import { dayOf, usableData } from '@/features/today/todayView';
import { indiaDay } from '@/lib/fmt';
import type { Lang } from '@/store/lang';
import type { ReportKind, TodayReport } from '@dk/shared/types';

import { readable } from './servicesModel';

/**
 * The "Last 30 days" list of a service page and its day strip, as plain functions (spec 4.3.6).
 * Days are BUSINESS days (`TodayReport.day`), not the day a message was sent: a sales report sent at
 * 12:20 am for yesterday is yesterday's.
 */

export interface HistoryItem {
  report: TodayReport;
  /** The business day the report is about. */
  day: string;
  status: ReportStatusKey;
  headline: string;
  /** A figure was changed after it was first shared (a DSR sent again). */
  corrected: boolean;
}

/** Both DSR sheets are one thing a day; every other kind is its own. */
function slotKind(kind: ReportKind): string {
  return kind === 'dsr_sales' || kind === 'dsr_variation' ? 'dsr' : kind;
}

/** Services of which MDG sends one report a day: two on one day are a report and its replacement. */
const ONE_A_DAY = new Set([
  'dsr-report',
  'water-ingress-testing',
  'credit-dod-monitoring',
  'load-planner',
]);

/**
 * The rows to draw, newest business day first. For a once-a-day service an older copy of the same day
 * is a replaced one and is left out. A manager never gets an owner-only kind, whatever came.
 */
export function historyItems(
  reports: readonly TodayReport[],
  opts: { serviceId: string; isOwner: boolean; lang: Lang },
): HistoryItem[] {
  const out: HistoryItem[] = [];
  const seen = new Set<string>();
  const sorted = [...readable(reports, opts.isOwner)].sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt),
  );
  for (const report of sorted) {
    const data = usableData(report, opts.isOwner);
    const day = dayOf(report, data);
    if (ONE_A_DAY.has(opts.serviceId)) {
      const slot = `${slotKind(report.kind)}|${day}`;
      if (seen.has(slot)) continue;
      seen.add(slot);
    }
    out.push({
      report,
      day,
      status: rowStatus(report, opts.lang),
      headline: rowHeadline(report, opts.lang),
      corrected:
        (data?.kind === 'dsr_sales' || data?.kind === 'dsr_variation') && data.revised === true,
    });
  }
  return out.sort(
    (a, b) => b.day.localeCompare(a.day) || b.report.sentAt.localeCompare(a.report.sentAt),
  );
}

// ── the day strip ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** `day` moved by `n` calendar days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The services whose absence of a day means something: a report is expected every day. */
export const STRIP_SERVICES: Readonly<Record<string, 'dsr' | 'water' | 'credit' | 'plan'>> = {
  'dsr-report': 'dsr',
  'water-ingress-testing': 'water',
  'credit-dod-monitoring': 'credit',
  'load-planner': 'plan',
};

export interface StripDay {
  day: string;
  /**
   * `came`, `look` (came and needs a look), `none` (a past day with no report), `wait` (today, whose
   * report has not come yet: not a missing one).
   */
  state: 'came' | 'none' | 'look' | 'wait';
  /** The newest report of that day, for a tap. */
  report?: TodayReport;
}

/**
 * Up to 14 days, oldest first, ending TODAY: some services (the load plan, the water checks) report on
 * the day itself, and a strip that stopped at yesterday drew today's report as "none". Today with no
 * report yet is `wait`, a state of its own, never a missing report. When more pages are still to load, the strip starts at the oldest loaded day: a day older than what
 * was loaded is not drawn as "no report", because nobody has looked there. A day with a report that
 * says "look" wears the triangle.
 */
export function stripDays(items: readonly HistoryItem[], now: Date, hasMore: boolean): StripDay[] {
  const today = indiaDay(now);
  const end = today;
  let start = addDays(end, -13);
  if (hasMore && items.length > 0) {
    const oldest = items.reduce((m, i) => (i.day < m ? i.day : m), items[0]!.day);
    if (oldest > start) start = oldest;
  }
  const byDay = new Map<string, HistoryItem[]>();
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);
  const days: StripDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const here = byDay.get(d);
    if (!here) {
      days.push({ day: d, state: d === today ? 'wait' : 'none' });
      continue;
    }
    const look = here.some((i) => i.status === 'attention' || i.status === 'problem');
    days.push({ day: d, state: look ? 'look' : 'came', report: here[0]!.report });
  }
  return days;
}
