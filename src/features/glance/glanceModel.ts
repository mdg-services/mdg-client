import { fuelName } from '@/features/reports/kinds/dsr_sales/fmt';
import { dayOf, newestFirst, salesSheetOf, usableData } from '@/features/today/todayView';
import {
  daysUntil,
  fmtDay,
  fmtDays,
  fmtInt,
  fmtLitres,
  fmtMoney,
  fmtTime,
  fmtWeekday,
  indiaDay,
} from '@/lib/fmt';
import { translate, type MessageKey, type TVars } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import type { Lang } from '@/store/lang';
import { OWNER_ONLY_REPORT_KINDS } from '@dk/shared';
import type {
  DsrSalesData,
  KavachDealerView,
  PaperExpiryData,
  ReportData,
  ReportDataOf,
  ReportKind,
  SetupStage,
  TodayFeed,
  TodayReport,
} from '@dk/shared/types';

import {
  attentionReports,
  buildNeedsMe,
  isAgedAlarm,
  kavachNeedCount,
  type NeedsMeInput,
  type NeedsMeItem,
  type Role,
} from './needsMe';

/**
 * The glance model (spec 3.2): what the whole app decides ONCE about the pump, so the tab bar's
 * badge, the verdict card, the Services header and the My-pump page can never disagree.
 *
 * Two layers, so the tab bar never loads every report kind's drawing code:
 *
 *  1. {@link countsOf}: cheap. Reads only the feed's tasks and report statuses, the aging list, the
 *     Kavach points and the clock.
 *  2. {@link verdictOf}: full. Takes the alerts the kinds raised (Today asks `buildAlertsAndCovered`
 *     and passes them in, so this file never imports a kind's view) and returns the verdict, its
 *     one sentence, the Needs-you list and the four numbers. {@link pumpNowRows} and
 *     {@link comingUp} build the other two cards from the same feed.
 *
 * Pure: no React, no network, no clock except the `now` it is given. Every date is read in India time.
 * Every figure that shows "days left" is counted again from its date, never taken frozen from a snapshot.
 */

export type { Role } from './needsMe';

/**
 * Is the pump live: the services have started (`watch`, the first days under watch) or setup is done
 * (`live`). Any earlier stage is the setup hero's. `undefined` while the stage is not known yet, so a
 * slow setup read never blocks the verdict. (Spec 3.2 says "setup stage not `watch`"; `live` is past it.)
 */
export function isPumpLive(stage: SetupStage | null | undefined): boolean | undefined {
  if (!stage) return undefined;
  return stage === 'watch' || stage === 'live';
}

// ── constants (each pinned by a test) ───────────────────────────────────────

/** A feed older than this is not "now": the verdict never says fine from it, and the card says "Checked 9:10 am". */
export const FEED_FRESH_MS = 30 * 60_000;

/**
 * The India hour by which a day's report is expected, per kind. A DSR for yesterday that has not come by
 * 11:00 is a calm "has not come yet" row, not a problem. **(unverified)** Check it against real
 * production `sentAt` times before release (spec 3.2).
 */
export const EXPECTED_BY: Readonly<{ dsr_sales: number }> = { dsr_sales: 11 };

/** A stock reading older than this is shown with the word "old". */
export const STOCK_OLD_MS = 24 * 3_600_000;

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;

/** The India clock's hour, 0 to 23. */
function indiaHour(now: Date): number {
  return new Date(now.getTime() + IST_MS).getUTCHours();
}

// ── layer 1: the cheap counts ───────────────────────────────────────────────

export interface Counts {
  /** Open tasks, plus the Kavach points sent back or late that no task already asks for. */
  needYou: number;
  /** Reports that say "have a look" (not aged out, not covered by a task), plus the calm missing-report row. */
  look: number;
  /** What MDG finished today. */
  doneToday: number;
}

export interface CountsInput {
  feed?: TodayFeed | null;
  kavach?: KavachDealerView | null;
  role: Role;
  now: Date;
  /** The setup block shows the feed's `setup` task with its own button: not counted twice. */
  setupShown?: boolean;
}

function reportDay(r: Pick<TodayReport, 'day' | 'sentAt'>): string {
  return r.day ?? indiaDay(new Date(r.sentAt));
}

/**
 * Yesterday's sales report is missing: the feed holds a `dsr_sales` report from the last 7 days (that
 * proves the service is attached, with no extra request), the newest DSR day in the feed is before
 * yesterday's business day, and it is after {@link EXPECTED_BY}`.dsr_sales` o'clock in India. A
 * message that carries both sheets is tagged `dsr_variation`, so a day is "there" when either kind
 * holds it. Never worded "you missed": the gap can be MDG's or the portal's.
 */
export function missingSalesReport(feed: TodayFeed | null | undefined, now: Date): { missing: boolean; newestDay?: string } {
  if (!feed) return { missing: false };
  const today = indiaDay(now);
  const weekAgo = indiaDay(new Date(now.getTime() - 7 * DAY_MS));
  const sales = feed.reports.filter((r) => r.kind === 'dsr_sales' && reportDay(r) >= weekAgo);
  if (sales.length === 0) return { missing: false };
  const days = feed.reports.filter((r) => r.kind === 'dsr_sales' || r.kind === 'dsr_variation').map(reportDay);
  const newestDay = days.reduce((a, b) => (a > b ? a : b));
  const yesterday = indiaDay(new Date(now.getTime() - DAY_MS));
  const missing = newestDay < yesterday && indiaHour(now) >= EXPECTED_BY.dsr_sales && today > newestDay;
  return { missing, newestDay };
}

/**
 * The three numbers the bar's badge, the verdict chips and My pump show. With no feed (not loaded, or
 * an admin signed in here) the answer is zeros: the tab bar asks nothing where it has nothing.
 */
export function countsOf({ feed, kavach, role, now, setupShown = false }: CountsInput): Counts {
  if (!feed) return { needYou: kavachNeedCount(kavach, role, []), look: 0, doneToday: 0 };
  const tasks = feed.tasks.filter((t) => !(setupShown && t.kind === 'setup'));
  return {
    needYou: tasks.length + kavachNeedCount(kavach, role, feed.tasks),
    look: attentionReports(feed, role).length + (missingSalesReport(feed, now).missing ? 1 : 0),
    doneToday: feed.done.length,
  };
}

// ── layer 2: the verdict ────────────────────────────────────────────────────

export type Verdict = 'setup' | 'unknown' | 'problem' | 'needs_you' | 'look' | 'no_reports' | 'fine';

/** What the kit's `VerdictCard` is given as its `status`. */
export type VerdictCardStatus = 'ok' | 'attention' | 'problem' | 'waiting' | 'info' | 'unknown' | 'setup';

const CARD_STATUS: Record<Verdict, VerdictCardStatus> = {
  setup: 'setup',
  unknown: 'unknown',
  problem: 'problem',
  needs_you: 'waiting',
  look: 'attention',
  no_reports: 'info',
  fine: 'ok',
};

export type AsOf =
  /** "as of 9:40 am": the newest report in the feed. */
  | { kind: 'at'; at: string }
  /** "Checked 9:10 am": the time the feed was fetched, when it is older than half an hour or has no report. */
  | { kind: 'checked'; at: string }
  | { kind: 'none' };

export interface GlanceInput {
  /** The Today feed in hand; `undefined` while it loads or after it failed with nothing in hand. */
  feed?: TodayFeed | null;
  /** The last read of the feed failed. */
  feedFailed?: boolean;
  /** When the feed in hand was fetched, in ms (the query's `dataUpdatedAt`); null or absent when unknown (read as stale). */
  fetchedAt?: number | null;
  /** The phone is online. Absent reads as online. */
  online?: boolean;
  /**
   * The Kavach view: `undefined` while it loads, `null` when it is off or could not be read. Decides
   * whether the fourth number is the score or the papers.
   */
  kavach?: KavachDealerView | null;
  role: Role;
  lang: Lang;
  now: Date;
  /** The pump is live (`isPumpLive(stage)`). Absent while unknown: it never blocks the verdict. */
  pumpLive?: boolean;
  /** The alerts the report kinds raised, from `buildAlertsAndCovered(...).items`. */
  alerts: NeedsMeInput['alerts'];
  /** The name of a paper ("Fire NOC"), from the paper_expiry view; without it a paper is named by its portal label. */
  paperName?: (item: PaperItem) => string;
}

type PaperItem = PaperExpiryData['items'][number];

export interface Glance {
  verdict: Verdict;
  /** For `VerdictCard.status`. */
  cardStatus: VerdictCardStatus;
  /** The count in the verdict's word ("2 things wait for you"); 0 when the verdict has none. */
  n: number;
  /** The words: "All fine", "2 things wait for you". */
  word: string;
  /** The one sentence under it: the first two reasons in plain words. Absent when there is nothing to add. */
  sentence?: string;
  /** The same counts the tab bar shows, from {@link countsOf}. */
  counts: Counts;
  /** Of `counts.look`, how many are problems (the verdict card never shows fewer than the bar). */
  problems: number;
  needsMe: NeedsMeItem[];
  /** The four numbers, in their fixed places. */
  pulse: PulseSlot[];
  /** The calm "yesterday's sales report has not come yet" row applies. */
  missingReport: boolean;
  asOf: AsOf;
  /** The feed in hand is older than half an hour. */
  stale: boolean;
  /** Nothing has been read yet. */
  loading: boolean;
}

/** The first sentence-ending mark, kept; else a full stop is added. */
function endSentence(text: string): string {
  const t = text.trim();
  return /[.।!?]$/.test(t) ? t : `${t}.`;
}

/** The newest report that is a sales or variation sheet's: it has a business day. */
function newestSentAt(feed: TodayFeed): string | undefined {
  let best: string | undefined;
  for (const r of [...feed.reports, ...feed.done]) if (!best || r.sentAt > best) best = r.sentAt;
  return best;
}

/** The snapshots of one kind, newest business day first, then newest message; only those this reader may use. */
function snapshots<K extends ReportData['kind']>(
  feed: TodayFeed,
  kind: K,
  isOwner: boolean,
): Array<{ report: TodayReport; data: ReportDataOf<K> }> {
  const out: Array<{ report: TodayReport; data: ReportDataOf<K> }> = [];
  for (const report of [...feed.reports, ...feed.done]) {
    if (report.kind !== kind) continue;
    const data = usableData(report, isOwner);
    if (data && data.kind === kind) out.push({ report, data: data as ReportDataOf<K> });
  }
  return out.sort(
    (a, b) =>
      dayOf(b.report, b.data).localeCompare(dayOf(a.report, a.data)) || b.report.sentAt.localeCompare(a.report.sentAt),
  );
}

/** The supply report that says the pump's fuel is stopped, when it is the newest one and not aged out. */
function blockedSupply(feed: TodayFeed, role: Role): TodayReport | undefined {
  const newest = newestFirst(feed.reports.filter((r) => r.kind === 'ro_supply'))[0];
  if (!newest || isAgedAlarm(newest)) return undefined;
  const data = usableData(newest, role === 'owner');
  return data?.kind === 'ro_supply' && data.blocked === true ? newest : undefined;
}

/**
 * The verdict (spec 3.2), first match wins:
 *
 *  1. `setup`: the pump is not live. The setup hero replaces the card.
 *  2. `unknown`: the feed failed with nothing in hand, or the phone is offline and the feed is older
 *     than 30 minutes. Never "fine".
 *  3. `problem`: an alert of severity problem (aged alarms are already out), or supply blocked.
 *  4. `needs_you`: an open task, or a Kavach point sent back or late.
 *  5. `look`: an attention report not covered by a task, or the calm missing-report row.
 *  6. `fine`: none of the above AND the feed was fetched in the last 30 minutes.
 *
 * Two cases the table does not spell out, both on the safe side:
 *  - nothing read yet (loading), or a feed older than 30 minutes with nothing to report while the phone
 *    is online: `unknown`, because "fine" needs a fresh feed (a refresh is on its way);
 *  - the pump is live with no report, no receipt and no task yet: `no_reports` ("Your first reports come
 *    after the next run"), because spec 4.1 says `fine` is NOT shown there.
 */
export function verdictOf(input: GlanceInput): Glance {
  const { feed, feedFailed = false, fetchedAt = null, online = true, kavach, role, lang, now, pumpLive, alerts } = input;
  const stale = fetchedAt === null || now.getTime() - fetchedAt > FEED_FRESH_MS;
  const setupShown = pumpLive === false;

  const counts = countsOf({ feed, kavach, role, now, setupShown });
  const missing = missingSalesReport(feed, now).missing;
  const needsMe = feed ? buildNeedsMe({ feed, alerts, kavach, role, lang, now, setupShown }) : [];
  const blocked = feed ? blockedSupply(feed, role) : undefined;

  // The reports behind the problem count: problem alerts, and blocked supply when no alert already says so.
  const problemIds = new Set(alerts.filter((a) => a.severity === 'problem').map((a) => a.report.messageId));
  if (blocked) problemIds.add(blocked.messageId);
  const problems = problemIds.size;

  const asOf = asOfOf(feed, fetchedAt, stale);
  const pulse = feed ? pulseOf({ feed, kavach, role, lang, now, alerts, paperName: input.paperName }) : [];

  const base = { counts, problems, needsMe, pulse, missingReport: missing, asOf, stale, loading: !feed && !feedFailed };
  const done = (verdict: Verdict, n: number, word: string, sentence?: string): Glance => ({
    verdict,
    cardStatus: CARD_STATUS[verdict],
    n,
    word,
    ...(sentence ? { sentence } : {}),
    ...base,
  });

  if (pumpLive === false) return done('setup', 0, translate(lang, 'glance.verdict.setup'));

  const unknown = () => done('unknown', 0, translate(lang, 'glance.verdict.unknown'), translate(lang, 'glance.sentence.unknown'));
  if (!feed) return unknown();
  if (!online && stale) return unknown();

  // The sentence names the first two reasons; for a problem the problems come first.
  const reasons = (): string => {
    const ordered = problems > 0 ? [...needsMe].sort((a, b) => Number(b.status === 'problem') - Number(a.status === 'problem')) : needsMe;
    const lines = ordered.map((i) => i.text);
    if (blocked && !needsMe.some((i) => i.report?.messageId === blocked.messageId)) {
      lines.unshift(tnIn(lang, 'glance.supply.stopped', 1));
    }
    if (missing) lines.push(translate(lang, 'glance.report.missing'));
    return lines.slice(0, 2).map(endSentence).join(' ');
  };

  if (problems > 0) return done('problem', problems, tnIn(lang, 'glance.verdict.problem', problems), reasons());
  if (counts.needYou > 0) {
    return done('needs_you', counts.needYou, tnIn(lang, 'glance.verdict.needs', counts.needYou), reasons());
  }
  if (counts.look > 0) return done('look', counts.look, tnIn(lang, 'glance.verdict.look', counts.look), reasons());

  if (stale) return unknown();
  if (feed.reports.length + feed.done.length + feed.tasks.length === 0) {
    return done('no_reports', 0, translate(lang, 'glance.verdict.noReports'));
  }
  return done('fine', 0, translate(lang, 'glance.verdict.fine'));
}

function asOfOf(feed: TodayFeed | null | undefined, fetchedAt: number | null, stale: boolean): AsOf {
  if (!feed) return { kind: 'none' };
  const newest = newestSentAt(feed);
  const checked = fetchedAt === null ? undefined : new Date(fetchedAt).toISOString();
  if (stale && checked) return { kind: 'checked', at: checked };
  if (newest) return { kind: 'at', at: newest };
  return checked ? { kind: 'checked', at: checked } : { kind: 'none' };
}

// ── the four numbers ────────────────────────────────────────────────────────

export type PulseId = 'sales' | 'variation' | 'deposit' | 'water' | 'score' | 'papers';
export type PulseStatus = 'ok' | 'attention' | 'problem' | 'info';

export interface PulseSlot {
  id: PulseId;
  /** Where it sits: 1 Sales, 2 Variation, 3 Deposit (owner) or Water, 4 Score (Kavach on) or Papers. */
  position: 1 | 2 | 3 | 4;
  /** A warning shows only when the same fact is not already a row in Needs you. */
  status: PulseStatus;
  /** The report it opens; absent for the Kavach score. */
  report?: TodayReport;
  /** The business day the figures are about (`YYYY-MM-DD`): a tile may hold a report from days ago. */
  day?: string;
  /** The big number: litres, rupees, checks done, percent, days. */
  value?: number;
  /** The words, one sentence each, in the reader's language. */
  lines: string[];
  /** Sales only: the last 7 closed days, oldest first, summed over the fuels. */
  bars?: Array<{ day: string; litres: number }>;
  /** Sales only: the change on the same weekday last week, in whole percent; null when it cannot be told. */
  deltaPct?: number | null;
  /** Variation only: one entry per fuel. */
  fuels?: Array<{ fuel: string; beyondL: number }>;
}

interface PulseInput {
  feed: TodayFeed;
  kavach?: KavachDealerView | null;
  role: Role;
  lang: Lang;
  now: Date;
  alerts: NeedsMeInput['alerts'];
  paperName?: (item: PaperItem) => string;
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** The paper's name for a sentence: the view's own words when given, else the portal's label. */
function paperLabel(item: PaperItem, paperName?: (item: PaperItem) => string): string {
  return paperName ? paperName(item) : item.docLabel || item.docType;
}

/** A paper's days left, counted again from its date; the stored count when it has no date. */
export function paperDaysLeft(item: Pick<PaperItem, 'validUntil' | 'daysLeft'>, now: Date): number {
  return (item.validUntil ? daysUntil(item.validUntil, now) : null) ?? item.daysLeft;
}

/** The paper that ends soonest, with its recounted days. Null when there is none. */
function soonestPaper(data: PaperExpiryData, now: Date): { item: PaperItem; days: number } | null {
  let best: { item: PaperItem; days: number } | null = null;
  for (const item of data.items) {
    const days = paperDaysLeft(item, now);
    if (!best || days < best.days) best = { item, days };
  }
  return best;
}

function paperSentence(label: string, days: number, lang: Lang): string {
  return days < 0
    ? translate(lang, 'glance.paper.expired', { paper: label })
    : tnIn(lang, 'glance.paper.days', days, { paper: label });
}

function paperStatus(days: number): PulseStatus {
  return days < 0 ? 'problem' : days <= 7 ? 'attention' : 'ok';
}

/** The sales of the newest closed day: litres, the change on the same weekday last week, 7 bars. */
function salesSlot(i: PulseInput): PulseSlot | null {
  const isOwner = i.role === 'owner';
  const candidates: Array<{ report: TodayReport; data: DsrSalesData }> = snapshots(i.feed, 'dsr_sales', isOwner);
  for (const r of snapshots(i.feed, 'dsr_variation', isOwner)) {
    // A message with both sheets is tagged as the variation: the sales sheet is read out of it.
    const sheet = salesSheetOf(r.data);
    if (sheet) candidates.push({ report: { ...r.report, kind: 'dsr_sales' }, data: sheet });
  }
  candidates.sort(
    (a, b) => dayOf(b.report, b.data).localeCompare(dayOf(a.report, a.data)) || b.report.sentAt.localeCompare(a.report.sentAt),
  );
  for (const { report, data } of candidates) {
    // A day whose sales are not worked out yet is never drawn as 0.
    const closed = data.products.filter((p) => p.sales.state === 'closed' && p.sales.soldL !== null);
    if (closed.length === 0) continue;
    const litres = sum(closed.map((p) => p.sales.soldL ?? 0));
    const lastWeek = closed.map((p) => p.sales.sameWeekdayLastWeek);
    const day = dayOf(report, data);
    const lines = [translate(i.lang, 'glance.sales.line', { litres: fmtLitres(litres, i.lang), day: fmtDay(day, i.lang, i.now) })];

    let deltaPct: number | null = null;
    if (lastWeek.every((w) => w !== null)) {
      const prev = sum(lastWeek.map((w) => w!.soldL));
      if (prev > 0) {
        deltaPct = Math.round(((litres - prev) / prev) * 100);
        const weekday = fmtWeekday(lastWeek[0]!.day, i.lang);
        const key: MessageKey = deltaPct > 0 ? 'glance.delta.up' : deltaPct < 0 ? 'glance.delta.down' : 'glance.delta.same';
        lines.push(translate(i.lang, key, { n: fmtInt(Math.abs(deltaPct)), weekday }));
      }
    }

    // The last 7 closed days, summed over the fuels, oldest first.
    const byDay = new Map<string, number>();
    for (const p of closed) for (const t of p.sales.trend) byDay.set(t.day, (byDay.get(t.day) ?? 0) + t.soldL);
    const bars = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([d, l]) => ({ day: d, litres: l }));

    // Month to date is shown only when every closed fuel has it.
    const mtd = closed.map((p) => p.sales.monthToDateL);
    if (mtd.every((m) => m !== null)) {
      lines.push(translate(i.lang, 'glance.sales.month', { litres: fmtLitres(sum(mtd as number[]), i.lang) }));
    }
    return { id: 'sales', position: 1, status: 'ok', report, day, value: litres, lines, bars, deltaPct };
  }
  return null;
}

/** The worst fuel's word and one line per fuel. A day before the first inspection gives no verdict. */
function variationSlot(i: PulseInput, covered: ReadonlySet<string>): PulseSlot | null {
  for (const { report, data } of snapshots(i.feed, 'dsr_variation', i.role === 'owner')) {
    if (data.beforeInspection || data.products.length === 0) continue;
    const fuels = data.products.map((p) => ({ fuel: fuelName(p.key, i.lang), beyondL: Math.abs(p.variation.offL) }));
    const lines = fuels.map((f) =>
      f.beyondL > 0
        ? translate(i.lang, 'glance.variation.beyond', { fuel: f.fuel, litres: fmtLitres(f.beyondL, i.lang) })
        : translate(i.lang, 'glance.variation.inside', { fuel: f.fuel }),
    );
    // Worst fuel first.
    const order = fuels.map((f, idx) => idx).sort((a, b) => fuels[b]!.beyondL - fuels[a]!.beyondL);
    const status: PulseStatus = fuels.some((f) => f.beyondL > 0) && !covered.has(report.messageId) ? 'attention' : 'ok';
    return {
      id: 'variation',
      position: 2,
      status,
      report,
      day: dayOf(report, data),
      lines: order.map((idx) => lines[idx]!),
      fuels: order.map((idx) => fuels[idx]!),
    };
  }
  return null;
}

/** Slot 3 for the owner: what to deposit to the oil company, and by when (counted again from the date). */
function depositSlot(i: PulseInput, covered: ReadonlySet<string>): PulseSlot | null {
  for (const { report, data } of snapshots(i.feed, 'credit_dod', true)) {
    const { money, limit, verdict } = data;
    if (verdict === 'settled' || verdict === 'advance' || !(money.amount > 0) || !money.date) continue;
    const left = daysUntil(money.date, i.now);
    const lines = [
      translate(i.lang, 'glance.deposit.line', {
        amount: fmtMoney(Math.round(money.amount * 100), i.lang),
        day: fmtDay(money.date, i.lang, i.now),
      }),
    ];
    if (left !== null) {
      lines.push(
        left === 0
          ? translate(i.lang, 'glance.deposit.last')
          : left > 0
            ? tnIn(i.lang, 'glance.deposit.left', left)
            : tnIn(i.lang, 'glance.deposit.late', -left),
      );
    }
    if (limit.usedPct !== null) lines.push(translate(i.lang, 'glance.deposit.limit', { pct: fmtInt(limit.usedPct) }));
    const raw: PulseStatus = left !== null && left < 0 ? 'problem' : left === 0 ? 'attention' : 'ok';
    return {
      id: 'deposit',
      position: 3,
      status: covered.has(report.messageId) ? 'ok' : raw,
      report,
      day: money.date,
      value: money.amount,
      lines,
    };
  }
  return null;
}

/** Slot 3 for a manager, and for an owner with nothing to deposit: the water checks. */
function waterSlot(i: PulseInput, covered: ReadonlySet<string>): PulseSlot | null {
  for (const { report, data } of snapshots(i.feed, 'water_ingress', i.role === 'owner')) {
    if (!(data.totalSlots > 0)) continue;
    const lines = [translate(i.lang, 'glance.water.line', { done: fmtInt(data.recordedSlots), total: fmtInt(data.totalSlots) })];
    if (data.missedSlots > 0) lines.push(translate(i.lang, 'glance.water.missed', { n: fmtInt(data.missedSlots) }));
    const warn = data.missedSlots > 0 && !isAgedAlarm(report) && !covered.has(report.messageId);
    return {
      id: 'water',
      position: 3,
      status: warn ? 'attention' : 'ok',
      report,
      day: data.businessDate,
      value: data.recordedSlots,
      lines,
    };
  }
  return null;
}

/** Slot 4 with Kavach on: the inspection score and the day's points. */
function scoreSlot(i: PulseInput): PulseSlot | null {
  const s = i.kavach?.on ? i.kavach.summary : null;
  if (!s) return null;
  return {
    id: 'score',
    position: 4,
    status: 'ok',
    value: s.pct,
    lines: [
      translate(i.lang, 'glance.kavach.score', { pct: fmtInt(s.pct) }),
      translate(i.lang, 'glance.kavach.todo', { todo: fmtInt(s.counts.todo), back: fmtInt(s.counts.sentBack) }),
    ],
  };
}

/** Slot 4 with Kavach off: the paper that ends soonest. */
function papersSlot(i: PulseInput, covered: ReadonlySet<string>): PulseSlot | null {
  for (const { report, data } of snapshots(i.feed, 'paper_expiry', i.role === 'owner')) {
    const soonest = soonestPaper(data, i.now);
    if (!soonest) continue;
    const status = paperStatus(soonest.days);
    return {
      id: 'papers',
      position: 4,
      status: covered.has(report.messageId) ? 'ok' : status,
      report,
      day: soonest.item.validUntil,
      value: soonest.days,
      lines: [paperSentence(paperLabel(soonest.item, i.paperName), soonest.days, i.lang)],
    };
  }
  return null;
}

/**
 * Today's four numbers, in their fixed places, never reshuffled by status. A slot with no source is
 * left out (the grid closes up). Slot 3 is the owner's deposit, else the water checks; slot 4 is the
 * inspection score while Kavach is on, else the papers. While the Kavach view is still loading
 * (`undefined`) slot 4 is left out, so the tile never flips from papers to score.
 */
export function pulseOf(i: PulseInput): PulseSlot[] {
  // A warning inside a tile appears only when the same fact is not already a row in Needs you.
  const covered = new Set(i.alerts.map((a) => a.report.messageId));
  const slot3 = (i.role === 'owner' ? depositSlot(i, covered) : null) ?? waterSlot(i, covered);
  const slot4 = i.kavach === undefined ? null : i.kavach?.on ? scoreSlot(i) : papersSlot(i, covered);
  return [salesSlot(i), variationSlot(i, covered), slot3, slot4].filter((s): s is PulseSlot => s !== null);
}

// ── Pump now ────────────────────────────────────────────────────────────────

export type PumpNowId = 'tanker' | 'stock' | 'water' | 'supply' | 'papers' | 'declaration' | 'missing';

export interface PumpNowRow {
  id: PumpNowId;
  status: PulseStatus;
  /** The one sentence. */
  text: string;
  /** More sentences of the same row (one fuel each). */
  more?: string[];
  /** A 14 px line under it: "Reading from 9:10 am, old". */
  meta?: string;
  /** The service it opens. */
  serviceId: string | null;
  report?: TodayReport;
  /** The button of the row: "Plan the order" or "Ask for a stock check" (each opens the chat with a typed, unsent line). */
  action?: 'planOrder' | 'askStock';
}

export interface PumpNowInput {
  feed: TodayFeed;
  role: Role;
  lang: Lang;
  now: Date;
  paperName?: (item: PaperItem) => string;
}

function tankerRow(i: PumpNowInput): PumpNowRow | null {
  const [first] = snapshots(i.feed, 'load_plan', true);
  if (!first) return null;
  const { report, data } = first;
  const orderNow = data.verdict.code === 'ORDER_NOW_RUNNING_OUT' || data.verdict.code === 'ORDER_NOW_DEPOT_CLOSED' || data.verdict.code === 'ORDER_TODAY';
  const aged = isAgedAlarm(report);
  let text: string | null = null;
  let status: PulseStatus = 'ok';
  if (orderNow && !aged) {
    text = translate(i.lang, 'glance.tanker.order');
    status = data.verdict.code === 'ORDER_TODAY' ? 'attention' : 'problem';
  } else if (data.order) {
    const arrive = data.order.arriveDate ?? data.order.arriveOn;
    text = data.order.arriveTime
      ? translate(i.lang, 'glance.tanker.arrives', { day: fmtDay(arrive, i.lang, i.now), time: data.order.arriveTime })
      : translate(i.lang, 'glance.comingUp.tanker', { day: fmtDay(arrive, i.lang, i.now) });
    status = aged ? 'info' : 'ok';
  }
  if (!text) return null;

  // "Tomorrow's cover": the second day of the four-day projection, one entry per pool.
  const tomorrow = data.projection[1];
  const fuelsCover = (tomorrow?.cover ?? [])
    .map((c) => {
      const pool = data.pools.find((p) => p.key === c.poolKey);
      return pool && c.daysLeft !== null
        ? tnIn(i.lang, 'glance.tanker.coverFuel', c.daysLeft, { fuel: fuelName(pool.product, i.lang), days: fmtDays(c.daysLeft) })
        : null;
    })
    .filter((x): x is string => x !== null);
  return {
    id: 'tanker',
    status,
    text,
    ...(fuelsCover.length ? { more: [translate(i.lang, 'glance.tanker.cover', { fuels: fuelsCover.join(', ') })] } : {}),
    serviceId: 'load-planner',
    report,
    ...(orderNow && !aged ? { action: 'planOrder' as const } : {}),
  };
}

/** Stock cover per fuel from the newest stock check, else the newest load plan's pools; "No stock reading yet" with a button when there is none. */
function stockRow(i: PumpNowInput): PumpNowRow {
  const stock = snapshots(i.feed, 'stock_check', true).find((s) => s.data.cover?.fuels.some((f) => f.daysLeft !== null));
  type Cover = { fuelKey: string; days: number; runOutOn: string | null };
  let covers: Cover[] = [];
  let report: TodayReport | undefined;
  let readingAt: string | null = null;
  if (stock && stock.data.cover) {
    report = stock.report;
    readingAt = stock.data.readingAt;
    covers = stock.data.cover.fuels
      .filter((f) => f.daysLeft !== null)
      .map((f) => ({ fuelKey: f.fuelKey, days: f.daysLeft!, runOutOn: f.runOutOn }));
  } else {
    const plan = snapshots(i.feed, 'load_plan', true)[0];
    if (plan) {
      report = plan.report;
      readingAt = plan.data.capturedAt;
      // One entry per fuel: the pool that runs out first.
      const byFuel = new Map<string, Cover>();
      for (const p of plan.data.pools) {
        if (p.daysLeft === null) continue;
        const cur = byFuel.get(p.product);
        if (!cur || p.daysLeft < cur.days) byFuel.set(p.product, { fuelKey: p.product, days: p.daysLeft, runOutOn: p.runOutOn });
      }
      covers = [...byFuel.values()];
    }
  }
  if (covers.length === 0) {
    return {
      id: 'stock',
      status: 'info',
      text: translate(i.lang, 'glance.stock.none'),
      serviceId: 'stock-check',
      action: 'askStock',
    };
  }
  // Counted again from the run-out date; the stored figure is only what it was on the plan's day.
  const sentences = covers
    .map((c) => {
      const left = c.runOutOn ? daysUntil(c.runOutOn, i.now) : null;
      return { days: left === null ? c.days : Math.max(0, left), c };
    })
    .sort((a, b) => a.days - b.days)
    .map(({ days, c }) => ({
      days,
      text: tnIn(i.lang, 'glance.stock.cover', days, {
        fuel: fuelName(c.fuelKey, i.lang),
        days: fmtDays(days),
        // No run-out date on the plan: the day is counted from today.
        day: fmtDay(c.runOutOn ?? indiaDay(new Date(i.now.getTime() + days * DAY_MS)), i.lang, i.now),
      }),
    }));
  const old = readingAt !== null && i.now.getTime() - Date.parse(readingAt) > STOCK_OLD_MS;
  const soonest = sentences[0]!.days;
  return {
    id: 'stock',
    // Stock is never part of the verdict: an old reading is neither fine nor a problem.
    status: old ? 'info' : soonest <= 1 ? 'attention' : 'ok',
    text: sentences[0]!.text,
    ...(sentences.length > 1 ? { more: sentences.slice(1).map((s) => s.text) } : {}),
    ...(old && readingAt ? { meta: translate(i.lang, 'glance.stock.old', { time: fmtTime(readingAt, i.lang) }) } : {}),
    serviceId: stock ? 'stock-check' : 'load-planner',
    ...(report ? { report } : {}),
  };
}

function waterRow(i: PumpNowInput): PumpNowRow | null {
  const first = snapshots(i.feed, 'water_ingress', i.role === 'owner')[0];
  if (!first || !(first.data.totalSlots > 0)) return null;
  const { report, data } = first;
  const missed = data.missedSlots > 0;
  const text = [
    translate(i.lang, 'glance.water.line', { done: fmtInt(data.recordedSlots), total: fmtInt(data.totalSlots) }),
    ...(missed ? [translate(i.lang, 'glance.water.missed', { n: fmtInt(data.missedSlots) })] : []),
  ].join(', ');
  return {
    id: 'water',
    status: missed && !isAgedAlarm(report) ? 'attention' : 'ok',
    text,
    serviceId: 'water-ingress-testing',
    report,
  };
}

function supplyRow(i: PumpNowInput): PumpNowRow | null {
  const first = snapshots(i.feed, 'ro_supply', i.role === 'owner')[0];
  if (!first || first.data.blocked === null) return null;
  const { report, data } = first;
  if (data.blocked) {
    const pending = Math.max(1, data.failingCount + data.unknownCount);
    return {
      id: 'supply',
      // Older than its day it shows as information, not as an alarm.
      status: isAgedAlarm(report) ? 'info' : 'problem',
      text: tnIn(i.lang, 'glance.supply.stopped', pending),
      serviceId: 'ro-supply-status',
      report,
    };
  }
  return { id: 'supply', status: 'ok', text: translate(i.lang, 'glance.supply.open'), serviceId: 'ro-supply-status', report };
}

function papersRow(i: PumpNowInput): PumpNowRow | null {
  const first = snapshots(i.feed, 'paper_expiry', i.role === 'owner')[0];
  const soonest = first ? soonestPaper(first.data, i.now) : null;
  if (!first || !soonest) return null;
  return {
    id: 'papers',
    status: paperStatus(soonest.days),
    text: paperSentence(paperLabel(soonest.item, i.paperName), soonest.days, i.lang),
    serviceId: 'tanker-documents',
    report: first.report,
  };
}

function declarationRow(i: PumpNowInput): PumpNowRow | null {
  const first = snapshots(i.feed, 'declaration_filed', i.role === 'owner').find(
    (s) => s.data.declaration === 'safety' && typeof s.data.streak === 'number' && s.data.streak > 0,
  );
  if (!first) return null;
  return {
    id: 'declaration',
    status: 'ok',
    text: tnIn(i.lang, 'glance.declaration.line', first.data.streak!),
    serviceId: 'dealer-declarations',
    report: first.report,
  };
}

/**
 * The rows of the "Pump now" card, in the spec's order; a row appears only when its data exists
 * (the stock row says "No stock reading yet" with a button instead of vanishing). Each row's words are
 * ready in the reader's language.
 */
export function pumpNowRows(i: PumpNowInput): PumpNowRow[] {
  const rows: Array<PumpNowRow | null> = [
    tankerRow(i),
    stockRow(i),
    waterRow(i),
    supplyRow(i),
    papersRow(i),
    declarationRow(i),
    missingSalesReport(i.feed, i.now).missing
      ? { id: 'missing', status: 'info', text: translate(i.lang, 'glance.report.missing'), serviceId: 'dsr-report' }
      : null,
  ];
  return rows.filter((r): r is PumpNowRow => r !== null);
}

// ── Coming up ───────────────────────────────────────────────────────────────

export type ComingUpId = 'deposit' | 'tanker' | 'declaration' | 'paper' | 'kavach';

export interface ComingUpItem {
  id: ComingUpId;
  /** The India day it falls on. */
  day: string;
  /** Whole days from today, counted now. */
  inDays: number;
  text: string;
  serviceId: string | null;
}

export const COMING_UP_LIMIT = 3;
export const COMING_UP_WINDOW_DAYS = 30;

/** The kinds' owner-only rule, for a reader's role. */
const mayRead = (kind: ReportKind, role: Role): boolean => role === 'owner' || !OWNER_ONLY_REPORT_KINDS.has(kind);

/**
 * The next dated things in the next 30 days, soonest first, at most three: the deposit date, the
 * tanker's arrival, the declaration due, a paper's end, a Kavach point opening. Each date is read
 * from the feed or the Kavach view the app already holds. Days already gone are not "coming up".
 */
export function comingUp(i: PumpNowInput & { kavach?: KavachDealerView | null }): ComingUpItem[] {
  const isOwner = i.role === 'owner';
  const out: ComingUpItem[] = [];
  const push = (id: ComingUpId, day: string | null | undefined, key: MessageKey, vars: TVars, serviceId: string | null) => {
    if (!day) return;
    const inDays = daysUntil(day, i.now);
    if (inDays === null || inDays < 0 || inDays > COMING_UP_WINDOW_DAYS) return;
    out.push({ id, day: day.slice(0, 10), inDays, text: translate(i.lang, key, { ...vars, day: fmtDay(day, i.lang, i.now) }), serviceId });
  };

  if (mayRead('credit_dod', i.role)) {
    const credit = snapshots(i.feed, 'credit_dod', isOwner)[0]?.data;
    if (credit && credit.verdict !== 'settled' && credit.verdict !== 'advance' && credit.money.amount > 0) {
      push('deposit', credit.money.date, 'glance.comingUp.deposit', {}, 'credit-dod-monitoring');
    }
  }
  const plan = snapshots(i.feed, 'load_plan', isOwner)[0]?.data;
  if (plan?.order) push('tanker', plan.order.arriveDate ?? plan.order.arriveOn, 'glance.comingUp.tanker', {}, 'load-planner');
  const declaration = snapshots(i.feed, 'declaration_filed', isOwner)[0]?.data;
  if (declaration) push('declaration', declaration.nextDueDay, 'glance.comingUp.declaration', {}, 'dealer-declarations');
  const papers = snapshots(i.feed, 'paper_expiry', isOwner)[0]?.data;
  for (const item of papers?.items ?? []) {
    push('paper', item.validUntil, 'glance.comingUp.paper', { paper: paperLabel(item, i.paperName) }, 'tanker-documents');
  }
  if (i.kavach?.on) {
    for (const k of i.kavach.upcoming ?? []) {
      if (!k.opensAt) continue;
      push('kavach', indiaDay(new Date(k.opensAt)), 'glance.comingUp.kavach', {}, 'kavach');
    }
  }

  return out
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => a.item.inDays - b.item.inDays || a.idx - b.idx)
    .slice(0, COMING_UP_LIMIT)
    .map((x) => x.item);
}
