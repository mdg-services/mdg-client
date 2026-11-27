import type { KindTile } from '@/features/reports/types';
import type { TFunction } from '@/lib/i18n';
import { localeOf } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { OWNER_ONLY_REPORT_KINDS, reportDataOf } from '@dk/shared';
import type {
  DsrSalesData,
  ReportData,
  ReportKind,
  TodayFeed,
  TodayReport,
  TodayTask,
} from '@dk/shared/types';

/**
 * The small decisions behind the Today page, kept apart from the drawing so they
 * can be tested without a screen (ADR 0055 §2, ADR 0056 §3).
 *
 * The page is built from the feed in four lists: what the dealer must do (`tasks`),
 * what needs a look (`alerts`, read from each report's own view), the numbers of the
 * day (`tiles`, in a fixed order) and what MDG finished (`done`). A report with no
 * snapshot (sent before snapshots existed) has no view to ask: it stays reachable as an
 * "earlier report" and the overlay opens its old picture.
 */

// ── what a report's snapshot says ───────────────────────────────────────────

/**
 * The report's snapshot if this reader may use it, else undefined. Checks the envelope
 * again (an unknown version or a mismatched kind is "no snapshot", never half a drawing),
 * and keeps a manager away from an owner-only kind whatever the server sent.
 */
export function usableData(report: TodayReport, isOwner: boolean): ReportData | undefined {
  if (!isOwner && OWNER_ONLY_REPORT_KINDS.has(report.kind)) return undefined;
  return reportDataOf(report.data, report.kind);
}

export function newestFirst(list: readonly TodayReport[]): TodayReport[] {
  return [...list].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** The business day a report is about: the day on its snapshot, else the tag's, else the day it was sent. */
export function dayOf(report: TodayReport, data?: ReportData): string {
  const fromData = data && 'businessDate' in data ? data.businessDate : undefined;
  return fromData ?? report.day ?? report.sentAt.slice(0, 10);
}

// ── Your work ───────────────────────────────────────────────────────────────

/** How many cards of each list show before "N more". */
export const WORK_LIMIT = 3;
export const ALERT_LIMIT = 3;
export const DONE_LIMIT = 3;
export const EARLIER_LIMIT = 4;

/**
 * The tasks the page lists. While the pump is still being set up the setup block above
 * already carries that step with its own button, so the feed's `setup` task is not
 * repeated as a card ("each item exists once").
 */
export function workTasks(feed: TodayFeed, setupShown: boolean): TodayTask[] {
  return feed.tasks.filter((x) => !(setupShown && x.kind === 'setup'));
}

/** True for the task whose button picks a photo here, without leaving the page. */
export function isPhotoTask(task: TodayTask): task is TodayTask & { action: { type: 'photo'; askRef: string; acceptsFile: boolean } } {
  return task.action?.type === 'photo' && !!task.action.askRef;
}

/** Which of the page's button labels a task wears (the keys live in `today.act.*`). */
export type TaskActionLabel = 'photo' | 'file' | 'open' | 'login' | 'order';

export function taskActionLabel(task: TodayTask): TaskActionLabel {
  if (isPhotoTask(task)) return task.action.acceptsFile ? 'file' : 'photo';
  switch (task.kind) {
    case 'portal_login':
    case 'wemmis_login':
    case 'password_pick':
      return 'login';
    case 'fuel_confirm':
      return 'order';
    default:
      return 'open';
  }
}

/**
 * Does an open task of the dealer's own ALREADY ask for what this report's alert would? The page
 * shows a thing once: when the work is under "Your work" (with its button on the card), the same
 * thing is not repeated under "Needs a look".
 *
 *  - the DU OTP report is the alert above the DU OTP steps: the steps are the task,
 *  - a declaration or a mock drill report that needs the dealer is the box of that job,
 */
export function taskCoversReport(tasks: readonly TodayTask[], kind: ReportKind): boolean {
  switch (kind) {
    case 'du_otp':
      return tasks.some((t) => t.kind === 'du_otp');
    case 'declaration_filed':
      return tasks.some((t) => t.kind === 'declarations');
    case 'mock_drill':
      return tasks.some((t) => t.kind === 'mock_drill');
    default:
      return false;
  }
}

// ── Your pump today ─────────────────────────────────────────────────────────

/**
 * Kinds whose reports are each about one vehicle or one order: Needs-a-look keeps every report of
 * them (the feed has already reduced them to the newest per vehicle or order), not only the newest
 * of the kind.
 */
export const ALERT_PER_REPORT_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>([
  'tt_ack',
  'tanker_density',
  'fuel_order',
]);

/** The tiles, in the one order the dealer's thumb learns: never reshuffled by status. */
export type TileSlotId = 'sales' | 'stock' | 'variation' | 'dues' | 'water' | 'tanker';

export interface TileSlotSpec {
  id: TileSlotId;
  /** The kinds whose newest report can fill the slot (the newest of them wins). */
  kinds: readonly ReportKind[];
  /** Spans both columns. */
  wide?: boolean;
  /** The owner's alone. */
  ownerOnly?: boolean;
}

export const TILE_SLOTS: readonly TileSlotSpec[] = [
  { id: 'sales', kinds: ['dsr_sales'], wide: true },
  { id: 'stock', kinds: ['stock_check'] },
  { id: 'variation', kinds: ['dsr_variation'] },
  { id: 'dues', kinds: ['credit_dod'], ownerOnly: true },
  { id: 'water', kinds: ['water_ingress'] },
  { id: 'tanker', kinds: ['load_plan', 'fuel_order'] },
];

export interface TileItem {
  slot: TileSlotSpec;
  /** The report the tile opens. */
  report: TodayReport;
  /** The kind of the snapshot the tile is read from (the slot's, except a tanker slot). */
  kind: ReportKind;
  tile: KindTile;
  /** The business day the figures are about (YYYY-MM-DD): a tile may hold a report from days ago. */
  day: string;
}

/**
 * One message can carry both DSR sheets and is tagged as the variation (the feed then does
 * not list a separate sales row for that day). The sales tile reads the sales sheet out of
 * it: the same products with their `sales` blocks, as a sales snapshot.
 */
export function salesSheetOf(data: ReportData | undefined): DsrSalesData | undefined {
  // Only the envelope of a snapshot is checked on the way in, so the parts are checked here.
  if (data?.kind !== 'dsr_variation' || !Array.isArray(data.sheets) || !data.sheets.includes('sales')) return undefined;
  if (!Array.isArray(data.products)) return undefined;
  const products = data.products.flatMap((p) => {
    const { variation: _variation, sales, ...base } = p;
    return sales ? [{ ...base, sales }] : [];
  });
  if (products.length === 0) return undefined;
  return {
    kind: 'dsr_sales',
    v: 1,
    capturedAt: data.capturedAt,
    outletCode: data.outletCode,
    businessDate: data.businessDate,
    shiftTime: data.shiftTime,
    revised: data.revised,
    ...(data.revision ? { revision: data.revision } : {}),
    products,
  };
}

/** The slots a still-being-set-up pump shows as dashed ghosts. */
export function ghostSlots(isOwner: boolean): TileSlotSpec[] {
  return TILE_SLOTS.filter((s) => ['sales', 'stock', 'dues', 'water'].includes(s.id) && (isOwner || !s.ownerOnly));
}

/**
 * Reports with no snapshot that are not already a card above: an older message the
 * dealer can still open (the overlay shows its picture), newest first.
 */
export function earlierReports(feed: TodayFeed, isOwner: boolean, shown: ReadonlySet<string>): TodayReport[] {
  return newestFirst(
    feed.reports.filter(
      (r) =>
        !shown.has(r.messageId) &&
        !usableData(r, isOwner) &&
        (isOwner || !OWNER_ONLY_REPORT_KINDS.has(r.kind)),
    ),
  );
}

/** What MDG finished, newest first. */
export function doneReports(feed: TodayFeed): TodayReport[] {
  return newestFirst(feed.done);
}

/** True when there is nothing at all to draw: the clean empty state. */
export function feedIsEmpty(feed: TodayFeed): boolean {
  return feed.tasks.length + feed.reports.length + feed.done.length === 0;
}

/**
 * The page's grey text sits straight on the wallpaper (#f3f2f0), where the chat's grey (#667781)
 * reads at 4.15:1, short of the 4.5:1 the page promises. Inside Today the grey is this darker one
 * (5.4:1 on the wallpaper, more on white); the chat keeps its own.
 */
export const TODAY_META_CLASS = '[--wa-meta:#546570]';
export const TODAY_WALLPAPER = '#f3f2f0';

// ── Greeting ────────────────────────────────────────────────────────────────

/**
 * The first name to greet, or null. A login with no real name (a phone number or an email
 * stored as the name, "Owner", "Sir") gets the bare greeting: a wrong name is worse than none.
 */
export function greetingName(name: string | null | undefined): string | null {
  const full = (name ?? '').trim();
  if (!full || /[@\d]/.test(full)) return null;
  const words = full.split(/\s+/);
  // A firm's name ("M/S Sharma Fuels") is not a person: no name is better than the wrong one.
  if (/^m\/?s\.?$/i.test(words[0] ?? '')) return null;
  // Skip the titles in front of a name ("Dr Ramesh Kumar" is greeted as Ramesh).
  let i = 0;
  while (i < words.length - 1 && HONORIFIC.test(words[i] ?? '')) i += 1;
  const first = words[i] ?? '';
  if (!first || first.length > 24) return null;
  // Initials ("R K Sharma", "R.K."), a bare title, or anything with a stop or slash in it is not a first name.
  if ([...first].length < 2 || /[./]/.test(first) || HONORIFIC.test(first)) return null;
  if (/^(sir|madam|owner|manager|dealer|admin|staff|user)$/i.test(first)) return null;
  return first;
}

const HONORIFIC =
  /^(dr|mr|mrs|ms|miss|shri|shree|sri|smt|shrimati|er|ca|prof|sh|late|श्री|श्रीमती|डॉ|डा|स्व)\.?$/i;

// ── Days ────────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The Indian calendar day (YYYY-MM-DD) of an instant. */
export function istDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function dayNumber(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/**
 * The date a report wears: "आज" / "कल" / "22 नवंबर" in the reader's language. It is
 * the business day the card is about (`day`), else the day it was sent — a DSR sent
 * at 12:20 am for yesterday says yesterday, not today.
 */
export function reportDayLabel(
  report: Pick<TodayReport, 'day' | 'sentAt'>,
  today: string,
  lang: Lang,
  t: TFunction,
): string {
  const day = report.day && dayNumber(report.day) !== null ? report.day : istDay(report.sentAt);
  const n = day ? dayNumber(day) : null;
  const now = dayNumber(today);
  if (day === null || n === null) return '';
  if (now !== null) {
    if (n === now) return t('today.dayToday');
    if (n === now - 1) return t('today.dayYesterday');
  }
  return new Date(n * 86_400_000).toLocaleDateString(localeOf(lang), {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "Tuesday, 24 November": the date line under the greeting. */
export function todayHeading(today: string | undefined, lang: Lang, now: Date = new Date()): string {
  const n = today ? dayNumber(today) : null;
  const date = n === null ? now : new Date(n * 86_400_000);
  return date.toLocaleDateString(localeOf(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(n === null ? {} : { timeZone: 'UTC' }),
  });
}

/** The path of the overlay for a report: the one door every opener uses (ADR 0056 §4). */
export function reportPath(r: Pick<TodayReport, 'conversationId' | 'messageId'>): string {
  return `/report/${encodeURIComponent(r.conversationId)}/${encodeURIComponent(r.messageId)}`;
}
