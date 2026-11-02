import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { PORTAL_LOGIN_SAME_AS_REFUSED, WEMMIS_RESET_STATES } from '@dk/shared/types';

import {
  OTP_LENGTH,
  emptyOtp,
  fillOtp,
  formatCountdown,
  isValidMobile,
  normalizeMobile,
  otpIsComplete,
  resetMessage,
  showsOtpBoxes,
  wemmisResetErrorKey,
  wemmisSaveErrorKey,
} from './wemmisLoginView';

describe('normalizeMobile', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['98765-43210', '9876543210'],
    ['98765432109999', '9876543210'],
    ['abc', ''],
    ['', ''],
  ])('%j → %j', (raw, want) => {
    expect(normalizeMobile(raw)).toBe(want);
  });

  it('keeps a half-typed number as typed', () => {
    expect(normalizeMobile('98765')).toBe('98765');
  });
});

describe('isValidMobile', () => {
  it('wants ten digits starting 6 to 9', () => {
    expect(isValidMobile('9876543210')).toBe(true);
    expect(isValidMobile('6000000000')).toBe(true);
    expect(isValidMobile('5876543210')).toBe(false);
    expect(isValidMobile('987654321')).toBe(false);
    expect(isValidMobile('98765432100')).toBe(false);
    expect(isValidMobile('')).toBe(false);
  });
});

describe('formatCountdown', () => {
  it.each([
    [112_000, '1:52'],
    [120_000, '2:00'],
    [59_001, '1:00'],
    [9_000, '0:09'],
    [1, '0:01'],
    [0, '0:00'],
    [-5_000, '0:00'],
  ])('%i ms → %s', (ms, want) => {
    expect(formatCountdown(ms)).toBe(want);
  });
});

describe('showsOtpBoxes', () => {
  it('is the three states in which the owner types the code', () => {
    expect(WEMMIS_RESET_STATES.filter((s) => showsOtpBoxes(s))).toEqual([
      'otp_sent',
      'wrong_otp',
      'need_captcha',
    ]);
  });
});

describe('otpIsComplete', () => {
  it('needs all four digits', () => {
    expect(otpIsComplete(['4', '8', '2', '1'])).toBe(true);
    expect(otpIsComplete(['4', '8', '2', ''])).toBe(false);
    expect(otpIsComplete(emptyOtp())).toBe(false);
    expect(otpIsComplete(['4', '8', '2'])).toBe(false);
    expect(otpIsComplete(['4', 'x', '2', '1'])).toBe(false);
  });

  it('starts with four empty boxes', () => {
    expect(emptyOtp()).toEqual(['', '', '', '']);
    expect(emptyOtp()).toHaveLength(OTP_LENGTH);
  });
});

describe('fillOtp', () => {
  const E = emptyOtp();

  it('one digit goes in its own box and the cursor moves on', () => {
    expect(fillOtp(E, 0, '4')).toEqual({ digits: ['4', '', '', ''], focus: 1 });
    expect(fillOtp(['4', '', '', ''], 1, '8')).toEqual({ digits: ['4', '8', '', ''], focus: 2 });
  });

  it('the cursor stays on the last box after the last digit', () => {
    expect(fillOtp(['4', '8', '2', ''], 3, '1')).toEqual({
      digits: ['4', '8', '2', '1'],
      focus: 3,
    });
  });

  it('a whole code fills all four from the first box, wherever it landed', () => {
    expect(fillOtp(E, 0, '4821').digits).toEqual(['4', '8', '2', '1']);
    expect(fillOtp(E, 2, '4821').digits).toEqual(['4', '8', '2', '1']);
    expect(fillOtp(E, 3, ' 4 8 2 1 ', 'paste').digits).toEqual(['4', '8', '2', '1']);
  });

  it('more than four digits keeps the first four', () => {
    expect(fillOtp(E, 0, '482199').digits).toEqual(['4', '8', '2', '1']);
  });

  it('a short paste spreads from the box it landed in', () => {
    expect(fillOtp(E, 1, '48', 'paste')).toEqual({ digits: ['', '4', '8', ''], focus: 3 });
  });

  it('a short paste never runs past the last box', () => {
    expect(fillOtp(E, 3, '48', 'paste').digits).toEqual(['', '', '', '4']);
  });

  it('typing over a filled box takes the new digit, whichever side the cursor was on', () => {
    expect(fillOtp(['5', '', '', ''], 0, '57').digits).toEqual(['7', '', '', '']);
    expect(fillOtp(['5', '', '', ''], 0, '75').digits).toEqual(['7', '', '', '']);
    expect(fillOtp(['5', '', '', ''], 0, '55').digits).toEqual(['5', '', '', '']);
  });

  it('two pasted digits are two digits, even into a filled box', () => {
    expect(fillOtp(['5', '', '', ''], 0, '57', 'paste').digits).toEqual(['5', '7', '', '']);
  });

  it('letters and a delete empty the box and keep the cursor there', () => {
    expect(fillOtp(['4', '8', '', ''], 1, '')).toEqual({ digits: ['4', '', '', ''], focus: 1 });
    expect(fillOtp(['4', '8', '', ''], 1, 'x')).toEqual({ digits: ['4', '', '', ''], focus: 1 });
  });

  it('does not change the boxes it was given', () => {
    const before = ['4', '', '', ''];
    fillOtp(before, 1, '8');
    expect(before).toEqual(['4', '', '', '']);
  });
});

describe('wemmisSaveErrorKey', () => {
  it('a 409 that says "same as refused" asks for the new password', () => {
    expect(wemmisSaveErrorKey(new ApiError(409, 'WEMMIS_LOGIN_SAME_AS_REFUSED', 'x'))).toBe(
      'chat.portalSameAsRefused',
    );
    expect(wemmisSaveErrorKey(new ApiError(409, PORTAL_LOGIN_SAME_AS_REFUSED, 'x'))).toBe(
      'chat.portalSameAsRefused',
    );
  });

  it('too many tries asks to wait', () => {
    expect(wemmisSaveErrorKey(new ApiError(429, 'RATE_LIMITED', 'x'))).toBe(
      'chat.portalRateLimited',
    );
  });

  it('anything else is a plain "try again"', () => {
    expect(wemmisSaveErrorKey(new ApiError(409, 'OTHER', 'x'))).toBe('chat.portalSaveFailed');
    expect(wemmisSaveErrorKey(new ApiError(500, 'BOOM', 'x'))).toBe('chat.portalSaveFailed');
    expect(wemmisSaveErrorKey(new Error('offline'))).toBe('chat.portalSaveFailed');
    expect(wemmisSaveErrorKey('nope')).toBe('chat.portalSaveFailed');
  });
});

describe('wemmisResetErrorKey', () => {
  it('a 409 on Send OTP means a reset is already running', () => {
    expect(wemmisResetErrorKey(new ApiError(409, 'X', 'x'), 'start')).toBe('chat.wemmisBusy');
  });

  it('a 409 on an answer means that step is already over', () => {
    expect(wemmisResetErrorKey(new ApiError(409, 'X', 'x'), 'answer')).toBe('chat.wemmisMoved');
  });

  it('a 429 asks to wait, on either step', () => {
    expect(wemmisResetErrorKey(new ApiError(429, 'X', 'x'), 'start')).toBe(
      'chat.portalRateLimited',
    );
    expect(wemmisResetErrorKey(new ApiError(429, 'X', 'x'), 'answer')).toBe(
      'chat.portalRateLimited',
    );
  });

  it('anything else is a plain "couldn\'t send"', () => {
    expect(wemmisResetErrorKey(new ApiError(500, 'X', 'x'), 'start')).toBe('chat.wemmisSendFailed');
    expect(wemmisResetErrorKey(new ApiError(0, 'NETWORK_ERROR', 'x'), 'answer')).toBe(
      'chat.wemmisSendFailed',
    );
    expect(wemmisResetErrorKey(new Error('offline'), 'answer')).toBe('chat.wemmisSendFailed');
  });
});

describe('resetMessage', () => {
  const message = { en: 'The site is slow.', hi: 'साइट धीमी है।' };

  it("picks the owner's language", () => {
    expect(resetMessage({ message }, 'en')).toBe('The site is slow.');
    expect(resetMessage({ message }, 'hi')).toBe('साइट धीमी है।');
  });

  it('is null when there are no words, or only blanks', () => {
    expect(resetMessage({ message: null }, 'en')).toBeNull();
    expect(resetMessage({ message: { en: '  ', hi: 'x' } }, 'en')).toBeNull();
  });
});
