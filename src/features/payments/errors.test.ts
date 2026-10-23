import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';

import { CheckoutError } from './checkout';
import { isNotConfigured, paymentErrorKey } from './errors';

describe('paymentErrorKey', () => {
  it.each([
    [new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'x'), 'payments.err.notConfigured'],
    [new ApiError(503, 'SOMETHING', 'x'), 'payments.err.notConfigured'],
    [new ApiError(409, 'PAYMENT_NOT_PAYABLE', 'x'), 'payments.err.notPayable'],
    [new ApiError(400, 'BAD_SIGNATURE', 'x'), 'payments.err.badSignature'],
    [new ApiError(429, 'RATE_LIMITED', 'x'), 'payments.err.rateLimited'],
    [new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'x'), 'payments.err.provider'],
    [new CheckoutError('script', 'x'), 'payments.err.script'],
    [new CheckoutError('invalid', 'x'), 'payments.err.window'],
    [new ApiError(0, 'NETWORK_ERROR', 'x'), 'common.networkError'],
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
  it('is true for the server with no Razorpay keys, by status or by code', () => {
    expect(isNotConfigured(new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'x'))).toBe(true);
    expect(isNotConfigured(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))).toBe(true);
    expect(isNotConfigured(new ApiError(500, 'PAYMENTS_NOT_CONFIGURED', 'x'))).toBe(true);
  });

  it('is false for anything else, including a dead network', () => {
    expect(isNotConfigured(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(false);
    expect(isNotConfigured(new ApiError(500, 'INTERNAL', 'x'))).toBe(false);
    expect(isNotConfigured(new Error('x'))).toBe(false);
    expect(isNotConfigured(null)).toBe(false);
  });
});
