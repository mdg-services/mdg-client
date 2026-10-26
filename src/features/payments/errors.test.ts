import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';

import { CheckoutError } from './checkout';
import { failureReasonKey, isNotConfigured, isTryAgainSoon, paymentErrorKey } from './errors';

describe('paymentErrorKey', () => {
  it.each([
    [new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'x'), 'payments.err.notConfigured'],
    // A 503 that is not the keys-are-off one is a busy server: try again, not "not on yet".
    [new ApiError(503, 'SOMETHING', 'x'), 'payments.err.provider'],
    [new ApiError(503, 'RAZORPAY_UNREACHABLE', 'x'), 'payments.err.provider'],
    [new ApiError(503, 'AUTOPAY_NOT_STOPPED', 'x'), 'payments.err.provider'],
    [new ApiError(503, 'INVOICE_PDF_BUSY', 'x'), 'payments.err.provider'],
    [new ApiError(503, 'HTTP_503', 'x'), 'payments.err.provider'],
    [new ApiError(409, 'PAYMENT_NOT_PAYABLE', 'x'), 'payments.err.notPayable'],
    [new ApiError(400, 'BAD_SIGNATURE', 'x'), 'payments.err.badSignature'],
    [new ApiError(429, 'RATE_LIMITED', 'x'), 'payments.err.rateLimited'],
    [new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'x'), 'payments.err.provider'],
    [new CheckoutError('script', 'x'), 'payments.err.script'],
    [new CheckoutError('invalid', 'x'), 'payments.err.window'],
    [new ApiError(0, 'NETWORK_ERROR', 'x'), 'common.networkError'],
    [new ApiError(0, 'TIMEOUT', 'x'), 'common.networkError'],
    [new ApiError(500, 'INTERNAL', 'x'), 'common.networkError'],
    [new Error('anything else'), 'common.networkError'],
  ])('maps %# to %s', (err, key) => {
    expect(paymentErrorKey(err)).toBe(key);
  });

  // The server's text is written for a developer and is in English.
  it('never passes the server’s own text on', () => {
    expect(
      paymentErrorKey(new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'BAD_REQUEST_ERROR: x')),
    ).toMatch(/^payments\.err\./);
  });
});

describe('isNotConfigured', () => {
  it('is true for the server with no Razorpay keys, by its code alone', () => {
    expect(isNotConfigured(new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'x'))).toBe(true);
    expect(isNotConfigured(new ApiError(500, 'PAYMENTS_NOT_CONFIGURED', 'x'))).toBe(true);
  });

  // A proxy answering during a restart, or a busy Razorpay, is also a 503.
  it('is false for any other 503, a dead network, or anything else', () => {
    expect(isNotConfigured(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))).toBe(false);
    expect(isNotConfigured(new ApiError(503, 'HTTP_503', 'x'))).toBe(false);
    expect(isNotConfigured(new ApiError(503, 'INVOICE_PDF_BUSY', 'x'))).toBe(false);
    expect(isNotConfigured(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(false);
    expect(isNotConfigured(new ApiError(500, 'INTERNAL', 'x'))).toBe(false);
    expect(isNotConfigured(new Error('x'))).toBe(false);
    expect(isNotConfigured(null)).toBe(false);
  });
});

describe('isTryAgainSoon', () => {
  it.each([
    new ApiError(503, 'RAZORPAY_UNREACHABLE', 'x'),
    new ApiError(503, 'AUTOPAY_NOT_STOPPED', 'x'),
    new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'x'),
    new ApiError(503, 'INVOICE_PDF_BUSY', 'x'),
    new ApiError(503, 'INVOICE_PDF_FAILED', 'x'),
    new ApiError(503, 'HTTP_503', 'x'),
  ])('is true for %#', (err) => {
    expect(isTryAgainSoon(err)).toBe(true);
  });

  it('is false for the keys-are-off answer, a 4xx, a dead network and non-errors', () => {
    expect(isTryAgainSoon(new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'x'))).toBe(false);
    expect(isTryAgainSoon(new ApiError(409, 'PAYMENT_NOT_PAYABLE', 'x'))).toBe(false);
    expect(isTryAgainSoon(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(false);
    expect(isTryAgainSoon(new Error('x'))).toBe(false);
  });
});

// Razorpay's text is English and for developers. It is read only to pick one of
// our own phrases, and never shown.
describe('failureReasonKey', () => {
  it.each([
    ['Payment processing cancelled by user', 'payments.failReason.cancelled'],
    ['Your payment has failed due to insufficient funds', 'payments.failReason.insufficient'],
    ['Your card was declined by the bank', 'payments.failReason.declined'],
    ['UPI request expired', 'payments.failReason.expired'],
    ['Payment failed. Wrong OTP entered', 'payments.failReason.auth'],
  ])('maps %j to %s', (raw, key) => {
    expect(failureReasonKey(raw)).toBe(key);
  });

  // A bare word is not enough: each of these once read as the wrong cause.
  it.each([
    'Your card has expired',
    'Payment failed because the card expired',
    'Your account is closed',
    'Bank account closed',
    'The bank server is not responding / down',
    'Payment failed due to a temporary issue with the bank',
    'Request timed out',
    'Your card is blocked',
    'Verification could not be completed',
  ])('does not guess a cause for %j', (raw) => {
    expect(failureReasonKey(raw)).toBeNull();
  });

  it('still places the clear phrases', () => {
    expect(failureReasonKey('Payment request expired')).toBe('payments.failReason.expired');
    expect(failureReasonKey('Payment was rejected by the bank')).toBe('payments.failReason.declined');
    expect(failureReasonKey('Wrong PIN entered')).toBe('payments.failReason.auth');
    expect(failureReasonKey('The customer cancelled the payment')).toBe('payments.failReason.cancelled');
    expect(failureReasonKey('Payment cancelled by customer')).toBe('payments.failReason.cancelled');
  });

  it('knows nothing of a reason it cannot place, or none at all', () => {
    expect(failureReasonKey('BAD_REQUEST_ERROR: something odd')).toBeNull();
    expect(failureReasonKey('')).toBeNull();
    expect(failureReasonKey(null)).toBeNull();
    expect(failureReasonKey(undefined)).toBeNull();
  });
});
