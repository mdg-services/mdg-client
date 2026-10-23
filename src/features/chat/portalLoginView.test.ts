import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { PORTAL_LOGIN_SAME_AS_REFUSED } from '@dk/shared/types';

import { portalSaveErrorKey, portalSavedDate } from './portalLoginView';

describe('portalSavedDate', () => {
  const now = new Date(2026, 9, 23, 12);
  it('is day and short month this year, in the reader’s language', () => {
    const iso = new Date(2026, 9, 21, 10).toISOString();
    expect(portalSavedDate(iso, 'en', now)).toBe('21 Oct');
    expect(portalSavedDate(iso, 'hi', now)).toMatch(/^21 /);
    expect(portalSavedDate(iso, 'hi', now)).not.toBe('21 Oct');
  });
  it('adds the year when it is not this year', () => {
    expect(portalSavedDate(new Date(2025, 11, 30, 10).toISOString(), 'en', now)).toBe(
      '30 Dec 2025',
    );
  });
  it('is empty for a date that cannot be read', () => {
    expect(portalSavedDate('not a date', 'en', now)).toBe('');
  });
});

describe('portalSaveErrorKey', () => {
  it('a 409 on the refused password gets its own words', () => {
    expect(
      portalSaveErrorKey(new ApiError(409, PORTAL_LOGIN_SAME_AS_REFUSED, 'same')),
    ).toBe('chat.portalSameAsRefused');
  });
  it('a 409 for any other reason is just a failure', () => {
    expect(portalSaveErrorKey(new ApiError(409, 'SOMETHING_ELSE', 'x'))).toBe(
      'chat.portalSaveFailed',
    );
  });
  it('a 429 says to wait', () => {
    expect(portalSaveErrorKey(new ApiError(429, 'RATE_LIMITED', 'x'))).toBe(
      'chat.portalRateLimited',
    );
  });
  it('anything else is "try again"', () => {
    expect(portalSaveErrorKey(new ApiError(500, 'INTERNAL', 'x'))).toBe('chat.portalSaveFailed');
    expect(portalSaveErrorKey(new Error('offline'))).toBe('chat.portalSaveFailed');
    expect(portalSaveErrorKey(undefined)).toBe('chat.portalSaveFailed');
  });
});
