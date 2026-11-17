import { describe, expect, it } from 'vitest';

import type { OutletSetupView } from '@dk/shared/types';

import {
  billBanner,
  canClose,
  daysBetween,
  formatCountdown,
  hiddenToday,
  showSendAgain,
} from './billBannerView';

function view(over: Partial<OutletSetupView['payment']> = {}, canEdit = true): OutletSetupView {
  return {
    active: true,
    stage: 'logins',
    waitingOn: 'dealer',
    strip: [],
    company: 'iocl',
    companySavedBy: 'dealer',
    billing: null,
    billingSavedBy: null,
    billingPrefill: { name: null, stateCode: null, gstin: null },
    payment: {
      state: 'sent',
      amountPaise: 354000,
      dueOn: '2026-11-23',
      paidOn: null,
      paymentId: 'p1',
      resend: { inApp: true, nextAt: null, sms: false },
      ...over,
    },
    loginsNeeded: [],
    canEdit,
  };
}

// 16 Nov 2026, 10:00 in India.
const NOW = new Date('2026-11-16T04:30:00Z');

describe('billBanner', () => {
  it('counts the days left on India’s calendar', () => {
    expect(billBanner(view(), NOW)).toMatchObject({ kind: 'days', days: 7, amountPaise: 354000 });
    // 22 Nov at 23:00 in India: one day left.
    expect(billBanner(view(), new Date('2026-11-22T17:30:00Z'))).toMatchObject({ kind: 'days', days: 1 });
  });

  it('counts down to midnight in India on the due day itself, and cannot be closed then', () => {
    // 23 Nov 00:00:00 in India = 22 Nov 18:30 UTC: a whole day left.
    const b = billBanner(view(), new Date('2026-11-22T18:30:00Z'))!;
    expect(b.kind).toBe('countdown');
    if (b.kind === 'countdown') expect(formatCountdown(b.msLeft)).toBe('24:00:00');
    expect(canClose(b)).toBe(false);
    // 23 Nov 16:55:51 in India.
    const late = billBanner(view(), new Date('2026-11-23T11:25:51Z'))!;
    if (late.kind === 'countdown') expect(formatCountdown(late.msLeft)).toBe('07:04:09');
  });

  it('says the day has passed after midnight', () => {
    expect(billBanner(view(), new Date('2026-11-23T18:30:00Z'))?.kind).toBe('overdue');
  });

  it('is not drawn for a manager, a paid bill, no bill, or an autopay already taking it', () => {
    expect(billBanner(view({}, false), NOW)).toBeNull();
    expect(billBanner(view({ state: 'paid' }), NOW)).toBeNull();
    expect(billBanner(view({ state: 'not_sent', amountPaise: null, dueOn: null }), NOW)).toBeNull();
    expect(billBanner(view({ resend: null }), NOW)).toBeNull();
  });

  it('is still drawn for a server that sends no resend field', () => {
    expect(billBanner(view({ resend: undefined }), NOW)?.kind).toBe('days');
  });
});

describe('closing it', () => {
  it('hides it for the rest of India’s day only', () => {
    const b = billBanner(view(), NOW)!;
    expect(hiddenToday(b, '2026-11-16', NOW)).toBe(true);
    expect(hiddenToday(b, '2026-11-15', NOW)).toBe(false);
    expect(hiddenToday(b, null, NOW)).toBe(false);
  });

  it('never hides the countdown, even if closed earlier that day', () => {
    const at = new Date('2026-11-23T04:30:00Z');
    const b = billBanner(view(), at)!;
    expect(hiddenToday(b, '2026-11-23', at)).toBe(false);
  });
});

describe('the Send again button', () => {
  it('shows in a browser, and in the app only while the switch allows', () => {
    expect(showSendAgain(view(), false)).toBe(true);
    expect(showSendAgain(view(), true)).toBe(true);
    expect(showSendAgain(view({ resend: { inApp: false, nextAt: null, sms: true } }), true)).toBe(false);
    expect(showSendAgain(view({ resend: { inApp: false, nextAt: null, sms: true } }), false)).toBe(true);
    expect(showSendAgain(view({ resend: undefined }), false)).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts calendar days across a month end', () => {
    expect(daysBetween('2026-11-28', '2026-12-02')).toBe(4);
  });
});
