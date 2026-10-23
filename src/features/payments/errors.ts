import { ApiError } from '@/lib/api';
import type { MessageKey } from '@/lib/i18n';

import { CheckoutError } from './checkout';

/**
 * True when the server has no Razorpay keys yet, and so answers EVERY payments
 * route — the reading ones too — with 503 `PAYMENTS_NOT_CONFIGURED` (ADR 0022
 * §2 rule 7). That is not a broken connection: asking again will not help, and
 * "check your network" would send the dealer looking in the wrong place.
 */
export function isNotConfigured(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 503 || err.code === 'PAYMENTS_NOT_CONFIGURED');
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
    if (err.status === 409 || err.code === 'PAYMENT_NOT_PAYABLE') return 'payments.err.notPayable';
    if (err.code === 'BAD_SIGNATURE') return 'payments.err.badSignature';
    if (err.status === 429) return 'payments.err.rateLimited';
    if (err.status === 502 || err.code === 'PAYMENT_PROVIDER_ERROR') return 'payments.err.provider';
  }
  return 'common.networkError';
}
