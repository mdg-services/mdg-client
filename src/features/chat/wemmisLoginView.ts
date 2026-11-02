import { ApiError } from '@/lib/api';
import type { MessageKey } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { WemmisResetState, WemmisResetView } from '@dk/shared/types';

/**
 * The small decisions behind the eMaaptaul login box, kept apart from the drawing
 * so they can be tested without a screen.
 */

/** eMaaptaul's OTP is four digits. */
export const OTP_LENGTH = 4;

/** The states in which the OTP boxes are on screen. */
export function showsOtpBoxes(state: WemmisResetState): boolean {
  return state === 'otp_sent' || state === 'wrong_otp' || state === 'need_captcha';
}

/**
 * What the owner typed or pasted, as the ten digits the site wants: digits only,
 * a leading +91 / 91 / 0 dropped, and nothing past ten.
 */
export function normalizeMobile(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** The site's own rule for a registered mobile (and the server's): ten digits, starting 6 to 9. */
export function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile);
}

/** "1:52" — the time left on the OTP, never below 0:00. */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** An empty set of OTP boxes. */
export function emptyOtp(): string[] {
  return Array.from({ length: OTP_LENGTH }, () => '');
}

export function otpIsComplete(digits: readonly string[]): boolean {
  return digits.length === OTP_LENGTH && digits.every((d) => /^\d$/.test(d));
}

/**
 * Put what was typed or pasted into the boxes.
 *
 *  - One digit goes in its own box, and the cursor moves on.
 *  - Several digits (a paste, or the phone's own "fill the code" from the SMS)
 *    spread over the boxes from the one they landed in — or from the first box
 *    when they are enough to fill all four, so pasting the whole code anywhere
 *    fills it all.
 *  - No digit at all (the letters the owner typed, or a backspace) empties the box.
 *  - A digit typed into a box that already holds one arrives as two digits (old
 *    and new, the cursor was not on the selection). The new one replaces the old.
 *    A paste is never read that way: two pasted digits are two digits.
 *
 * `focus` is the box the cursor goes to next, never past the last one.
 */
export function fillOtp(
  current: readonly string[],
  from: number,
  text: string,
  source: 'type' | 'paste' = 'type',
): { digits: string[]; focus: number } {
  let typed = text.replace(/\D/g, '');
  const digits = [...current];
  if (typed.length === 0) {
    digits[from] = '';
    return { digits, focus: from };
  }
  const old = current[from];
  if (source === 'type' && old && typed.length === 2) {
    typed = typed[0] === old ? typed[1]! : typed[0]!;
  }
  const start = typed.length >= OTP_LENGTH ? 0 : from;
  let i = start;
  for (const ch of typed) {
    if (i >= OTP_LENGTH) break;
    digits[i] = ch;
    i += 1;
  }
  return { digits, focus: Math.min(i, OTP_LENGTH - 1) };
}

/**
 * The words under a save of the login that did not go through. A 409 here is the
 * server saying "this is the very pair the site refused", so it is asked for again.
 */
export function wemmisSaveErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code.endsWith('SAME_AS_REFUSED')) {
      return 'chat.portalSameAsRefused';
    }
    if (err.status === 429) return 'chat.portalRateLimited';
  }
  return 'chat.portalSaveFailed';
}

/**
 * The words under a reset step that did not go through. Never the server's own
 * error text: a 409 means a reset is already running (on "Send OTP") or the step
 * is already over (on an answer), a 429 means too many tries.
 */
export function wemmisResetErrorKey(err: unknown, step: 'start' | 'answer'): MessageKey {
  if (err instanceof ApiError) {
    if (err.status === 409) return step === 'start' ? 'chat.wemmisBusy' : 'chat.wemmisMoved';
    if (err.status === 429) return 'chat.portalRateLimited';
  }
  return 'chat.wemmisSendFailed';
}

/** The server's own words for the box, in the owner's language, or null. */
export function resetMessage(view: Pick<WemmisResetView, 'message'>, lang: Lang): string | null {
  const m = view.message;
  if (!m) return null;
  const text = (lang === 'hi' ? m.hi : m.en).trim();
  return text.length > 0 ? text : null;
}
