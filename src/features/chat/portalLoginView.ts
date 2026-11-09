import { ApiError } from '@/lib/api';
import type { MessageKey } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import {
  PORTAL_LOGIN_SAME_AS_REFUSED,
  PORTAL_RESET_NO_USER_ID,
  PORTAL_RESET_RUNNING,
  PORTAL_RESET_TOO_MANY,
  SDMS_RESET_IN_PROGRESS,
  type PortalResetView,
} from '@dk/shared/types';

/**
 * The small decisions behind the login box, kept apart from the drawing so they
 * can be tested without a screen.
 */

const LOCALES: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN' };

/**
 * "23 Oct" — the day a login was saved, in the reader's language. The year
 * comes along only when it is not this year, as it does on the viewer's line.
 * Empty when the date cannot be read, so the box says "Saved" and nothing odd.
 */
export function portalSavedDate(iso: string, lang: Lang, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d
      .toLocaleDateString(LOCALES[lang], {
        day: 'numeric',
        month: 'short',
        ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }),
      })
      // Hindi short months end in the abbreviation sign ("अक्टू॰"), which reads
      // as a stray mark in a chat bubble. The month is recognisable without it.
      .replace(/॰/g, '')
  );
}

/**
 * The words under a save that did not go through:
 *  - the very password the portal refused → say so, and ask for the new one
 *  - too many tries (the server allows ten an hour) → wait
 *  - anything else → a plain "try again"
 */
export function portalSaveErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === PORTAL_LOGIN_SAME_AS_REFUSED) {
      return 'chat.portalSameAsRefused';
    }
    if (err.status === 409 && err.code === SDMS_RESET_IN_PROGRESS) return 'chat.portalResetBusy';
    if (err.status === 429) return 'chat.portalRateLimited';
  }
  return 'chat.portalSaveFailed';
}

/** The words under a "Forgot password?" that the server turned down. */
export function portalResetErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    if (err.code === PORTAL_RESET_TOO_MANY) return 'chat.portalResetTooMany';
    if (err.code === PORTAL_RESET_RUNNING) return 'chat.partnersResetBusy';
    if (err.code === PORTAL_RESET_NO_USER_ID) return 'chat.portalResetNeedsId';
    if (err.status === 503) return 'chat.portalResetOff';
    if (err.status === 429) return 'chat.portalRateLimited';
  }
  return 'chat.portalResetFailed';
}

/**
 * What the box says about the newest reset, or null when it says nothing. "Unclear" is a
 * reset IndianOil took but did not plainly confirm: the owner is still asked to watch for it.
 */
export function portalResetLineKey(reset: PortalResetView | undefined): MessageKey | null {
  if (!reset) return null;
  if (reset.state === 'running') return 'chat.portalResetRunning';
  if (reset.state === 'sent') return reset.unclear ? 'chat.portalResetUnclear' : 'chat.portalResetSent';
  return reset.reason === 'wrong_id' ? 'chat.portalResetWrongId' : 'chat.portalResetFailed';
}
