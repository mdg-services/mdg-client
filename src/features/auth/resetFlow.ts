import { digitsOf } from '@/features/register/enroll';
import { ApiError } from '@/lib/api';
import type { MessageKey } from '@/lib/i18n';
import {
  PASSWORD_RESET_CODE_LENGTH,
  type PasswordResetChannel,
  type PasswordResetOptions,
} from '@dk/shared/schemas';

/**
 * The small decisions behind the "forgot password" sheet, kept apart from the
 * drawing so they can be tested without a screen.
 */

/** How long "Send again" waits after a code went out (the server allows three an hour). */
export const RESEND_AFTER_SECONDS = 30;

/** The error code of a wrong, expired or used-up code (`POST /password-reset/verify`). */
export const RESET_CODE_INVALID = 'RESET_CODE_INVALID';
/** The error code of a reset token that has expired or was already used (`/confirm`). */
export const RESET_TOKEN_INVALID = 'RESET_TOKEN_INVALID';

/**
 * The channels to offer, in the order the sheet shows them. These are the ones the
 * SERVER can send on at all (`GET /password-reset/options`); they say nothing about
 * any account. Empty while the answer is not in, when it could not be had, or when
 * neither channel is on — and then the sheet is only "the team will call you".
 */
export function offeredChannels(options: PasswordResetOptions | undefined): PasswordResetChannel[] {
  const out: PasswordResetChannel[] = [];
  if (options?.whatsapp === true) out.push('whatsapp');
  if (options?.email === true) out.push('email');
  return out;
}

/**
 * What was typed into the code box, as the server wants it: digits only (spaces
 * and dashes from a pasted "123 456" go, Hindi digits become plain ones) and no
 * more than six.
 */
export function cleanCode(raw: string): string {
  return digitsOf(raw).slice(0, PASSWORD_RESET_CODE_LENGTH);
}

export function isWholeCode(code: string): boolean {
  return code.length === PASSWORD_RESET_CODE_LENGTH;
}

/**
 * Whole seconds until "Send again" works: never below zero, and never above the
 * wait itself, so a phone whose clock went backwards cannot make it longer.
 */
export function secondsUntilResend(sentAt: number, now: number): number {
  const left = Math.ceil((sentAt + RESEND_AFTER_SECONDS * 1000 - now) / 1000);
  return Math.min(RESEND_AFTER_SECONDS, Math.max(0, left));
}

/**
 * The one sentence under a step that did not go through. Never the server's own
 * words.
 *  - a wrong, expired or used-up code → the sheet says so and keeps the box
 *  - a reset that has run out → start again (the caller restarts)
 *  - too many tries → wait
 *  - anything else → check the network
 */
export function resetErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'auth.tooManyTries';
    if (err.code === RESET_CODE_INVALID) return 'auth.resetCodeInvalid';
    if (err.code === RESET_TOKEN_INVALID) return 'auth.resetExpired';
  }
  return 'common.networkError';
}

/** Whether a failure of the last step means the whole reset is over and must start again. */
export function resetHasExpired(err: unknown): boolean {
  return err instanceof ApiError && err.code === RESET_TOKEN_INVALID;
}
