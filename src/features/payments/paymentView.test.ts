import { describe, expect, it } from 'vitest';

import { messages, translate, type MessageKey } from '@/lib/i18n';
import { makePaidPayment, makePayment } from '@/test/payments';
import { PAYMENT_STATUSES } from '@dk/shared/types';

import {
  STATUS_KEY,
  STATUS_TONE,
  canStartPayment,
  formatDateTimeIst,
  formatDay,
  formatDueDate,
  hasReceipt,
  methodLabel,
  splitPayments,
} from './paymentView';

describe('splitPayments', () => {
  it('puts what is open on top, soonest date first, undated last', () => {
    const { due } = splitPayments([
      makePayment({ id: 'a', dueDate: null, createdAt: '2026-10-01T00:00:00.000Z' }),
      makePayment({ id: 'b', dueDate: '2026-12-01' }),
      makePayment({ id: 'c', dueDate: '2026-11-02', status: 'processing' }),
    ]);
    expect(due.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('puts everything else below, newest first by the day it was paid', () => {
    const { due, history } = splitPayments([
      makePaidPayment({ id: 'old', paidAt: '2026-08-05T09:50:00.000Z' }),
      makePayment({ id: 'cancelled', status: 'cancelled', createdAt: '2026-09-10T00:00:00.000Z' }),
      makePaidPayment({ id: 'new', paidAt: '2026-10-05T09:50:00.000Z' }),
      makePaidPayment({ id: 'refunded', status: 'refunded', paidAt: '2026-07-05T09:50:00.000Z' }),
    ]);
    expect(due).toEqual([]);
    expect(history.map((p) => p.id)).toEqual(['new', 'cancelled', 'old', 'refunded']);
  });

  it('does not change the list it is given', () => {
    const items = [makePayment({ id: 'b', dueDate: '2026-12-01' }), makePayment({ id: 'a' })];
    splitPayments(items);
    expect(items.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('statuses', () => {
  it('has a word and a colour for every status the server can send', () => {
    for (const status of PAYMENT_STATUSES) {
      expect(STATUS_KEY[status]).toBeDefined();
      expect(STATUS_TONE[status]).toBeDefined();
    }
  });

  it('shows a receipt exactly when money reached us', () => {
    expect(PAYMENT_STATUSES.filter(hasReceipt)).toEqual(['paid', 'partially_refunded', 'refunded']);
  });

  // `processing` is open on the server, but a second payment on top of one
  // already on its way is a double charge.
  it('lets only a due payment be paid', () => {
    expect(PAYMENT_STATUSES.filter((status) => canStartPayment({ status }))).toEqual(['due']);
  });
});

describe('dates', () => {
  it('shows a due date as the calendar day it is, whatever the time zone', () => {
    expect(formatDueDate('en', '2026-11-05')).toBe('5 Nov 2026');
    expect(formatDueDate('en', '2026-01-01')).toBe('1 Jan 2026');
  });

  it('hands back what it cannot read', () => {
    expect(formatDueDate('en', 'soon')).toBe('soon');
    expect(formatDay('en', 'not a date')).toBe('—');
    expect(formatDateTimeIst('en', 'not a date')).toBe('—');
  });

  // 19:00 UTC on 5 Oct is 00:30 on 6 Oct in India.
  it('names the Indian day a moment fell on, not the UTC one', () => {
    expect(formatDay('en', '2026-10-05T19:00:00.000Z')).toBe('6 Oct 2026');
    expect(formatDay('en', '2026-10-05T18:29:00.000Z')).toBe('5 Oct 2026');
  });

  it('prints receipt times in Indian time', () => {
    expect(formatDateTimeIst('en', '2026-10-05T09:50:00.000Z')).toMatch(/^5 Oct 2026, 3:20\spm$/);
    expect(formatDateTimeIst('en', '2026-10-05T19:00:00.000Z')).toMatch(/^6 Oct 2026, 12:30\sam$/);
  });

  it('writes the month in Hindi for a Hindi reader', () => {
    expect(formatDueDate('hi', '2026-11-05')).toMatch(/^5 नव/);
  });
});

describe('methodLabel', () => {
  const t = (key: MessageKey) => translate('en', key);

  it('uses the dealer’s word for the methods Razorpay reports', () => {
    expect(methodLabel(t, 'upi')).toBe('UPI');
    expect(methodLabel(t, 'card')).toBe('Card');
    expect(methodLabel(t, 'netbanking')).toBe('Net banking');
    expect(methodLabel(t, 'wallet')).toBe('Wallet');
    expect(methodLabel(t, 'bank_transfer')).toBe('Bank transfer');
    // money MDG recorded by hand
    expect(methodLabel(t, 'cash')).toBe('Cash');
    expect(methodLabel(t, 'cheque')).toBe('Cheque');
  });

  it('is not thrown by capital letters', () => {
    expect(methodLabel(t, 'UPI')).toBe('UPI');
  });

  it('shows a method it does not know as Razorpay names it, and nothing for none', () => {
    expect(methodLabel(t, 'cardless_emi')).toBe('cardless_emi');
    expect(methodLabel(t, null)).toBeNull();
  });
});

describe('the catalogue', () => {
  const paymentKeys = (Object.keys(messages) as MessageKey[]).filter((k) =>
    k.startsWith('payments.'),
  );

  it('has every payments string in English and in Hindi', () => {
    expect(paymentKeys.length).toBeGreaterThan(40);
    for (const key of paymentKeys) {
      expect(messages[key].en.trim(), `${key} (en)`).not.toBe('');
      expect(messages[key].hi.trim(), `${key} (hi)`).not.toBe('');
    }
  });

  // A Hindi string that is the English one pasted twice is a translation that
  // was forgotten. The few that really are the same are listed: UPI and EMI,
  // and the three taxes, which are called CGST, SGST and IGST on every return.
  it('has a real Hindi string wherever the English is words', () => {
    const same = paymentKeys.filter((k) => messages[k].en === messages[k].hi);
    expect(same.sort()).toEqual([
      'payments.invoice.cgst',
      'payments.invoice.igst',
      'payments.invoice.sgst',
      'payments.method.emi',
      'payments.method.upi',
    ]);
  });

  it('uses the same {placeholders} in both languages', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of paymentKeys) {
      expect(holes(messages[key].hi), key).toEqual(holes(messages[key].en));
    }
  });

  // Inside the Android app these sentences are read next to a screen that must
  // not steer a dealer away from Google Play Billing. None may point at a place
  // or a way to pay.
  it('has no sentence that sends a dealer somewhere else to pay', () => {
    const steering =
      /website|web site|browser|link|razorpay|online at|visit|वेबसाइट|ब्राउज़र|लिंक/i;
    const allowed = new Set<MessageKey>([
      // Shown only after a tap on Pay in a browser, never in the app.
      'payments.err.script',
      'payments.err.window',
    ]);
    for (const key of paymentKeys) {
      if (allowed.has(key)) continue;
      expect(messages[key].en, `${key} (en)`).not.toMatch(steering);
      expect(messages[key].hi, `${key} (hi)`).not.toMatch(steering);
    }
  });
});
