import { describe, expect, it } from 'vitest';

import { translate, type MessageKey, type TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import {
  makeAutopay,
  makeCreditNote,
  makeInvoice,
  makePaidPayment,
  makePayment,
} from '@/test/payments';

import {
  BILL_LIST_CAP,
  billMonthLabel,
  billMonthOf,
  billName,
  billStatus,
  financialYearOf,
  groupByYear,
  gstBreakdownOf,
  isListCapped,
  lastFailedDay,
  needsMe,
  paidOnTime,
  papersOf,
  planOf,
  yearSummary,
} from './billView';

const tIn =
  (lang: Lang): TFunction =>
  (key: MessageKey, vars) =>
    translate(lang, key, vars);
const en = tIn('en');

/** 26 Nov 2026, 10:00 in India. */
const NOW = Date.parse('2026-11-26T10:00:00+05:30');
const DAY = 24 * 60 * 60 * 1000;
const NBSP = ' ';

const ask = (over: Partial<Parameters<typeof needsMe>[0]> = {}, lang: Lang = 'en') =>
  needsMe({ t: tIn(lang), lang, payments: [], autopay: null, setup: null, now: NOW, ...over });

describe('financialYearOf (April to March, India time)', () => {
  it('is the year that began last April until the end of March', () => {
    expect(financialYearOf(Date.parse('2026-11-26T10:00:00+05:30'))).toEqual({
      from: 2026,
      to: 2027,
      start: '2026-04-01',
      end: '2027-03-31',
    });
    expect(financialYearOf(Date.parse('2026-03-31T10:00:00+05:30')).from).toBe(2025);
  });

  it('turns over at midnight in India, not in UTC', () => {
    // 19:00 UTC on 31 Mar is 00:30 on 1 Apr in India.
    expect(financialYearOf(Date.parse('2026-03-31T19:00:00Z')).from).toBe(2026);
    expect(financialYearOf(Date.parse('2026-03-31T18:29:00Z')).from).toBe(2025);
  });
});

describe('paidOnTime', () => {
  it('compares the Indian day the money came with the due day', () => {
    expect(paidOnTime({ paidAt: '2026-11-05T05:00:00Z', dueDate: '2026-11-05' })).toBe(true);
    // 19:00 UTC on 5 Nov is 00:30 on 6 Nov in India: a day late.
    expect(paidOnTime({ paidAt: '2026-11-05T19:00:00Z', dueDate: '2026-11-05' })).toBe(false);
    expect(paidOnTime({ paidAt: '2026-11-05T18:29:00Z', dueDate: '2026-11-05' })).toBe(true);
  });

  it('says nothing when either day is missing or unreadable', () => {
    expect(paidOnTime({ paidAt: null, dueDate: '2026-11-05' })).toBeNull();
    expect(paidOnTime({ paidAt: '2026-11-05T05:00:00Z', dueDate: null })).toBeNull();
    expect(paidOnTime({ paidAt: 'soon', dueDate: '2026-11-05' })).toBeNull();
  });
});

describe('billStatus: a shape and a word, never the problem shape', () => {
  const word = (p: Parameters<typeof billStatus>[0]) => {
    const s = billStatus(p);
    return [s.status, en(s.key)];
  };
  const base = { paidAt: null, dueDate: '2026-11-05', autopayOn: null, waitingForAutopayApproval: false };

  it('a due bill needs a look; one autopay is about to take, or that waits for approval, is waiting', () => {
    expect(word({ ...base, status: 'due' })).toEqual(['attention', 'Due']);
    expect(word({ ...base, status: 'due', autopayOn: '2026-11-28' })).toEqual(['waiting', 'Due']);
    expect(word({ ...base, status: 'due', waitingForAutopayApproval: true })).toEqual(['waiting', 'Due']);
    expect(word({ ...base, status: 'processing' })).toEqual(['waiting', 'Being confirmed']);
  });

  it('a paid bill says whether it was on time; with a day missing it just says Paid', () => {
    expect(word({ ...base, status: 'paid', paidAt: '2026-11-04T05:00:00Z' })).toEqual(['ok', 'Paid on time']);
    expect(word({ ...base, status: 'paid', paidAt: '2026-11-09T05:00:00Z' })).toEqual(['info', 'Paid late']);
    expect(word({ ...base, status: 'paid', paidAt: null })).toEqual(['ok', 'Paid']);
  });

  it('money that went back, and a withdrawn bill, are plain information', () => {
    expect(word({ ...base, status: 'refunded' })).toEqual(['info', 'Refunded']);
    expect(word({ ...base, status: 'partially_refunded' })).toEqual(['info', 'Part refunded']);
    expect(word({ ...base, status: 'cancelled' })).toEqual(['info', 'Cancelled']);
  });

  it('never draws the problem shape for money', () => {
    for (const status of ['due', 'processing', 'paid', 'refunded', 'partially_refunded', 'cancelled'] as const) {
      for (const autopayOn of [null, '2026-11-28']) {
        expect(billStatus({ ...base, status, autopayOn }).status).not.toBe('problem');
      }
    }
  });
});

describe('needsMe: one sentence, with a shape and a word', () => {
  it('nothing due', () => {
    const n = ask({ payments: [makePaidPayment()] });
    expect([n.status, n.word, n.text]).toEqual(['ok', 'Nothing due', 'Nothing is due.']);
  });

  it('a bill with days left names the amount, the day and the days, counted again from the date', () => {
    const due = makePayment({ amountPaise: 354000, dueDate: '2026-11-30' });
    const n = ask({ payments: [due] });
    expect(n.status).toBe('attention');
    expect(n.word).toBe('Bill due');
    expect(n.text).toBe(`Bill of Rs${NBSP}3,540 due on Mon${NBSP}30${NBSP}Nov, 4 days left.`);
    // Two days later the same bill says 2 days, not the 4 it said before.
    expect(ask({ payments: [due], now: NOW + 2 * DAY }).text).toContain('2 days left.');
    expect(ask({ payments: [due], now: NOW + 3 * DAY }).text).toContain('1 day left.');
  });

  it('the last day, and a day that has passed', () => {
    const due = makePayment({ amountPaise: 354000, dueDate: '2026-11-26' });
    expect(ask({ payments: [due] }).text).toBe(`Bill of Rs${NBSP}3,540 is due today. It is the last day.`);
    const late = ask({ payments: [makePayment({ amountPaise: 354000, dueDate: '2026-11-20' })] });
    expect(late.word).toBe('Past the due date');
    expect(late.text).toContain('was');
    expect(late.status).toBe('attention');
  });

  it('a bill with no due day still says it is due', () => {
    expect(ask({ payments: [makePayment({ amountPaise: 354000, dueDate: null })] }).text).toBe(
      `Bill of Rs${NBSP}3,540 is due.`,
    );
  });

  it('takes the soonest of several open bills, and one with no day last', () => {
    const n = ask({
      payments: [
        makePayment({ id: 'a', amountPaise: 100000, dueDate: null }),
        makePayment({ id: 'b', amountPaise: 200000, dueDate: '2026-12-10' }),
        makePayment({ id: 'c', amountPaise: 300000, dueDate: '2026-11-28' }),
      ],
    });
    expect(n.text).toContain(`Rs${NBSP}3,000`);
  });

  it('autopay will take it: waiting, not an alarm; today has its own words', () => {
    const n = ask({ payments: [makePayment({ amountPaise: 354000, autopayOn: '2026-11-30' })] });
    expect([n.status, n.word]).toEqual(['waiting', 'Autopay will take it']);
    expect(n.text).toBe(`Autopay will take Rs${NBSP}3,540 on Mon${NBSP}30${NBSP}Nov.`);
    expect(ask({ payments: [makePayment({ amountPaise: 354000, autopayOn: '2026-11-26' })] }).text).toBe(
      `Autopay will take Rs${NBSP}3,540 today.`,
    );
  });

  it('autopay day gone and the bill still open: it is trying again, with the day of the last try', () => {
    const open = makePayment({
      amountPaise: 354000,
      autopayOn: '2026-11-24',
      lastFailure: { reason: 'insufficient_funds', at: '2026-11-25T05:00:00Z' } as never,
    });
    const n = ask({ payments: [open] });
    expect([n.status, n.word]).toEqual(['attention', 'Autopay could not take it']);
    expect(n.text).toBe(`Autopay could not take Rs${NBSP}3,540. Last try: yesterday. It is trying again.`);
    expect(lastFailedDay([open])).toBe('2026-11-25');
    // No failure on record: the day autopay was due stands in for it.
    const noFailure = ask({ payments: [makePayment({ amountPaise: 354000, autopayOn: '2026-11-24' })] });
    expect(noFailure.text).toContain('Last try:');
  });

  it('a bill waiting for the autopay approval, and one being confirmed', () => {
    const waiting = ask({ payments: [makePayment({ waitingForAutopayApproval: true })] });
    expect([waiting.status, waiting.word]).toEqual(['waiting', 'Waiting for you']);
    expect(waiting.text).toBe(en('payments.waitingForApproval'));
    const processing = ask({ payments: [makePayment({ status: 'processing' })] });
    expect([processing.status, processing.word]).toEqual(['waiting', 'Being confirmed']);
    expect(processing.text).toBe(en('payments.confirmingNote'));
  });

  it('with no open bill, the owner’s autopay speaks', () => {
    const on = ask({ autopay: makeAutopay({ state: 'on', nextDebitOn: '2026-11-30' }) });
    expect([on.status, on.word]).toEqual(['ok', 'Autopay is on']);
    expect(on.text).toBe(`Autopay will take Rs${NBSP}3,540 on Mon${NBSP}30${NBSP}Nov.`);
    expect(ask({ autopay: makeAutopay({ state: 'on', nextDebitOn: null }) }).text).toBe(
      `Autopay takes Rs${NBSP}3,540 every month.`,
    );
    expect(ask({ autopay: makeAutopay({ state: 'on', nextDebitOn: '2026-11-26' }) }).text).toContain('today');
    const failing = ask({ autopay: makeAutopay({ state: 'failing' }) });
    expect([failing.status, failing.word]).toEqual(['attention', 'Autopay could not take it']);
    expect(ask({ autopay: makeAutopay({ state: 'setting_up' }) }).word).toBe('Waiting for you');
    // Autopay that is off says nothing is due.
    expect(ask({ autopay: makeAutopay({ state: 'off' }) }).word).toBe('Nothing due');
  });

  it('a bill the setup view knows is sent, though the list has no row for it yet', () => {
    const n = ask({
      setup: { payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-30', paidOn: null, paymentId: null, resend: null } },
    });
    expect(n.word).toBe('Bill due');
    expect(n.text).toContain(`Rs${NBSP}3,540`);
    // A paid or not-yet-sent bill there says nothing.
    expect(
      ask({ setup: { payment: { state: 'paid', amountPaise: 354000, dueOn: null, paidOn: '2026-11-01', paymentId: null, resend: null } } }).word,
    ).toBe('Nothing due');
  });

  it('reads in Hindi and in Hinglish, with no English or Devanagari in the wrong place', () => {
    const due = makePayment({ amountPaise: 354000, dueDate: '2026-11-30' });
    expect(ask({ payments: [due] }, 'hi').text).toContain('₹3,540');
    expect(ask({ payments: [due] }, 'hi').text).toMatch(/बाकी।$/);
    const hl = ask({ payments: [due] }, 'hl').text;
    expect(hl).toMatch(/^Rs.3,540 ka bill/);
    expect(hl).not.toMatch(/[ऀ-ॿ]/);
  });

  it('never draws the problem shape', () => {
    const cases = [
      ask({ payments: [makePayment({ dueDate: '2020-01-01' })] }),
      ask({ payments: [makePayment({ autopayOn: '2020-01-01' })] }),
      ask({ autopay: makeAutopay({ state: 'failing' }) }),
    ];
    for (const c of cases) expect(c.status).not.toBe('problem');
  });
});

describe('planOf: the price is read, never written in', () => {
  it('follows the owner’s autopay amount and splits it into price and GST', () => {
    const plan = planOf([], makeAutopay({ amountPaise: 354000 }));
    expect(plan).toEqual({ totalPaise: 354000, basePaise: 300000, ratePercent: 18, fromBill: false });
  });

  it('follows whatever amount the server sends, not a built-in one', () => {
    expect(planOf([], makeAutopay({ amountPaise: 118000 }))?.basePaise).toBe(100000);
  });

  it('without autopay, takes the newest subscription bill and says it came from the bill', () => {
    const plan = planOf(
      [
        makePayment({ id: 'old', amountPaise: 118000, createdAt: '2026-09-01T00:00:00Z' }),
        makePayment({ id: 'new', amountPaise: 354000, createdAt: '2026-10-01T00:00:00Z' }),
        makePayment({ id: 'setup', amountPaise: 999900, purpose: 'setup', createdAt: '2026-11-01T00:00:00Z' }),
        makePayment({ id: 'gone', amountPaise: 777700, status: 'cancelled', createdAt: '2026-11-02T00:00:00Z' }),
      ],
      null,
    );
    expect(plan).toMatchObject({ totalPaise: 354000, basePaise: 300000, fromBill: true });
  });

  it('autopay that is off falls back to the bills; with neither there is no plan', () => {
    expect(planOf([makePayment({ amountPaise: 354000 })], makeAutopay({ state: 'off', amountPaise: 1 }))?.fromBill).toBe(true);
    expect(planOf([], null)).toBeNull();
    expect(planOf([makePayment({ purpose: 'service' })], null)).toBeNull();
  });
});

describe('yearSummary: this financial year only', () => {
  const paid = (id: string, day: string, over = {}) =>
    makePaidPayment({
      id,
      amountPaise: 354000,
      dueDate: day,
      paidAt: `${day}T05:00:00Z`,
      ...over,
    });

  it('adds what was paid between April and March, less what went back', () => {
    const s = yearSummary(
      [
        paid('a', '2026-04-05'),
        paid('b', '2026-10-05'),
        paid('c', '2026-05-05', { status: 'partially_refunded', refundedPaise: 50000 }),
        paid('before', '2026-03-31'),
        makePayment({ id: 'open', status: 'due' }),
      ],
      NOW,
    );
    expect(s).toMatchObject({ from: 2026, to: 2027, paidPaise: 354000 + 354000 + 304000, paidCount: 3 });
  });

  it('a wholly refunded bill adds nothing and is not counted as paid', () => {
    const s = yearSummary([paid('r', '2026-06-05', { status: 'refunded', refundedPaise: 354000 })], NOW);
    expect(s.paidPaise).toBe(0);
    expect(s.paidCount).toBe(0);
  });

  it('counts bills paid by their due day, out of those that have both days', () => {
    const s = yearSummary(
      [
        paid('a', '2026-06-05'),
        paid('b', '2026-07-05', { paidAt: '2026-07-09T05:00:00Z' }),
        paid('c', '2026-08-05', { dueDate: null }),
      ],
      NOW,
    );
    expect(s).toMatchObject({ onTime: 1, withDueDay: 2, paidCount: 3 });
  });

  it('adds the GST on the invoices and takes off the credit notes, from the stored figures', () => {
    const invoice = makeInvoice({ cgstPaise: 38128, sgstPaise: 38128, igstPaise: 0, issuedAt: '2026-10-05T05:00:00Z' });
    const note = makeCreditNote({ cgstPaise: 4000, sgstPaise: 4000, igstPaise: 0, issuedAt: '2026-10-20T05:00:00Z' });
    const s = yearSummary([paid('a', '2026-10-05', { invoice, creditNotes: [note] })], NOW);
    expect(s.gstPaise).toBe(76256 - 8000);
    expect(s.invoiceCount).toBe(1);
  });

  it('leaves out invoices issued in another year', () => {
    const invoice = makeInvoice({ issuedAt: '2026-03-30T05:00:00Z' });
    expect(yearSummary([paid('a', '2026-03-30', { invoice })], NOW).invoiceCount).toBe(0);
  });
});

describe('groupByYear', () => {
  it('newest year first; inside a year what is open comes first, then paid, newest first', () => {
    const groups = groupByYear([
      makePaidPayment({ id: 'p25', dueDate: '2025-12-05', paidAt: '2025-12-04T05:00:00Z' }),
      makePaidPayment({ id: 'p26a', dueDate: '2026-08-05', paidAt: '2026-08-04T05:00:00Z' }),
      makePaidPayment({ id: 'p26b', dueDate: '2026-09-05', paidAt: '2026-09-04T05:00:00Z' }),
      makePayment({ id: 'open2', dueDate: '2026-12-01' }),
      makePayment({ id: 'open1', dueDate: '2026-11-02' }),
      makePayment({ id: 'nodate', dueDate: null }),
    ]);
    expect(groups.map((g) => g.year)).toEqual(['2026', '2025']);
    expect(groups[0]?.items.map((p) => p.id)).toEqual(['open1', 'open2', 'nodate', 'p26b', 'p26a']);
    expect(groups[1]?.items.map((p) => p.id)).toEqual(['p25']);
  });

  it('keeps a bill whose day cannot be read, under a dash, last', () => {
    const groups = groupByYear([
      makePayment({ id: 'x', dueDate: null, createdAt: 'never' }),
      makePayment({ id: 'y', dueDate: '2026-11-05' }),
    ]);
    expect(groups.map((g) => g.year)).toEqual(['2026', '—']);
  });

  it('is empty for no bills', () => {
    expect(groupByYear([])).toEqual([]);
  });
});

describe('papersOf and the list cap', () => {
  it('lists every invoice and credit note of every bill, newest first, each with its bill', () => {
    const inv = makeInvoice({ id: 'i1', issuedAt: '2026-10-05T05:00:00Z' });
    const note = makeCreditNote({ id: 'c1', issuedAt: '2026-10-20T05:00:00Z' });
    const inv2 = makeInvoice({ id: 'i2', issuedAt: '2026-09-05T05:00:00Z' });
    const papers = papersOf([
      makePaidPayment({ id: 'a', invoice: inv, creditNotes: [note] }),
      makePaidPayment({ id: 'b', invoice: inv2 }),
      makePayment({ id: 'open' }),
    ]);
    expect(papers.map((p) => [p.doc.id, p.paymentId])).toEqual([
      ['c1', 'a'],
      ['i1', 'a'],
      ['i2', 'b'],
    ]);
  });

  it('knows the list may be cut short when it is as long as the server sends', () => {
    expect(isListCapped(Array.from({ length: BILL_LIST_CAP - 1 }))).toBe(false);
    expect(isListCapped(Array.from({ length: BILL_LIST_CAP }))).toBe(true);
  });
});

describe('a bill\'s name', () => {
  const named = (title: string, over = {}) => makePayment({ title, ...over });

  it('is built from the month the server names, in the reader\'s language', () => {
    const p = named('Dealer Kavach, November', { dueDate: '2026-11-30' });
    expect(billName(tIn('en'), 'en', p)).toBe('Dealer Kavach, November 2026');
    expect(billName(tIn('hi'), 'hi', p)).toBe('Dealer Kavach, नवंबर 2026');
    expect(billName(tIn('hl'), 'hl', p)).toBe('Dealer Kavach, November 2026');
  });

  it('reads the real server shapes: the apostrophe, the dash, a short month, a year', () => {
    expect(billMonthOf(named("Dealer's Kavach — October 2026"))).toEqual({ month: 10, year: 2026 });
    expect(billMonthOf(named('Dealer Kavach — Nov 2026'))).toEqual({ month: 11, year: 2026 });
    expect(billMonthOf(named('Dealer’s Kavach — Oct 2026'))).toEqual({ month: 10, year: 2026 });
  });

  it('takes the year from the due day, one back when December\'s bill falls due in January', () => {
    expect(billMonthOf(named('Dealer Kavach, December', { dueDate: '2027-01-03' }))).toEqual({
      month: 12,
      year: 2026,
    });
    expect(billMonthOf(named('Dealer Kavach, March', { dueDate: '2027-03-05' }))).toEqual({
      month: 3,
      year: 2027,
    });
  });

  it('leaves any other name exactly as the server wrote it', () => {
    const setup = named('Setup fee', { purpose: 'setup', dueDate: '2026-11-30' });
    expect(billMonthOf(setup)).toBeNull();
    expect(billName(tIn('hi'), 'hi', setup)).toBe('Setup fee');
    expect(billMonthOf(named('Dealer Kavach, Setup'))).toBeNull();
    expect(billMonthLabel('en', named('Refunded one'))).toBeNull();
  });

  it('gives the month it covers for the bill\'s own page', () => {
    const p = named('Dealer Kavach, November', { dueDate: '2026-11-30' });
    expect(billMonthLabel('en', p)).toBe('November 2026');
    expect(billMonthLabel('hi', p)).toBe('नवंबर 2026');
  });
});

describe('what a bill is made of', () => {
  it('works the split out with the shared rule until an invoice exists', () => {
    expect(gstBreakdownOf(makePayment({ amountPaise: 118000 }))).toEqual({
      beforePaise: 100000,
      gstPaise: 18000,
      ratePercent: 18,
    });
  });

  it('reads the issued invoice when there is one', () => {
    const invoice = makeInvoice();
    const split = gstBreakdownOf(makePaidPayment({ invoice }));
    expect(split.beforePaise).toBe(invoice.taxablePaise);
    expect(split.gstPaise).toBe(invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise);
  });
});
