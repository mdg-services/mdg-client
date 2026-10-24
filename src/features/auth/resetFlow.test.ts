import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';

import {
  RESEND_AFTER_SECONDS,
  cleanCode,
  isWholeCode,
  offeredChannels,
  resetErrorKey,
  resetHasExpired,
  secondsUntilResend,
} from './resetFlow';

describe('offeredChannels', () => {
  it('is the channels the server says are on, WhatsApp first', () => {
    expect(offeredChannels({ whatsapp: true, email: true })).toEqual(['whatsapp', 'email']);
    expect(offeredChannels({ whatsapp: true, email: false })).toEqual(['whatsapp']);
    expect(offeredChannels({ whatsapp: false, email: true })).toEqual(['email']);
  });

  it('is nothing when neither is on, the answer is not in, or it is not what was expected', () => {
    expect(offeredChannels({ whatsapp: false, email: false })).toEqual([]);
    expect(offeredChannels(undefined)).toEqual([]);
    // Only a true boolean turns a channel on: a string or a number from a strange answer does not.
    expect(offeredChannels({ whatsapp: 'yes', email: 1 } as never)).toEqual([]);
  });
});

describe('cleanCode', () => {
  it('keeps the digits only, and no more than six', () => {
    expect(cleanCode('482913')).toBe('482913');
    expect(cleanCode(' 482 913 ')).toBe('482913');
    expect(cleanCode('482-913')).toBe('482913');
    expect(cleanCode('4829139999')).toBe('482913');
    expect(cleanCode('ab12')).toBe('12');
  });

  it('takes Hindi digits', () => {
    expect(cleanCode('४८२९१३')).toBe('482913');
  });

  it('is whole at six digits and not before', () => {
    expect(isWholeCode('48291')).toBe(false);
    expect(isWholeCode('482913')).toBe(true);
    expect(isWholeCode('')).toBe(false);
  });
});

describe('secondsUntilResend', () => {
  it('counts down from thirty, whole seconds, rounding up', () => {
    expect(RESEND_AFTER_SECONDS).toBe(30);
    expect(secondsUntilResend(1_000, 1_000)).toBe(30);
    expect(secondsUntilResend(1_000, 1_001)).toBe(30);
    expect(secondsUntilResend(1_000, 11_000)).toBe(20);
    expect(secondsUntilResend(1_000, 30_500)).toBe(1);
  });

  it('is zero from thirty seconds on, and never negative', () => {
    expect(secondsUntilResend(1_000, 31_000)).toBe(0);
    expect(secondsUntilResend(1_000, 500_000)).toBe(0);
    // A clock that went backwards (the phone's own) never shows more than thirty.
    expect(secondsUntilResend(10_000, 5_000)).toBe(30);
  });
});

describe('resetErrorKey', () => {
  const fail = (status: number, code: string) => new ApiError(status, code, 'whatever the server said');

  it('says a wrong, old or used code in one sentence', () => {
    expect(resetErrorKey(fail(400, 'RESET_CODE_INVALID'))).toBe('auth.resetCodeInvalid');
  });

  it('says a reset that ran out has run out', () => {
    expect(resetErrorKey(fail(400, 'RESET_TOKEN_INVALID'))).toBe('auth.resetExpired');
    expect(resetHasExpired(fail(400, 'RESET_TOKEN_INVALID'))).toBe(true);
    expect(resetHasExpired(fail(400, 'RESET_CODE_INVALID'))).toBe(false);
    expect(resetHasExpired(new Error('x'))).toBe(false);
  });

  it('asks to wait on too many tries, whatever the code', () => {
    expect(resetErrorKey(fail(429, 'RATE_LIMITED'))).toBe('auth.tooManyTries');
  });

  it('is the network sentence for anything else, never the server\'s words', () => {
    expect(resetErrorKey(fail(500, 'INTERNAL'))).toBe('common.networkError');
    expect(resetErrorKey(fail(400, 'VALIDATION_ERROR'))).toBe('common.networkError');
    expect(resetErrorKey(new ApiError(0, 'NETWORK_ERROR', 'offline'))).toBe('common.networkError');
    expect(resetErrorKey(new TypeError('Failed to fetch'))).toBe('common.networkError');
  });
});
