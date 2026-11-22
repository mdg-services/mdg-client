import { ApiError } from '@/lib/api';
import type { TFunction } from '@/lib/i18n';
import type { ComplaintDealerView, ComplaintsMeView, ComplaintStep } from '@dk/shared/types';

/**
 * The small decisions behind the complaint box (ADR 0052), kept apart from the
 * drawing so they can be tested without a screen.
 */

/** The complaint a message's marker names, or null while the list has not arrived or no longer holds it. */
export function complaintOf(
  data: ComplaintsMeView | undefined,
  complaintId: string,
): ComplaintDealerView | null {
  return data?.complaints.find((c) => c.id === complaintId) ?? null;
}

/**
 * Whether this message holds the live box. Only the message the view names does:
 * an older message of the same complaint shows just its own words, so a thread
 * never carries two sets of buttons for one complaint.
 */
export function isLiveBox(view: ComplaintDealerView | null, messageId: string): boolean {
  return !!view?.liveMessageId && view.liveMessageId === messageId;
}

/** A number the dealer typed: digits with at most one point. Anything else is not sent. */
export function cleanNumber(raw: string): string | null {
  const v = raw.trim().replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(v) ? v : null;
}

/** Today as YYYY-MM-DD in India's time: the latest day a "which day did you send it?" date may be. */
export function todayInIndia(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Whether a typed or picked day is one the server will take: a real YYYY-MM-DD, not after today. */
export function dayReady(value: string, now: Date = new Date()): string | null {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v <= todayInIndia(now) ? v : null;
}

/** The steps the tracker draws: the server's own list, in its order. */
export function trackerSteps(view: ComplaintDealerView): ComplaintStep[] {
  return view.steps;
}

/** "3:40 pm" for a step's time, in the reader's own language, in India's time. */
export function stepTime(iso: string | undefined, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const zone = { timeZone: 'Asia/Kolkata' } as const;
  const day = (x: Date) => x.toLocaleDateString('en-CA', zone);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const time = d.toLocaleTimeString(locale, { ...zone, hour: 'numeric', minute: '2-digit', hour12: true });
  if (day(d) === day(now)) return time;
  const date = d.toLocaleDateString(locale, { ...zone, day: 'numeric', month: 'short' });
  return `${date}, ${time}`;
}

/** Whether a screen still wants something from the dealer. */
export function wantsAnswer(view: ComplaintDealerView): boolean {
  return (
    view.screen === 'asking' ||
    view.screen === 'confirm' ||
    view.screen === 'ack' ||
    view.screen === 'ack_reason'
  );
}

/** A refusal in words the dealer can read: the server's own plain sentence when it sent one. */
export function complaintsErrorText(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return t('chat.portalRateLimited');
    const words = err.message.trim();
    if (err.status >= 400 && err.status < 500 && err.status !== 409 && words) return words;
  }
  return t('chat.portalSaveFailed');
}
