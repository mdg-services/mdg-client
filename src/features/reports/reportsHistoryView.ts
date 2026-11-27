import type { TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { reportDataOf } from '@dk/shared';
import type { ReportData, ReportKind, TodayReport } from '@dk/shared/types';

import { viewOfData } from './registry';
import { dayWords, istDayOf } from './reportView';
import { statusFromTag } from './StatusBadge';
import type { ReportStatusKey } from './types';

/**
 * What the Reports tab's list says about each row (ADR 0056 §4), as plain functions so the
 * rules are pinned by tests and the screen only draws.
 */

/**
 * Reports of which MDG sends one a day, the newest standing for the day. When two of one kind
 * are on the same business day the older one is "Replaced". Every other kind (a tanker's
 * receipt, a density, an order, a declaration) is one report per thing, and two of them on a
 * day are two different reports, so they are never called replaced here: the overlay itself
 * knows better (it asks the server for a newer one of the same key).
 */
const ONE_A_DAY: ReadonlySet<ReportKind> = new Set<ReportKind>([
  'dsr_sales',
  'dsr_variation',
  'water_ingress',
  'credit_dod',
  'ledger_watch',
  'load_plan',
]);

export interface HistoryRow {
  report: TodayReport;
  /** A newer report of the same kind is for the same business day. */
  replaced: boolean;
  /** The sender corrected a figure after sharing (a revised DSR). */
  corrected: boolean;
  /** Sent before snapshots: opens as the old picture. */
  picture: boolean;
}

export interface HistoryGroup {
  /** The Indian calendar day the rows were sent on. */
  day: string;
  /** "Today", "Yesterday", "Sun 22 Nov". */
  heading: string;
  rows: HistoryRow[];
}

/** A row's snapshot, when it has one this app can read (right version, right kind). */
export function dataOfRow(report: TodayReport): ReportData | undefined {
  return reportDataOf(report.data, report.kind);
}

function isCorrected(data: ReportData | undefined): boolean {
  return (data?.kind === 'dsr_sales' || data?.kind === 'dsr_variation') && data.revised === true;
}

/** The loaded rows (newest first) as dated groups, each row marked. */
export function groupHistory(items: readonly TodayReport[], now: Date, lang: Lang, t: TFunction): HistoryGroup[] {
  const today = istDayOf(now);
  const yesterday = istDayOf(new Date(now.getTime() - 86_400_000));
  const seen = new Set<string>();
  const groups: HistoryGroup[] = [];
  for (const report of items) {
    const sentDay = istDayOf(report.sentAt);
    const oneADay = ONE_A_DAY.has(report.kind) && !!report.day;
    const slot = oneADay ? `${report.kind}|${report.day}` : '';
    const replaced = oneADay && seen.has(slot);
    if (oneADay) seen.add(slot);
    const data = dataOfRow(report);
    const row: HistoryRow = {
      report,
      replaced,
      corrected: isCorrected(data),
      picture: !data && report.attachments.length > 0,
    };
    let group = groups[groups.length - 1];
    if (!group || group.day !== sentDay) {
      group = {
        day: sentDay,
        heading:
          sentDay === today
            ? t('today.dayToday')
            : sentDay === yesterday
              ? t('today.dayYesterday')
              : dayWords(sentDay, lang),
        rows: [],
      };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/** How a row stands: the kind's own verdict first, then the report's tag. */
export function rowStatus(report: TodayReport, lang: Lang): ReportStatusKey {
  const data = dataOfRow(report);
  if (data) {
    const alert = viewOfData(data).alert(data as never, lang);
    if (alert) return alert.severity;
  }
  return statusFromTag(report.status);
}

/** The one plain line under a row's name: the kind's headline, or the message's own words for an old report. */
export function rowHeadline(report: TodayReport, lang: Lang): string {
  const data = dataOfRow(report);
  if (data) {
    const line = viewOfData(data).headline(data as never, lang);
    if (line) return line;
  }
  return report.headline;
}
