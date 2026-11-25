import { getKindView } from '@/features/reports/registry';
import type { KindAlert, KindTile } from '@/features/reports/types';
import type { Lang } from '@/store/lang';
import { AGING_REPORT_KINDS, OWNER_ONLY_REPORT_KINDS } from '@dk/shared';
import type { ReportData, ReportKind, TodayFeed, TodayReport } from '@dk/shared/types';

import {
  ALERT_PER_REPORT_KINDS,
  TILE_SLOTS,
  dayOf,
  newestFirst,
  salesSheetOf,
  taskCoversReport,
  usableData,
  type TileItem,
} from './todayView';

/**
 * The part of the Today page that asks each report kind what it has to say (ADR 0056):
 * the alert a kind raises, the tile it draws, its one plain line. Kept apart from
 * `todayView.ts` so the small decisions there (the lists, the days, the paths) can be used without
 * loading every kind's drawing.
 *
 * A kind's own functions run inside `safely`: a bad snapshot costs that one card, never
 * the page.
 */

function safely<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function tileOf(data: ReportData, lang: Lang): KindTile | null {
  const view = getKindView(data.kind);
  return safely(() => view.tile(data as never, lang));
}

function alertOf(data: ReportData, lang: Lang): KindAlert | null {
  const view = getKindView(data.kind);
  return safely(() => view.alert(data as never, lang));
}

/** The one plain line a kind gives a report; the team's own words when there is no snapshot. */
export function headlineOf(report: TodayReport, data: ReportData | undefined, lang: Lang): string {
  if (!data) return report.headline;
  const view = getKindView(data.kind);
  const line = safely(() => view.headline(data as never, lang));
  return line?.trim() ? line : report.headline;
}

/**
 * An old alarm the server has already let go (ADR 0055 §5): for these kinds nothing ever sends
 * an "all clear" card, so the server turns the card's status from "needs a look" to plain
 * information once its day is before yesterday. The frozen snapshot still says what it said
 * on the day, so the page must read the status first: an aged alarm raises no card, claims
 * no work as "covered", and its tile wears no warning.
 */
export function isAgedOut(report: Pick<TodayReport, 'kind' | 'status'>): boolean {
  return AGING_REPORT_KINDS.has(report.kind) && report.status === 'info';
}

// ── Needs a look ────────────────────────────────────────────────────────────

export interface AlertItem {
  report: TodayReport;
  headline: string;
  line: string;
  severity: 'problem' | 'attention';
  /** The kind's own tie-breaker inside a severity (an excess before a shortage). */
  weight: number;
  /** True when the words are the team's own (an older report with no snapshot). */
  fromWords: boolean;
}

/**
 * The cards under "Needs a look": the newest report of each kind (each report, for the kinds that
 * are about one vehicle or order), asked for its alert, unless the server has aged it out.
 * Problems come before attention; newest first inside each. A report without a snapshot
 * that was marked "needs a look" still gets a card, in the team's own words, so an old
 * warning is never swallowed by the new layout.
 */
export function buildAlerts(
  feed: TodayFeed,
  lang: Lang,
  isOwner: boolean,
  kindName: (kind: ReportKind) => string,
): AlertItem[] {
  return buildAlertsAndCovered(feed, lang, isOwner, kindName).items;
}

/**
 * {@link buildAlerts}, and the ids of the reports whose alert was left out because the same work is
 * already a card under "Your work" (`taskCoversReport`). The page keeps those out of the earlier
 * reports too, so the same thing is never listed twice anywhere on it.
 */
export function buildAlertsAndCovered(
  feed: TodayFeed,
  lang: Lang,
  isOwner: boolean,
  kindName: (kind: ReportKind) => string,
): { items: AlertItem[]; covered: Set<string> } {
  // The newest report of each kind. The feed already keeps the newest of each (kind, key), so a
  // kind that is about one vehicle or one order is listed report by report: a shortage on
  // Tuesday's tanker must not vanish behind a clean receipt on Wednesday's.
  const newestOfKind = new Map<string, TodayReport>();
  for (const r of newestFirst(feed.reports)) {
    if (!isOwner && OWNER_ONLY_REPORT_KINDS.has(r.kind)) continue;
    const id = ALERT_PER_REPORT_KINDS.has(r.kind) ? `${r.kind}|${r.messageId}` : r.kind;
    if (!newestOfKind.has(id)) newestOfKind.set(id, r);
  }
  const items: AlertItem[] = [];
  const covered = new Set<string>();
  for (const report of newestOfKind.values()) {
    if (isAgedOut(report)) continue;
    if (taskCoversReport(feed.tasks, report.kind)) {
      // Only a report that WOULD have knocked is "covered"; a quiet one is just an ordinary row.
      const data = usableData(report, isOwner);
      const wouldKnock = data ? alertOf(data, lang) !== null : report.status === 'attention';
      if (wouldKnock) covered.add(report.messageId);
      continue;
    }
    const data = usableData(report, isOwner);
    if (data) {
      const a = alertOf(data, lang);
      if (a) items.push({ report, headline: a.headline, line: a.line, severity: a.severity, weight: a.weight ?? 0, fromWords: false });
    } else if (report.status === 'attention') {
      items.push({
        report,
        headline: kindName(report.kind),
        line: report.headline,
        severity: 'attention',
        weight: 0,
        fromWords: true,
      });
    }
  }
  // Stable: problems first, then the kind's own weight, and the newest-first order above holds inside both.
  const rank = (s: AlertItem['severity']) => (s === 'problem' ? 0 : 1);
  return {
    items: items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => rank(a.item.severity) - rank(b.item.severity) || b.item.weight - a.item.weight || a.i - b.i)
      .map((x) => x.item),
    covered,
  };
}

// ── Your pump today ─────────────────────────────────────────────────────────

interface Candidate {
  report: TodayReport;
  data: ReportData;
}

/** The tiles the feed can fill, in the fixed order. A tile exists only for a report that has a snapshot. */
export function buildTiles(feed: TodayFeed, lang: Lang, isOwner: boolean): TileItem[] {
  const all = [...feed.reports, ...feed.done];
  const items: TileItem[] = [];
  for (const slot of TILE_SLOTS) {
    if (slot.ownerOnly && !isOwner) continue;
    const candidates: Candidate[] = [];
    for (const report of all) {
      if (slot.kinds.includes(report.kind)) {
        const data = usableData(report, isOwner);
        if (data) candidates.push({ report, data });
      } else if (slot.id === 'sales' && report.kind === 'dsr_variation') {
        // A message holding both DSR sheets is tagged as the variation: read the sales sheet out of it.
        const sheet = salesSheetOf(usableData(report, isOwner));
        if (sheet) candidates.push({ report: { ...report, kind: 'dsr_sales', data: sheet }, data: sheet });
      }
    }
    // Newest business day first, then the newest message.
    candidates.sort(
      (a, b) =>
        dayOf(b.report, b.data).localeCompare(dayOf(a.report, a.data)) ||
        b.report.sentAt.localeCompare(a.report.sentAt),
    );
    for (const c of candidates) {
      const drawn = tileOf(c.data, lang);
      if (drawn) {
        // An aged alarm keeps its figure but loses its warning.
        const tile = isAgedOut(c.report) && (drawn.status === 'problem' || drawn.status === 'attention') ? { ...drawn, status: 'ok' as const } : drawn;
        items.push({ slot, report: c.report, kind: c.data.kind, tile, day: dayOf(c.report, c.data) });
        break;
      }
    }
  }
  return items;
}
