import { ApiError } from '@/lib/api';
import type { TFunction } from '@/lib/i18n';
import { PhotoRejected } from '@/lib/uploadMockDrillPhoto';
import type { WorkPermitDealerView, WorkPermitsMeView } from '@dk/shared/types';

/**
 * The small decisions behind the work-permit box (ADR 0053), kept apart from the
 * drawing so they can be tested without a screen.
 */

/** The permit a message's marker names, or null while the list has not arrived or no longer holds it. */
export function workPermitOf(
  data: WorkPermitsMeView | undefined,
  permitId: string,
): WorkPermitDealerView | null {
  return data?.permits.find((p) => p.id === permitId) ?? null;
}

/** Whether this message holds the live box: only the message the view names does. */
export function isLiveBox(view: WorkPermitDealerView | null, messageId: string): boolean {
  return !!view?.liveMessageId && view.liveMessageId === messageId;
}

/** A typed answer the server will take: number input keeps digits only, text is trimmed. Empty is not sent. */
export function typedAnswer(raw: string, input: 'number' | 'text'): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (input === 'number') {
    const digits = v.replace(/[\s,-]/g, '');
    return /^\d+$/.test(digits) ? digits : null;
  }
  return v.slice(0, 1000);
}

/** "22 Nov, 3:40 pm" in India's time; the day is left out when it is today. Null for nothing or a bad date. */
export function permitWhen(iso: string | undefined, lang: string, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const zone = { timeZone: 'Asia/Kolkata' } as const;
  const day = (x: Date) => x.toLocaleDateString('en-CA', zone);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const time = d.toLocaleTimeString(locale, { ...zone, hour: 'numeric', minute: '2-digit', hour12: true });
  if (day(d) === day(now)) return time;
  const date = d.toLocaleDateString(locale, { ...zone, day: 'numeric', month: 'short' });
  return `${date}, ${time}`;
}

/** A refusal in words the dealer can read: the server's own plain sentence when it sent one. */
export function workPermitsErrorText(err: unknown, t: TFunction, what: 'answer' | 'photo' | 'file'): string {
  if (err instanceof PhotoRejected) {
    return err.reason === 'size' ? t('chat.workPermitTooBig') : t('chat.workPermitBadType');
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return t('chat.portalRateLimited');
    const words = err.message.trim();
    if (what !== 'file' && err.status >= 400 && err.status < 500 && err.status !== 409 && words) return words;
  }
  if (what === 'file') return t('chat.workPermitFileFailed');
  return what === 'photo' ? t('chat.duOtpFileFailed') : t('chat.portalSaveFailed');
}
