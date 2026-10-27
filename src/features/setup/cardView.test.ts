import { describe, expect, it } from 'vitest';

import { translate } from '@/lib/i18n';
import { GSTIN_HARYANA, GSTIN_MAHARASHTRA } from '@/test/setupFixtures';
import { GST_STATES } from '@dk/shared';
import { OIL_COMPANIES, SETUP_STAGES } from '@dk/shared/types';

import {
  GST_STATE_HI,
  checkGstin,
  companyChangeable,
  companyLabel,
  formatDay,
  formatRupees,
  isPastDue,
  istToday,
  stateLabel,
  stateOptions,
} from './cardView';

describe('the company', () => {
  it('is named in the reader\'s language, with the name on every pump\'s board beside it', () => {
    expect(companyLabel('iocl', 'en')).toBe('Indian Oil (IOCL)');
    expect(companyLabel('bpcl', 'en')).toBe('Bharat Petroleum (BPCL)');
    expect(companyLabel('hpcl', 'en')).toBe('Hindustan Petroleum (HPCL)');
    expect(companyLabel('iocl', 'hi')).toBe('इंडियन ऑयल (IOCL)');
    expect(companyLabel('bpcl', 'hi')).toBe('भारत पेट्रोलियम (BPCL)');
    expect(companyLabel('hpcl', 'hi')).toBe('हिंदुस्तान पेट्रोलियम (HPCL)');
    expect(OIL_COMPANIES.map((c) => companyLabel(c, 'en'))).toHaveLength(3);
  });

  it('can be changed until the services start, and not after', () => {
    const open = SETUP_STAGES.filter((s) => companyChangeable(s));
    expect(open).toEqual(['sign_in', 'company', 'billing', 'payment', 'logins', 'setup']);
    for (const stage of ['watch', 'live', 'lost'] as const) {
      expect(companyChangeable(stage), stage).toBe(false);
    }
  });
});

describe('checkGstin', () => {
  it('nothing typed is fine: a GSTIN is optional', () => {
    expect(checkGstin('')).toEqual({ state: 'empty' });
    expect(checkGstin('  - ')).toEqual({ state: 'empty' });
  });

  it('a half-typed one is partial, with how far it has got', () => {
    expect(checkGstin('06ABCDE')).toEqual({ state: 'partial', length: 7 });
  });

  it('a right one is ok, cleaned, with its state', () => {
    expect(checkGstin(` ${GSTIN_HARYANA.toLowerCase()} `)).toEqual({
      state: 'ok',
      gstin: GSTIN_HARYANA,
      stateCode: '06',
    });
    expect(checkGstin(GSTIN_MAHARASHTRA)).toMatchObject({ state: 'ok', stateCode: '27' });
  });

  it('one mistyped character, or one too long, is bad', () => {
    const wrong = `${GSTIN_HARYANA.slice(0, 14)}${GSTIN_HARYANA[14] === '0' ? '1' : '0'}`;
    expect(checkGstin(wrong)).toMatchObject({ state: 'bad', length: 15 });
    expect(checkGstin(`${GSTIN_HARYANA}1`)).toMatchObject({ state: 'bad', length: 16 });
  });
});

describe('states', () => {
  it('names every state in Hindi', () => {
    for (const code of stateOptions('en').map((s) => s.code)) {
      expect(GST_STATE_HI[code], code).toBeTruthy();
    }
  });

  it('Hindi shows both names, English one', () => {
    expect(stateLabel('06', 'hi')).toBe('हरियाणा (Haryana)');
    expect(stateLabel('06', 'en')).toBe('Haryana');
    // A code the table does not know is shown as it is.
    expect(stateLabel('00', 'en')).toBe('00');
    expect(stateLabel('99', 'hi')).toBe('केंद्र अधिकार क्षेत्र (Centre Jurisdiction)');
  });

  it('lists every state the GST list has, alphabetical in English', () => {
    const en = stateOptions('en');
    expect(en).toHaveLength(Object.keys(GST_STATES).length);
    expect(en[0]!.label).toBe('Andaman and Nicobar Islands');
    expect(en.map((s) => s.label)).toEqual([...en.map((s) => s.label)].sort((a, b) => a.localeCompare(b)));
  });
});

describe('the bill', () => {
  it('formats rupees with Indian grouping, paise only when there are some', () => {
    expect(formatRupees(354000)).toBe('₹3,540');
    expect(formatRupees(12345600)).toBe('₹1,23,456');
    expect(formatRupees(354050)).toBe('₹3,540.50');
  });

  it('formats a day from its parts, in the reader\'s language', () => {
    expect(formatDay('2026-11-02', 'en')).toBe('2 November');
    expect(formatDay('2026-11-02', 'hi')).toBe('2 नवंबर');
    expect(formatDay(null, 'en')).toBe('');
    expect(formatDay('soon', 'en')).toBe('');
  });
});

describe('the bill\'s day', () => {
  it('reads today on India\'s calendar, whatever hour the instant is', () => {
    // 20:00 UTC on 22 Oct is 01:30 on 23 Oct in India.
    expect(istToday(new Date('2026-10-22T20:00:00.000Z'))).toBe('2026-10-23');
    expect(istToday(new Date('2026-10-23T05:00:00.000Z'))).toBe('2026-10-23');
    // 18:29 UTC is 23:59 in India: still the same day.
    expect(istToday(new Date('2026-10-23T18:29:00.000Z'))).toBe('2026-10-23');
    expect(istToday(new Date('2026-10-23T18:30:00.000Z'))).toBe('2026-10-24');
  });

  it('is past due only after the day itself', () => {
    expect(isPastDue('2026-10-22', '2026-10-23')).toBe(true);
    expect(isPastDue('2026-10-23', '2026-10-23')).toBe(false);
    expect(isPastDue('2026-10-24', '2026-10-23')).toBe(false);
  });

  it('is never past due without a day, or with one that cannot be read', () => {
    expect(isPastDue(null, '2026-10-23')).toBe(false);
    expect(isPastDue(undefined, '2026-10-23')).toBe(false);
    expect(isPastDue('', '2026-10-23')).toBe(false);
    expect(isPastDue('soon', '2026-10-23')).toBe(false);
  });
});

describe('the words billing added to the app', () => {
  // Google Play: nothing inside the app may ask for payment, point to a way to pay
  // or say where or how (ADR 0022 §1). These are facts about a bill, a receipt and
  // a page of both, in both languages.
  const KEYS = [
    'setup.billOverdue',
    'setup.viewReceipt',
    'settings.payments',
    'settings.paymentsDesc',
    'setup.billLine',
    'setup.billLineNoDate',
    'setup.payPaid',
    'setup.payPaidOn',
    'setup.payPreparing',
  ] as const;
  const INSTRUCTION =
    /\b(pay (now|here|online|via|using|through|at|on)|pay the|upi|bank|razorpay|link|website|browser|click|tap to pay)\b|वेबसाइट|ब्राउज़र|लिंक|यूपीआई|बैंक|अभी भुगतान करें|भुगतान करें/i;

  it.each(KEYS)('%s asks for nothing and points nowhere', (key) => {
    for (const lang of ['en', 'hi'] as const) {
      expect(translate(lang, key, { amount: '₹3,540', date: '2 November' })).not.toMatch(INSTRUCTION);
    }
  });
});
