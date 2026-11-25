import { localeOf, type TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { OWNER_ONLY_REPORT_KINDS } from '@dk/shared';
import type { ReportData, ReportDetail, ReportKind } from '@dk/shared/types';

import { timeWords } from './kinds/dsr_sales/fmt';
import type { ReportTarget } from './reportNav';
import type { ReportLoadProblem } from './useReport';

/**
 * The shell's pure decisions (ADR 0056 §4): which banner an overlay wears, how its date and
 * time are written, what its status badge says. Nothing here draws; the overlay and the history
 * row read it, and the tests pin it.
 */

const IST = 'Asia/Kolkata';

const dayFormats = new Map<Lang, Intl.DateTimeFormat>();
let istDayFormat: Intl.DateTimeFormat | undefined;

/**
 * A business day (`YYYY-MM-DD`) in words: "Mon 24 Nov", in the reader's language. Empty for a
 * value that is not a day. The day is a calendar date in India, so it is read at noon IST and
 * written in IST, and no phone's own zone can move it to the day before.
 */
export function dayWords(day: string | undefined, lang: Lang): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  let fmt = dayFormats.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
    dayFormats.set(lang, fmt);
  }
  return fmt.format(new Date(`${day}T12:00:00+05:30`));
}

/** An instant's clock in India: "10:14 am" / "सुबह 10:14", the same words the reports use. */
export function clockWords(iso: string, lang: Lang): string {
  return timeWords(iso, lang);
}

/** The Indian calendar day of an instant, `YYYY-MM-DD`. */
export function istDayOf(iso: string | Date): string {
  istDayFormat ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '' : istDayFormat.format(d);
}

/** The instant a snapshot says it is "as of", or the time the message was sent. */
export function asOfInstant(data: ReportData | undefined, sentAt: string): string {
  if (data) {
    const d = data as unknown as { capturedAt?: unknown; asOf?: unknown };
    if (typeof d.capturedAt === 'string' && d.capturedAt) return d.capturedAt;
    // A credit position's `asOf` is a day; a stock reading's is a full instant.
    if (typeof d.asOf === 'string' && d.asOf.length > 10) return d.asOf;
  }
  return sentAt;
}

/** "as of 10:14 am", and with the day ("as of 23 Nov, 10:14 am") when it is not today. */
export function asOfLabel(iso: string, now: Date, lang: Lang, t: TFunction): string {
  const time = clockWords(iso, lang);
  if (!time) return '';
  if (istDayOf(iso) === istDayOf(now)) return t('report.asOf', { time });
  const date = new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', timeZone: IST }).format(
    new Date(iso),
  );
  return t('report.asOf', { time: `${date}, ${time}` });
}

/** True while the snapshot says part of what it reports is still being worked out. */
export function isPartial(data: ReportData | undefined): boolean {
  if (!data) return false;
  if (data.kind === 'dsr_sales') return data.products.some((p) => p.sales?.state === 'pending');
  if (data.kind === 'dsr_variation') return data.products.some((p) => p.sales?.state === 'pending');
  if (data.kind === 'ro_supply') return data.read === 'partial';
  return false;
}

/** The one strip an overlay may wear, in the order the ADR fixes: deleted, newer, corrected, partial, offline. */
export type OverlayBanner =
  | { kind: 'deleted' }
  | { kind: 'newer'; target: ReportTarget }
  | { kind: 'corrected' }
  | { kind: 'partial' }
  | { kind: 'offline' };

export interface BannerInput {
  detail: ReportDetail;
  data: ReportData | undefined;
  /** The server has just said the message is gone, and the overlay still holds the copy it had. */
  goneNow: boolean;
  /** The phone is offline, or the last refresh failed, and what is on screen is what was saved. */
  offline: boolean;
}

export function pickBanner(input: BannerInput): OverlayBanner | null {
  const { detail, data, goneNow, offline } = input;
  if (detail.live.deleted || goneNow) return { kind: 'deleted' };
  if (detail.live.newerMessageId) {
    return {
      kind: 'newer',
      target: {
        conversationId: detail.live.newerConversationId ?? detail.conversationId,
        messageId: detail.live.newerMessageId,
      },
    };
  }
  if (detail.live.corrected) return { kind: 'corrected' };
  if (isPartial(data)) return { kind: 'partial' };
  if (offline) return { kind: 'offline' };
  return null;
}

/** An owner's report, and a reader who is not the owner. */
export function blockedForRole(kind: ReportKind | undefined, role: string | undefined): boolean {
  return !!kind && role !== 'dealer-owner' && OWNER_ONLY_REPORT_KINDS.has(kind);
}

/**
 * Which full-screen message a report that would not open gets. A 404 is both "not yours to
 * read" (a manager and the owner's report) and "not here", and the server says the same to
 * both on purpose. A manager is told it is the owner's only when the kind is known to be an
 * owner's; otherwise (and for the owner) it is simply not here.
 */
export type ReportEmptyState = 'gone' | 'owner_only' | 'not_here' | 'offline' | 'error';

export function emptyStateFor(
  problem: ReportLoadProblem,
  opts: { kind?: ReportKind; role?: string },
): ReportEmptyState {
  if (problem === 'gone') return 'gone';
  if (problem === 'not_available') {
    // "For the owner only" is said only when the report is KNOWN to be an owner's kind: with no
    // kind to go by it may as well be another pump's or a message that is gone, and a wrong
    // reason said with a straight face is worse than the plain "not here".
    return blockedForRole(opts.kind, opts.role) ? 'owner_only' : 'not_here';
  }
  return problem === 'offline' ? 'offline' : 'error';
}
