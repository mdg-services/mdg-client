import { EXPECTED_BY } from '@/features/glance/glanceModel';
import { fuelName } from '@/features/reports/kinds/dsr_sales/fmt';
import { fmtDay, fmtInt, fmtLitres, fmtWeekday, indiaDay } from '@/lib/fmt';
import { translate, type TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { OWNER_ONLY_REPORT_KINDS, reportDataOf } from '@dk/shared';
import type { ReportData, ReportKind, ReportSummary, TodayReport } from '@dk/shared/types';

import { viewOfData } from './registry';
import { istDayOf } from './reportView';
import { reportVerdict } from './StatusBadge';
import type { ReportStatusKey } from './types';

/**
 * What the Reports pill says about its list and its 30-day card (spec 4.2), as plain functions so the
 * rules are pinned by tests and the screen only draws.
 *
 * The list is grouped by the BUSINESS day a report is about (`TodayReport.day`), not the day it was
 * sent: a sales report sent at 12:20 am for yesterday sits under yesterday.
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

/**
 * A line under a row that says what changed since the last one of its kind. An arrow (`up`, `down`,
 * `same`) is used only where "up" is good and the words say more or less (sales against last week).
 * Where up is not good (a shortage that grew) the line says `worse` or `better` in words, drawn with a
 * triangle or a tick; `plain` is a fact with no direction in it (credit used went from 64% to 71%).
 */
export interface ChangeLine {
  dir: 'up' | 'down' | 'same' | 'worse' | 'better' | 'plain';
  text: string;
}

export interface HistoryRow {
  report: TodayReport;
  /** The business day the report is about (`YYYY-MM-DD`). */
  day: string;
  /** A newer report of the same kind is for the same business day. */
  replaced: boolean;
  /** The sender corrected a figure after sharing (a revised DSR). */
  corrected: boolean;
  /** Sent before snapshots: opens as the old picture. */
  picture: boolean;
  /** Sent after the reader last looked at this list. Never true on a first visit (nothing to compare with). */
  isNew: boolean;
  /** What changed against the report before it, when the loaded list holds one to compare with. */
  change: ChangeLine | null;
}

export interface HistoryGroup {
  /** The business day the rows are about. */
  day: string;
  /** "Today", "Yesterday", "Tue 24 Nov". */
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

const PLAIN_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The business day a report is about: its own `day`, else the India day it was sent. */
export function businessDayOf(report: Pick<TodayReport, 'day' | 'sentAt'>): string {
  return report.day && PLAIN_DAY.test(report.day) ? report.day : istDayOf(report.sentAt);
}

/** "Today", "Yesterday", or the date ("Tue 24 Nov", "मंगल 24 नवंबर"), on the dealer's India clock. */
export function dayHeading(day: string, now: Date, lang: Lang, t: TFunction): string {
  const today = indiaDay(now);
  if (day === today) return t('rep.day.today');
  if (day === indiaDay(new Date(now.getTime() - 86_400_000))) return t('rep.day.yesterday');
  return fmtDay(day, lang, now);
}

/**
 * How a row stands: the kind's own verdict first, then the report's tag. An old alarm of the kinds the
 * server ages out (`AGING_REPORT_KINDS`, status turned to plain information once the day has passed) is
 * information here too, so a day-old water check never says "Needs a look" beside one that is current.
 */
export function rowStatus(report: TodayReport, lang: Lang): ReportStatusKey {
  const data = dataOfRow(report);
  return reportVerdict(report, data ? viewOfData(data).alert(data as never, lang) : null);
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

/** Does the row ask the reader to look? A report standing in for an older one of its day does not. */
export function needsLook(row: Pick<HistoryRow, 'report' | 'replaced'>, lang: Lang): boolean {
  if (row.replaced) return false;
  const s = rowStatus(row.report, lang);
  return s === 'attention' || s === 'problem';
}

// ── change against the last one ─────────────────────────────────────────────

type SalesData = Extract<ReportData, { kind: 'dsr_sales' | 'dsr_variation' }>;

/** "Diesel: 6% more than last Monday", from the snapshot's own same-weekday-last-week figure. */
function salesChange(data: SalesData, lang: Lang): ChangeLine | null {
  let best: { key: string; sold: number; last: number; lastDay: string } | null = null;
  for (const p of data.products ?? []) {
    const s = 'sales' in p ? p.sales : undefined;
    if (!s || s.state !== 'closed' || s.soldL === null) continue;
    const last = s.sameWeekdayLastWeek;
    if (!last || !(last.soldL > 0)) continue;
    if (!best || s.soldL > best.sold) best = { key: p.key, sold: s.soldL, last: last.soldL, lastDay: last.day };
  }
  if (!best) return null;
  const pct = Math.round(((best.sold - best.last) / best.last) * 100);
  const against = translate(lang, 'rep.change.lastWeekday', { weekday: fmtWeekday(best.lastDay, lang) });
  const dir = pct === 0 ? 'same' : pct > 0 ? 'up' : 'down';
  const change =
    dir === 'same'
      ? translate(lang, 'kit.delta.same', { against })
      : translate(lang, dir === 'up' ? 'kit.delta.up' : 'kit.delta.down', {
          amount: `${fmtInt(Math.abs(pct), lang)}%`,
          against,
        });
  return { dir, text: translate(lang, 'rep.change.fuelLine', { fuel: fuelName(best.key, lang), change }) };
}

function litresPhrase(v: number, lang: Lang): string {
  if (v < 0) return translate(lang, 'rep.change.short', { litres: fmtLitres(-v, lang) });
  if (v > 0) return translate(lang, 'rep.change.extra', { litres: fmtLitres(v, lang) });
  return fmtLitres(0, lang);
}

/** "Diesel: 310 L short, was 120 L short before": the fuel that is furthest from zero, against the last report. */
function variationChange(data: ReportData, before: ReportData | undefined, lang: Lang): ChangeLine | null {
  if (data.kind !== 'dsr_variation' || before?.kind !== 'dsr_variation') return null;
  let best: { key: string; now: number; was: number } | null = null;
  for (const p of data.products ?? []) {
    const was = (before.products ?? []).find((q) => q.key === p.key)?.variation?.variationL;
    if (was === undefined || p.variation?.variationL === undefined) continue;
    if (!best || Math.abs(p.variation.variationL) > Math.abs(best.now)) {
      best = { key: p.key, now: p.variation.variationL, was };
    }
  }
  if (!best || Math.round(best.now) === Math.round(best.was)) return null;
  const worse = Math.abs(best.now) > Math.abs(best.was);
  return {
    dir: worse ? 'worse' : 'better',
    text: translate(lang, worse ? 'rep.change.variationWorse' : 'rep.change.variationBetter', {
      fuel: fuelName(best.key, lang),
      now: litresPhrase(Math.round(best.now), lang),
      before: litresPhrase(Math.round(best.was), lang),
    }),
  };
}

/** "Credit limit used 71%, was 64%". */
function creditChange(data: ReportData, before: ReportData | undefined, lang: Lang): ChangeLine | null {
  if (data.kind !== 'credit_dod' || before?.kind !== 'credit_dod') return null;
  const now = data.limit?.usedPct;
  const was = before.limit?.usedPct;
  if (now === null || was === null || now === undefined || was === undefined || Math.round(now) === Math.round(was)) return null;
  return {
    dir: 'plain',
    text: translate(lang, now > was ? 'rep.change.creditUp' : 'rep.change.creditDown', {
      now: fmtInt(now, lang),
      before: fmtInt(was, lang),
    }),
  };
}

/** "9 of 12 checks done, 12 of 12 before". */
function waterChange(data: ReportData, before: ReportData | undefined, lang: Lang): ChangeLine | null {
  if (data.kind !== 'water_ingress' || before?.kind !== 'water_ingress') return null;
  if (data.recordedSlots === before.recordedSlots && data.totalSlots === before.totalSlots) return null;
  const more = data.recordedSlots >= before.recordedSlots;
  return {
    dir: more ? 'better' : 'worse',
    text: translate(lang, more ? 'rep.change.waterMore' : 'rep.change.waterFewer', {
      done: fmtInt(data.recordedSlots, lang),
      total: fmtInt(data.totalSlots, lang),
      beforeDone: fmtInt(before.recordedSlots, lang),
      beforeTotal: fmtInt(before.totalSlots, lang),
    }),
  };
}

/**
 * What changed against the report before it (the next older, not replaced, report of the same kind on
 * an earlier business day, in the loaded list). A sales report carries its own comparison with the
 * same weekday last week, so it needs no neighbour. `null` when there is nothing honest to say.
 */
export function changeLine(report: TodayReport, previous: TodayReport | undefined, lang: Lang): ChangeLine | null {
  // A line under a row is a nicety: a snapshot missing a field never takes the list down with it.
  try {
    return changeLineOf(report, previous, lang);
  } catch {
    return null;
  }
}

function changeLineOf(report: TodayReport, previous: TodayReport | undefined, lang: Lang): ChangeLine | null {
  const data = dataOfRow(report);
  if (!data) return null;
  const before = previous ? dataOfRow(previous) : undefined;
  switch (data.kind) {
    case 'dsr_sales':
      return salesChange(data, lang);
    case 'dsr_variation':
      return variationChange(data, before, lang) ?? salesChange(data, lang);
    case 'credit_dod':
      return creditChange(data, before, lang);
    case 'water_ingress':
      return waterChange(data, before, lang);
    default:
      return null;
  }
}

// ── the list ────────────────────────────────────────────────────────────────

export interface GroupOptions {
  /** When the reader last looked at this list (ISO). Reports sent after it are "New". Null: a first visit, nothing is new. */
  since?: string | null;
  /** Keep only the rows that ask for a look (the "Needs a look" chip). */
  needsOnly?: boolean;
}

/**
 * The loaded rows (newest sent first) as groups by business day, newest day first, each row marked.
 * Within a day the order of arrival is kept. `replaced` is worked out over every loaded row before any
 * row is dropped, so the "Needs a look" chip never promotes an older copy that a newer one replaced.
 */
export function groupHistory(
  items: readonly TodayReport[],
  now: Date,
  lang: Lang,
  t: TFunction,
  options: GroupOptions = {},
): HistoryGroup[] {
  const sinceMs = options.since ? Date.parse(options.since) : NaN;
  const seen = new Set<string>();
  const rows: HistoryRow[] = [];
  for (const report of items) {
    const day = businessDayOf(report);
    const oneADay = ONE_A_DAY.has(report.kind) && !!report.day;
    const slot = oneADay ? `${report.kind}|${report.day}` : '';
    const replaced = oneADay && seen.has(slot);
    if (oneADay) seen.add(slot);
    const data = dataOfRow(report);
    rows.push({
      report,
      day,
      replaced,
      corrected: isCorrected(data),
      picture: !data && report.attachments.length > 0,
      isNew: !Number.isNaN(sinceMs) && Date.parse(report.sentAt) > sinceMs,
      change: null,
    });
  }

  // Newest business day first; the order of arrival (newest sent first) is kept inside a day.
  const ordered = rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (a.row.day === b.row.day ? a.i - b.i : a.row.day < b.row.day ? 1 : -1))
    .map((x) => x.row);

  // The report before each one: the next older of its kind that is not a replaced copy.
  const lastOfKind = new Map<ReportKind, HistoryRow[]>();
  for (const row of ordered) {
    if (row.replaced) continue;
    const list = lastOfKind.get(row.report.kind) ?? [];
    list.push(row);
    lastOfKind.set(row.report.kind, list);
  }
  for (const list of lastOfKind.values()) {
    list.forEach((row, i) => {
      const previous = list.slice(i + 1).find((r) => r.day < row.day);
      row.change = changeLine(row.report, previous?.report, lang);
    });
  }

  const groups: HistoryGroup[] = [];
  for (const row of ordered) {
    if (options.needsOnly && !needsLook(row, lang)) continue;
    let group = groups[groups.length - 1];
    if (!group || group.day !== row.day) {
      group = { day: row.day, heading: dayHeading(row.day, now, lang, t), rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/** Loaded reports this reader may see: a manager never holds an owner-only kind, whatever the server sent. */
export function readableReports(items: readonly TodayReport[], isOwner: boolean): TodayReport[] {
  return isOwner ? [...items] : items.filter((r) => !OWNER_ONLY_REPORT_KINDS.has(r.kind));
}

// ── the "Last 30 days" card ─────────────────────────────────────────────────

/** The report kinds that count as "a paper filed for you" on the card. */
export const FILING_KINDS: readonly ReportKind[] = [
  'declaration_filed',
  'mock_drill',
  'electrical_audit',
  'calibration_claim',
  'du_otp',
  'tt_ack',
];

/** The strip of sales-report dots is at most this many days long. */
export const SALES_STRIP_DAYS = 14;

export interface MonthCard {
  /** Reports that came in the window. */
  came: number;
  /** How many of them still needed a look (old alarms of the ageing kinds are not counted). */
  needLook: number;
  /** The last days for the sales report, oldest first; `null` when no sales report has ever come in the window (the service may not be attached). */
  salesStrip: { day: string; state: 'came' | 'none' }[] | null;
  /** Every business day in the window with no sales report, newest first. */
  missingSalesDays: string[];
  /** Business days with a water check recorded. */
  waterDays: number;
  /** Papers filed. */
  filings: number;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return indiaDay(new Date(Date.UTC(y, m - 1, d + n, 6)));
}

function dayBefore(a: string, b: string): boolean {
  return a < b;
}

/** India hour of an instant, 0 to 23. */
function indiaHour(now: Date): number {
  return new Date(now.getTime() + 330 * 60_000).getUTCHours();
}

/**
 * The 30-day picture from `GET /v1/me/reports/summary`, or `null` when nothing came (the empty state
 * speaks for that). The sales strip starts at the first day a sales report came, so a pump that is only
 * a week old is not shown a month of gaps, and ends at yesterday, except that yesterday is not called a
 * gap before the hour the report is expected by (`EXPECTED_BY.dsr_sales`, India time).
 */
export function monthCard(summary: ReportSummary, now: Date = new Date()): MonthCard | null {
  let came = 0;
  let needLook = 0;
  for (const e of Object.values(summary.byKind)) {
    if (!e) continue;
    came += e.count;
    needLook += e.needLook;
  }
  if (came === 0) return null;

  const today = indiaDay(now);
  const yesterday = addDays(today, -1);
  const salesDays = new Set([
    ...(summary.byKind.dsr_sales?.days ?? []),
    ...(summary.byKind.dsr_variation?.days ?? []),
  ]);
  // Only days up to yesterday are expected; a report for today (an early run) is not a gap or a dot.
  const known = [...salesDays].filter((d) => !dayBefore(yesterday, d)).sort();

  let salesStrip: MonthCard['salesStrip'] = null;
  const missingSalesDays: string[] = [];
  if (known.length > 0) {
    const windowStart = istDayOfSince(summary.since);
    const first = known[0]!;
    const yesterdayLate = !salesDays.has(yesterday) && indiaHour(now) < EXPECTED_BY.dsr_sales;
    const last = yesterdayLate ? addDays(yesterday, -1) : yesterday;
    const from = dayBefore(first, windowStart) ? windowStart : first;
    for (let d = last; !dayBefore(d, from); d = addDays(d, -1)) {
      if (!salesDays.has(d)) missingSalesDays.push(d);
    }
    const stripFrom = addDays(last, -(SALES_STRIP_DAYS - 1));
    const start = dayBefore(stripFrom, from) ? from : stripFrom;
    salesStrip = [];
    for (let d = start; !dayBefore(last, d); d = addDays(d, 1)) {
      salesStrip.push({ day: d, state: salesDays.has(d) ? 'came' : 'none' });
    }
  }

  return {
    came,
    needLook,
    salesStrip,
    missingSalesDays,
    waterDays: summary.byKind.water_ingress?.days.length ?? 0,
    filings: FILING_KINDS.reduce((sum, k) => sum + (summary.byKind[k]?.count ?? 0), 0),
  };
}

function istDayOfSince(iso: string): string {
  return istDayOf(iso) || indiaDay(new Date(iso));
}

/** The report kinds that still need a look in the summary: what the "Needs a look" chip asks the server for. */
export function kindsNeedingLook(summary: ReportSummary | undefined): ReportKind[] | undefined {
  if (!summary) return undefined;
  return (Object.entries(summary.byKind) as Array<[ReportKind, { needLook: number } | undefined]>)
    .filter(([, e]) => e && e.needLook > 0)
    .map(([k]) => k);
}
