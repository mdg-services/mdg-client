import { ApiError } from '@/lib/api';
import type { MessageKey } from '@/lib/i18n';

import { CheckoutError } from './checkout';

/**
 * True when the server has no Razorpay keys yet, and so answers EVERY payments
 * route — the reading ones too — with 503 `PAYMENTS_NOT_CONFIGURED` (ADR 0022
 * §2 rule 7). That is not a broken connection: asking again will not help, and
 * "check your network" would send the dealer looking in the wrong place.
 *
 * ONLY THE CODE SAYS SO. A 503 on its own is also what a proxy answers during a
 * restart, and what a busy Razorpay or a busy invoice printer answers; reading
 * those as "not switched on" told a dealer in the middle of paying to give up.
 */
export function isNotConfigured(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'PAYMENTS_NOT_CONFIGURED';
}

/**
 * True for a failure that is ours or Razorpay's and passes by itself: Razorpay
 * did not answer, the invoice printer is busy, or any other 503 that is not the
 * "keys are off" one. The words for it are "try again in a minute".
 */
export function isTryAgainSoon(err: unknown): boolean {
  if (!(err instanceof ApiError) || isNotConfigured(err)) return false;
  return (
    err.status === 502 ||
    err.status === 503 ||
    err.code === 'RAZORPAY_UNREACHABLE' ||
    err.code === 'AUTOPAY_NOT_STOPPED' ||
    err.code === 'PAYMENT_PROVIDER_ERROR' ||
    err.code === 'INVOICE_PDF_BUSY' ||
    err.code === 'INVOICE_PDF_FAILED'
  );
}

/**
 * Razorpay's reason for a failed try, in the dealer's words — or null when we do
 * not know it. The reason Razorpay gives is English and written for a developer
 * ("Payment processing cancelled by user"); it is only ever read here to choose
 * one of our own short phrases, never shown.
 *
 * Only whole phrases we are sure of are matched. A bare word is not enough: "card
 * expired" is not a request that ran out of time, "account closed" is not a
 * cancelled payment, and "bank server is down" is not a bank saying no. Anything
 * else is null, and the screens then say the plain "did not go through" line.
 */
export function failureReasonKey(raw: string | null | undefined): MessageKey | null {
  const text = (raw ?? '').toLowerCase();
  if (!text) return null;
  if (/insufficient (balance|funds)|not enough (balance|funds)|low balance/.test(text)) {
    return 'payments.failReason.insufficient';
  }
  if (
    /(cancell?ed|dismissed) by (the )?(user|customer)|(user|customer) (has |had )?(cancell?ed|dismissed)/.test(
      text,
    )
  ) {
    return 'payments.failReason.cancelled';
  }
  if (
    /(request|collect|link|otp|mandate)\b.{0,20}\bexpired|expired (request|link|otp)|not approved in time/.test(
      text,
    )
  ) {
    return 'payments.failReason.expired';
  }
  if (
    /\b(wrong|incorrect|invalid) (otp|pin)\b|authentication (failed|declined)|3d ?secure/.test(text)
  ) {
    return 'payments.failReason.auth';
  }
  if (/\bdeclined\b|(rejected|denied) by (the )?(bank|issuer)/.test(text)) {
    return 'payments.failReason.declined';
  }
  return null;
}

/**
 * What to tell the dealer when a step of paying failed — by the server's own
 * codes (ADR 0022 §6), never by echoing its text. Razorpay's descriptions and
 * our error messages are English and written for a developer; the dealer gets a
 * plain sentence in their language, and anything we do not recognise is the
 * app's ordinary "check your network" line.
 */
export function paymentErrorKey(err: unknown): MessageKey {
  if (err instanceof CheckoutError) {
    return err.kind === 'script' ? 'payments.err.script' : 'payments.err.window';
  }
  if (isNotConfigured(err)) return 'payments.err.notConfigured';
  if (err instanceof ApiError) {
    // A first bill an autopay approval is out for: the approval pays it, not this.
    if (err.code === 'WAITING_FOR_AUTOPAY') return 'payments.err.waitingForAutopay';
    if (err.status === 409 || err.code === 'PAYMENT_NOT_PAYABLE') return 'payments.err.notPayable';
    if (err.code === 'BAD_SIGNATURE') return 'payments.err.badSignature';
    if (err.status === 429) return 'payments.err.rateLimited';
  }
  // Razorpay or our server did not answer: "try again in a minute", not the network line.
  if (isTryAgainSoon(err)) return 'payments.err.provider';
  return 'common.networkError';
}
