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
 * The small decisions behind the Today page, kept apart from the drawing so they can be tested without
 * a screen (ADR 0055 section 2, ADR 0056 section 3). What the page SAYS (the verdict, Needs you, the
 * four numbers, the two cards' rows) is decided by the glance model (`features/glance`); this file
 * holds the rules under it that need no report kind's drawing code: who may read a snapshot, the
 * business day of a report, what a task's button does, which work an open task already covers.
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

// ── Needs you ───────────────────────────────────────────────────────────────

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

/**
 * The newest reports that are not already a row elsewhere on Today ("New reports" under Done for you):
 * newest first, and never an owner's own report to a manager. `shown` holds the ids of the reports a
 * Needs-you row already opens.
 */
export function newReportsFor(feed: TodayFeed, isOwner: boolean, shown: ReadonlySet<string>): TodayReport[] {
  return newestFirst(
    feed.reports.filter((r) => !shown.has(r.messageId) && (isOwner || !OWNER_ONLY_REPORT_KINDS.has(r.kind))),
  );
}

/** What MDG finished, newest first. */
export function doneReports(feed: TodayFeed): TodayReport[] {
  return newestFirst(feed.done);
}

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
