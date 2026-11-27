import { describe, expect, it } from 'vitest';

import { daysUntil } from '@/lib/fmt';
import type { KavachDealerView, TodayFeed, TodayReport } from '@dk/shared/types';

import {
  FETCHED_NOW,
  NOW,
  TODAY,
  YESTERDAY,
  creditData,
  declarationData,
  feed,
  kavach,
  kavachItem,
  paperData,
  planData,
  report,
  salesData,
  stockData,
  supplyData,
  task,
  variationData,
  waterData,
} from './glanceFixtures';
import {
  COMING_UP_LIMIT,
  EXPECTED_BY,
  FEED_FRESH_MS,
  comingUp,
  countsOf,
  isPumpLive,
  missingSalesReport,
  paperDaysLeft,
  pulseOf,
  pumpNowRows,
  verdictOf,
  type GlanceInput,
} from './glanceModel';

/** The India clock for a given date and time, as an instant. */
const ist = (day: string, hhmm: string): Date => new Date(`${day}T${hhmm}:00.000+05:30`);

type Alert = GlanceInput['alerts'][number];
const alertOf = (r: TodayReport, severity: Alert['severity'] = 'attention'): Alert => ({
  report: r,
  headline: `${r.kind} says look`,
  severity,
});

/** The verdict for a pump that is live, online, and read a minute ago, unless the test says otherwise. */
function glance(over: Partial<GlanceInput> = {}) {
  return verdictOf({
    feed: feed({ reports: [report('dsr_sales', { data: salesData() })] }),
    fetchedAt: FETCHED_NOW,
    online: true,
    kavach: null,
    role: 'owner',
    lang: 'en',
    now: NOW,
    pumpLive: true,
    alerts: [],
    ...over,
  });
}

const sales = (day = YESTERDAY, over: Partial<TodayReport> = {}) =>
  report('dsr_sales', { day, data: salesData({ day }), ...over });

describe('verdict table: one test per row, first match wins', () => {
  it('setup: the pump is not live (the setup hero takes the card), whatever else is true', () => {
    const g = glance({ pumpLive: false, feed: undefined, feedFailed: true, alerts: [] });
    expect(g.verdict).toBe('setup');
    expect(g.cardStatus).toBe('setup');
    expect(g.word).toBe('Setting up your pump');
  });

  it('setup beats a problem and a task', () => {
    const t = task();
    const r = report('water_ingress', { status: 'attention', data: waterData() });
    const g = glance({ pumpLive: false, feed: feed({ tasks: [t], reports: [r] }), alerts: [alertOf(r, 'problem')] });
    expect(g.verdict).toBe('setup');
  });

  it('a pump whose setup stage is not known yet never blocks the verdict', () => {
    expect(isPumpLive(undefined)).toBeUndefined();
    expect(isPumpLive(null)).toBeUndefined();
    expect(glance({ pumpLive: undefined }).verdict).toBe('fine');
  });

  it('isPumpLive: only watch and live are live', () => {
    expect(isPumpLive('watch')).toBe(true);
    expect(isPumpLive('live')).toBe(true);
    expect(isPumpLive('welcome')).toBe(false);
  });

  it('unknown: the feed failed and nothing is in hand', () => {
    const g = glance({ feed: undefined, feedFailed: true });
    expect(g.verdict).toBe('unknown');
    expect(g.word).toBe('Cannot check right now');
    expect(g.cardStatus).toBe('unknown');
    expect(g.loading).toBe(false);
  });

  it('unknown: the phone is offline and the feed is older than 30 minutes', () => {
    const g = glance({ online: false, fetchedAt: FETCHED_NOW - FEED_FRESH_MS - 1 });
    expect(g.verdict).toBe('unknown');
    expect(g.stale).toBe(true);
  });

  it('unknown beats a problem when offline and stale (the problem may be gone)', () => {
    const r = report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 2 }) });
    const g = glance({
      online: false,
      fetchedAt: FETCHED_NOW - 2 * 3_600_000,
      feed: feed({ reports: [r] }),
      alerts: [alertOf(r, 'problem')],
    });
    expect(g.verdict).toBe('unknown');
  });

  it('offline with a feed read 29 minutes ago is not unknown', () => {
    const g = glance({ online: false, fetchedAt: FETCHED_NOW - 29 * 60_000 });
    expect(g.verdict).toBe('fine');
  });

  it('nothing read yet (still loading) is never fine', () => {
    const g = glance({ feed: undefined });
    expect(g.verdict).toBe('unknown');
    expect(g.loading).toBe(true);
  });

  it('problem: an alert of severity problem', () => {
    const r = report('credit_dod', { status: 'attention', data: creditData({ date: '2026-11-25' }) });
    const g = glance({ feed: feed({ reports: [r] }), alerts: [alertOf(r, 'problem')] });
    expect(g.verdict).toBe('problem');
    expect(g.n).toBe(1);
    expect(g.word).toBe('1 problem');
    expect(g.cardStatus).toBe('problem');
  });

  it('problem: the supply is blocked, even with no alert raised for it', () => {
    const r = report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 2 }) });
    const g = glance({ feed: feed({ reports: [r] }) });
    expect(g.verdict).toBe('problem');
    expect(g.n).toBe(1);
  });

  it('problem: a blocked supply that is also an alert counts once', () => {
    const r = report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 2 }) });
    const g = glance({ feed: feed({ reports: [r] }), alerts: [alertOf(r, 'problem')] });
    expect(g.n).toBe(1);
  });

  it('problem: two problems say "2 problems"', () => {
    const a = report('credit_dod', { status: 'attention', data: creditData() });
    const b = report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 1 }) });
    const g = glance({ feed: feed({ reports: [a, b] }), alerts: [alertOf(a, 'problem'), alertOf(b, 'problem')] });
    expect(g.word).toBe('2 problems');
  });

  it('problem is not given for an aged alarm: the server already turned it into information', () => {
    // The aging rule: a blocked supply from an earlier day arrives as `info`.
    const r = report('ro_supply', { status: 'info', data: supplyData({ blocked: true, failing: 2 }) });
    const g = glance({ feed: feed({ reports: [sales(), r] }) });
    expect(g.verdict).toBe('fine');
  });

  it('problem beats a task (first match)', () => {
    const a = report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 1 }) });
    const g = glance({ feed: feed({ tasks: [task()], reports: [a] }), alerts: [alertOf(a, 'problem')] });
    expect(g.verdict).toBe('problem');
  });

  it('needs_you: an open task', () => {
    const g = glance({ feed: feed({ tasks: [task()], reports: [sales()] }) });
    expect(g.verdict).toBe('needs_you');
    expect(g.n).toBe(1);
    expect(g.word).toBe('1 thing waits for you');
    expect(g.cardStatus).toBe('waiting');
  });

  it('needs_you: several tasks say "N things wait for you"', () => {
    const g = glance({ feed: feed({ tasks: [task(), task(), task()] }) });
    expect(g.word).toBe('3 things wait for you');
  });

  it('needs_you: a Kavach point sent back', () => {
    const k = kavach({ now: [kavachItem({ state: 'sent_back', sentBack: { reason: 'not_clear', note: null, at: '2026-11-26T10:00:00.000Z' } })], counts: { sentBack: 1 } });
    const g = glance({ kavach: k });
    expect(g.verdict).toBe('needs_you');
    expect(g.n).toBe(1);
    expect(g.needsMe[0]?.source).toBe('kavach');
  });

  it('needs_you: a Kavach point that is late', () => {
    const k = kavach({ now: [kavachItem({ late: true })], counts: { late: 1 } });
    expect(glance({ kavach: k }).verdict).toBe('needs_you');
  });

  it('needs_you: the Kavach summary alone (no points carried) still counts late and sent-back', () => {
    const k = { ...kavach({ counts: { late: 2, sentBack: 1 } }), now: undefined } as unknown as KavachDealerView;
    expect(countsOf({ feed: feed(), kavach: k, role: 'owner', now: NOW }).needYou).toBe(2);
  });

  it('needs_you: a manager is not asked for a point only the owner can send', () => {
    const k = kavach({ now: [kavachItem({ late: true, canSend: true, uploader: 'owner' })], counts: { late: 1 } });
    // `canSend` is what the server says this member may send; the owner's point is not on the manager's list.
    const cannot = kavach({ now: [kavachItem({ late: true, canSend: false, uploader: 'owner' })], counts: { late: 1 } });
    expect(glance({ kavach: cannot, role: 'manager' }).verdict).toBe('fine');
    expect(glance({ kavach: k, role: 'owner' }).verdict).toBe('needs_you');
  });

  it('needs_you: an owner is not asked for the manager\'s daily job, a manager is (one list with the Kavach page)', () => {
    const k = kavach({ now: [kavachItem({ late: true, uploader: 'manager' })], counts: { late: 1 } });
    expect(glance({ kavach: k, role: 'owner' }).verdict).toBe('fine');
    expect(glance({ kavach: k, role: 'manager' }).verdict).toBe('needs_you');
  });

  it('needs_you: a point already asked as a task is counted once', () => {
    const item = kavachItem({ late: true, code: 'fire-photo', checkId: 'chk-fire' });
    const t = task({ kind: 'ask', action: { type: 'photo', askRef: 'kv:fire-photo', acceptsFile: false } });
    const g = glance({ feed: feed({ tasks: [t] }), kavach: kavach({ now: [item], counts: { late: 1 } }) });
    expect(g.counts.needYou).toBe(1);
  });

  it('needs_you: a point both sent back and late is counted once (the summary counts it twice)', () => {
    const item = kavachItem({ state: 'sent_back', late: true, sentBack: { reason: 'other', note: null, at: '2026-11-26T10:00:00.000Z' } });
    const g = glance({ kavach: kavach({ now: [item], counts: { late: 1, sentBack: 1 } }) });
    expect(g.counts.needYou).toBe(1);
  });

  it('needs_you: the setup task is not counted while the setup block shows it', () => {
    const g = glance({ pumpLive: undefined, feed: feed({ tasks: [task({ kind: 'setup' })], reports: [sales()] }) });
    expect(g.counts.needYou).toBe(1);
    const shown = countsOf({ feed: feed({ tasks: [task({ kind: 'setup' })] }), role: 'owner', now: NOW, setupShown: true });
    expect(shown.needYou).toBe(0);
  });

  it('needs_you beats look', () => {
    const r = report('water_ingress', { status: 'attention', data: waterData({ missed: 2 }) });
    const g = glance({ feed: feed({ tasks: [task()], reports: [r] }), alerts: [alertOf(r)] });
    expect(g.verdict).toBe('needs_you');
  });

  it('look: an attention report that no task covers', () => {
    const r = report('water_ingress', { status: 'attention', sentAt: '2026-11-27T01:00:00.000Z', data: waterData({ missed: 2 }) });
    const g = glance({ feed: feed({ reports: [sales(), r] }), alerts: [alertOf(r)] });
    expect(g.verdict).toBe('look');
    expect(g.word).toBe('1 thing needs a look');
    expect(g.cardStatus).toBe('attention');
  });

  it('look: two attention reports say "2 things need a look"', () => {
    const a = report('water_ingress', { status: 'attention', data: waterData({ missed: 2 }) });
    const b = report('stock_check', { status: 'attention', data: stockData() });
    const g = glance({ feed: feed({ reports: [sales(), a, b] }), alerts: [alertOf(a), alertOf(b)] });
    expect(g.word).toBe('2 things need a look');
  });

  it('look: an attention report a task already covers is not counted again', () => {
    const r = report('du_otp', { status: 'attention' });
    const c = countsOf({ feed: feed({ tasks: [task({ kind: 'du_otp' })], reports: [r] }), role: 'owner', now: NOW });
    expect(c).toEqual({ needYou: 1, look: 0, doneToday: 0 });
  });

  it('look: an aged-out alarm (status info) is not a look', () => {
    const r = report('water_ingress', { status: 'info', data: waterData({ missed: 2 }) });
    expect(countsOf({ feed: feed({ reports: [r] }), role: 'owner', now: NOW }).look).toBe(0);
  });

  it('look: only the newest report of a kind counts (an old attention behind a fresh ok is gone)', () => {
    const old = report('credit_dod', { status: 'attention', sentAt: '2026-11-25T10:00:00.000Z', data: creditData() });
    const fresh = report('credit_dod', { status: 'ok', sentAt: '2026-11-27T10:00:00.000Z', data: creditData() });
    expect(countsOf({ feed: feed({ reports: [old, fresh] }), role: 'owner', now: NOW }).look).toBe(0);
  });

  it('look: a manager is never asked about an owner-only report', () => {
    const r = report('credit_dod', { status: 'attention', data: creditData() });
    expect(countsOf({ feed: feed({ reports: [r] }), role: 'manager', now: NOW }).look).toBe(0);
    expect(countsOf({ feed: feed({ reports: [r] }), role: 'owner', now: NOW }).look).toBe(1);
  });

  it('look: the calm missing-report row is a look', () => {
    const now = ist(TODAY, '11:30');
    const g = glance({ now, fetchedAt: now.getTime(), feed: feed({ reports: [sales('2026-11-25')] }) });
    expect(g.verdict).toBe('look');
    expect(g.missingReport).toBe(true);
    expect(g.sentence).toBe("Yesterday's sales report has not come yet.");
  });

  it('fine: none of the above and the feed is fresh', () => {
    const g = glance();
    expect(g.verdict).toBe('fine');
    expect(g.word).toBe('All fine');
    expect(g.cardStatus).toBe('ok');
    expect(g.n).toBe(0);
  });

  it('no_reports: live with no report, receipt or task yet is not "fine"', () => {
    const g = glance({ feed: feed() });
    expect(g.verdict).toBe('no_reports');
    expect(g.word).toBe('Your first reports come after the next run');
  });
});

describe('never fine', () => {
  const k = (over: Parameters<typeof kavachItem>[0]) => kavach({ now: [kavachItem(over)], counts: { late: over?.late ? 1 : 0, sentBack: over?.state === 'sent_back' ? 1 : 0 } });
  const attention = report('water_ingress', { status: 'attention', data: waterData({ missed: 2 }) });
  const now1130 = ist(TODAY, '11:30');

  const cases: Array<[string, Partial<GlanceInput>]> = [
    ['an attention alert', { feed: feed({ reports: [sales(), attention] }), alerts: [alertOf(attention)] }],
    ['an attention report even when the alert list is empty', { feed: feed({ reports: [sales(), attention] }) }],
    ['a problem alert', { feed: feed({ reports: [attention] }), alerts: [alertOf(attention, 'problem')] }],
    ['an open task', { feed: feed({ tasks: [task()], reports: [sales()] }) }],
    ['a late task', { feed: feed({ tasks: [task({ late: true })], reports: [sales()] }) }],
    ['a late Kavach point', { kavach: k({ late: true }) }],
    ['a sent-back Kavach point', { kavach: k({ state: 'sent_back', sentBack: { reason: 'other', note: null, at: '2026-11-26T10:00:00.000Z' } }) }],
    ['a missing expected report', { now: now1130, fetchedAt: now1130.getTime(), feed: feed({ reports: [sales('2026-11-24')] }) }],
    ['a stale feed', { fetchedAt: FETCHED_NOW - FEED_FRESH_MS - 1 }],
    ['a feed that failed with nothing in hand', { feed: undefined, feedFailed: true }],
    ['a feed that was never fetched', { fetchedAt: null }],
    ['a blocked supply', { feed: feed({ reports: [report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 1 }) })] }) }],
  ];
  it.each(cases)('%s', (_name, over) => {
    expect(glance(over).verdict).not.toBe('fine');
  });

  it('the bar and the card agree: the card never shows fewer than the badge', () => {
    const t = [task(), task()];
    const g = glance({ feed: feed({ tasks: t }), kavach: k({ late: true }) });
    expect(g.counts.needYou).toBe(3);
    expect(g.n).toBe(g.counts.needYou);
    expect(g.needsMe).toHaveLength(g.counts.needYou);
  });

  it('a stock reading older than a day is neither fine nor a problem: stock never moves the verdict', () => {
    const old = report('stock_check', { status: 'ok', data: stockData({ readingAt: '2026-11-25T03:40:00.000Z' }) });
    expect(glance({ feed: feed({ reports: [sales(), old] }) }).verdict).toBe('fine');
    const rows = pumpNowRows({ feed: feed({ reports: [old] }), role: 'owner', lang: 'en', now: NOW });
    const stock = rows.find((r) => r.id === 'stock');
    expect(stock?.status).toBe('info');
    expect(stock?.meta).toMatch(/old/);
  });
});

describe('the sentence under the verdict', () => {
  it('names the first two reasons, in plain words', () => {
    const g = glance({ feed: feed({ tasks: [task({ title: 'Send the safety declaration' }), task({ title: "Send today's register photo" }), task({ title: 'A third' })] }) });
    expect(g.sentence).toBeDefined();
    const sentences = g.sentence!.split('. ');
    expect(sentences).toHaveLength(2);
    expect(g.sentence).not.toContain('A third');
  });

  it('puts the problems first when there are problems', () => {
    const r = report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 2 }) });
    const g = glance({ feed: feed({ tasks: [task({ title: 'Send the safety declaration' })], reports: [r] }), alerts: [{ report: r, headline: 'Supply is stopped', severity: 'problem' }] });
    expect(g.sentence?.startsWith('Supply is stopped')).toBe(true);
  });

  it('a blocked supply with no alert still says so', () => {
    const r = report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 2 }) });
    const g = glance({ feed: feed({ reports: [r] }) });
    expect(g.sentence).toContain('Supply is stopped');
  });

  it('is said in Hindi for a Hindi reader', () => {
    const g = glance({ lang: 'hi', feed: feed({ tasks: [task()] }) });
    expect(g.word).toBe('आपके लिए 1 काम है');
  });

  it('is said in Hinglish with no Devanagari', () => {
    const g = glance({ lang: 'hl', feed: feed({ tasks: [task(), task()] }) });
    expect(g.word).toBe('Aapke liye 2 kaam hain');
    expect(g.word).not.toMatch(/[ऀ-ॿ]/);
  });
});

describe('as-of line', () => {
  it('"as of" is the newest report in the feed when the feed is fresh', () => {
    const a = report('dsr_sales', { sentAt: '2026-11-27T01:35:00.000Z', data: salesData() });
    const b = report('water_ingress', { sentAt: '2026-11-27T04:05:00.000Z', data: waterData() });
    expect(glance({ feed: feed({ reports: [a, b] }) }).asOf).toEqual({ kind: 'at', at: '2026-11-27T04:05:00.000Z' });
  });

  it('"Checked" is the fetch time when the feed is older than 30 minutes', () => {
    const fetched = FETCHED_NOW - 40 * 60_000;
    const g = glance({ fetchedAt: fetched });
    expect(g.asOf).toEqual({ kind: 'checked', at: new Date(fetched).toISOString() });
  });

  it('no feed: nothing to say', () => {
    expect(glance({ feed: undefined }).asOf).toEqual({ kind: 'none' });
  });
});

describe('the missing expected report (spec 3.2)', () => {
  it('the constant is 11:00 India time', () => {
    expect(EXPECTED_BY.dsr_sales).toBe(11);
  });

  const f = (day: string) => feed({ reports: [sales(day)] });

  it('is missing at 11:00 when the newest day is before yesterday', () => {
    expect(missingSalesReport(f('2026-11-25'), ist(TODAY, '11:00')).missing).toBe(true);
  });

  it('is not missing at 10:59: the hour has not come', () => {
    expect(missingSalesReport(f('2026-11-25'), ist(TODAY, '10:59')).missing).toBe(false);
  });

  it('is not missing when yesterday is there', () => {
    expect(missingSalesReport(f(YESTERDAY), ist(TODAY, '15:00')).missing).toBe(false);
  });

  it('is not missing when a variation sheet holds yesterday (a message with both sheets is tagged variation)', () => {
    const v = report('dsr_variation', { day: YESTERDAY, data: variationData() });
    const fd = feed({ reports: [sales('2026-11-25'), v] });
    expect(missingSalesReport(fd, ist(TODAY, '15:00')).missing).toBe(false);
  });

  it('is not missing when no sales report came in the last 7 days: that proves nothing is attached', () => {
    expect(missingSalesReport(f('2026-11-19'), ist(TODAY, '15:00')).missing).toBe(false);
    expect(missingSalesReport(feed(), ist(TODAY, '15:00')).missing).toBe(false);
    expect(missingSalesReport(null, ist(TODAY, '15:00')).missing).toBe(false);
  });

  it('is missing 7 days back (the edge of the window)', () => {
    expect(missingSalesReport(f('2026-11-20'), ist(TODAY, '15:00')).missing).toBe(true);
  });

  it('reads the business day, not the day it was sent: a DSR sent at 12:20 am for yesterday is not "today"', () => {
    const r = report('dsr_sales', { day: YESTERDAY, sentAt: '2026-11-26T18:50:00.000Z', data: salesData() });
    expect(missingSalesReport(feed({ reports: [r] }), ist(TODAY, '15:00')).missing).toBe(false);
  });

  it('falls back to the India day of sentAt when a report has no business day', () => {
    const r = report('dsr_sales', { day: undefined, sentAt: '2026-11-26T20:00:00.000Z', data: salesData() });
    // 20:00 UTC on the 26th is 01:30 on the 27th in India: that is "today", so yesterday is missing.
    expect(missingSalesReport(feed({ reports: [r] }), ist(TODAY, '15:00')).newestDay).toBe(TODAY);
  });

  it('crosses midnight India time: at 23:59 on the 27th yesterday is the 26th, one minute later it is the 27th', () => {
    const fd = f(YESTERDAY);
    expect(missingSalesReport(fd, ist('2026-11-27', '23:59')).missing).toBe(false);
    expect(missingSalesReport(fd, ist('2026-11-28', '00:01')).missing).toBe(false); // before 11:00
    expect(missingSalesReport(fd, ist('2026-11-28', '11:00')).missing).toBe(true);
  });

  it('the calm row appears in Pump now, and never says "you missed"', () => {
    const rows = pumpNowRows({ feed: f('2026-11-25'), role: 'owner', lang: 'en', now: ist(TODAY, '12:00') });
    const row = rows.find((r) => r.id === 'missing');
    expect(row?.text).toBe("Yesterday's sales report has not come yet");
    expect(row?.text).not.toMatch(/missed/i);
    expect(row?.status).toBe('info');
    expect(pumpNowRows({ feed: f(YESTERDAY), role: 'owner', lang: 'en', now: ist(TODAY, '12:00') }).some((r) => r.id === 'missing')).toBe(false);
  });
});

describe('countsOf', () => {
  it('with no feed it is zeros (the bar asks nothing where it has nothing)', () => {
    expect(countsOf({ feed: undefined, kavach: undefined, role: 'owner', now: NOW })).toEqual({ needYou: 0, look: 0, doneToday: 0 });
    expect(countsOf({ feed: null, kavach: null, role: 'owner', now: NOW })).toEqual({ needYou: 0, look: 0, doneToday: 0 });
  });

  it('with no feed, Kavach points that need the reader still count (the bar badge)', () => {
    const k = kavach({ now: [kavachItem({ late: true })], counts: { late: 1 } });
    expect(countsOf({ feed: undefined, kavach: k, role: 'owner', now: NOW }).needYou).toBe(1);
  });

  it('doneToday is the number of receipts', () => {
    const done = [report('declaration_filed', { data: declarationData() }), report('du_otp')];
    expect(countsOf({ feed: feed({ done }), role: 'owner', now: NOW }).doneToday).toBe(2);
  });

  it('is the same number the verdict card shows', () => {
    const r = report('water_ingress', { status: 'attention', data: waterData({ missed: 2 }) });
    const fd = feed({ tasks: [task(), task()], reports: [r] });
    const k = kavach({ now: [kavachItem({ late: true })], counts: { late: 1 } });
    const input = { feed: fd, kavach: k, role: 'owner' as const, now: NOW };
    const g = glance({ feed: fd, kavach: k, alerts: [alertOf(r)] });
    expect(g.counts).toEqual(countsOf(input));
    expect(g.verdict).toBe('needs_you');
    expect(g.n).toBe(countsOf(input).needYou);
  });

  it('the look count includes the missing-report row', () => {
    const now = ist(TODAY, '12:00');
    expect(countsOf({ feed: feed({ reports: [sales('2026-11-24')] }), role: 'owner', now }).look).toBe(1);
  });
});

describe('daysUntil across midnight India time', () => {
  it('counts from the date in India time: 23:59:59 on the 26th is still the 26th', () => {
    expect(daysUntil('2026-11-30', new Date('2026-11-26T18:29:59.000Z'))).toBe(4);
    expect(daysUntil('2026-11-30', new Date('2026-11-26T18:30:00.000Z'))).toBe(3);
  });

  it('a deposit "3 days left" is recounted two days later, never frozen', () => {
    const credit = report('credit_dod', { data: creditData({ date: '2026-11-30', daysLeft: 3 }) });
    const fd = feed({ reports: [credit] });
    const line = (now: Date) => pulseOf({ feed: fd, kavach: null, role: 'owner', lang: 'en', now, alerts: [] }).find((s) => s.id === 'deposit')?.lines;
    expect(line(ist('2026-11-27', '09:40'))).toContain('3 days left');
    expect(line(ist('2026-11-29', '09:40'))).toContain('1 day left');
    expect(line(ist('2026-11-30', '09:40'))).toContain('Last day is today');
    expect(line(ist('2026-12-01', '09:40'))).toContain('1 day late');
  });

  it('the deposit tile flips at India midnight', () => {
    const credit = report('credit_dod', { data: creditData({ date: '2026-11-30' }) });
    const fd = feed({ reports: [credit] });
    const at = (iso: string) => pulseOf({ feed: fd, kavach: null, role: 'owner', lang: 'en', now: new Date(iso), alerts: [] }).find((s) => s.id === 'deposit')?.lines;
    expect(at('2026-11-26T18:29:59.000Z')).toContain('4 days left');
    expect(at('2026-11-26T18:30:00.000Z')).toContain('3 days left');
  });

  it('a paper recounts from its date and not from its frozen daysLeft', () => {
    expect(paperDaysLeft({ validUntil: '2026-12-06', daysLeft: 20 }, NOW)).toBe(9);
    expect(paperDaysLeft({ validUntil: '2026-12-06', daysLeft: 20 }, new Date('2026-12-05T18:30:00.000Z'))).toBe(0);
    expect(paperDaysLeft({ validUntil: undefined as unknown as string, daysLeft: 6 }, NOW)).toBe(6);
  });

  it('a paper that ended is "expired", a problem shape', () => {
    const p = report('paper_expiry', { data: paperData([{ daysLeft: 3, validUntil: '2026-11-25' }]) });
    const slot = pulseOf({ feed: feed({ reports: [p] }), kavach: null, role: 'owner', lang: 'en', now: NOW, alerts: [] }).find((s) => s.id === 'papers');
    expect(slot?.lines[0]).toBe('Fire NOC has expired');
    expect(slot?.status).toBe('problem');
  });
});

describe('the four numbers', () => {
  const owner = (fd: TodayFeed, over: Partial<Parameters<typeof pulseOf>[0]> = {}) =>
    pulseOf({ feed: fd, kavach: undefined, role: 'owner', lang: 'en', now: NOW, alerts: [], ...over });

  it('sales: litres, change on the same weekday last week, and the month so far', () => {
    const [s] = owner(feed({ reports: [sales()] }));
    expect(s?.id).toBe('sales');
    expect(s?.position).toBe(1);
    expect(s?.value).toBe(24_000);
    expect(s?.deltaPct).toBe(9);
    expect(s?.lines[0]).toBe('24,000 L sold yesterday');
    expect(s?.lines[1]).toMatch(/^9% more than last /);
    expect(s?.lines[2]).toBe('This month so far 4,10,000 L');
    expect(s?.bars).toHaveLength(7);
  });

  it('sales: a day not worked out yet is never drawn as 0', () => {
    const pending = report('dsr_sales', { data: salesData({ soldL: null }) });
    expect(owner(feed({ reports: [pending] })).find((s) => s.id === 'sales')).toBeUndefined();
  });

  it('sales: no same-weekday figure gives no change line', () => {
    const r = report('dsr_sales', { data: salesData({ lastWeek: null }) });
    const s = owner(feed({ reports: [r] }))[0];
    expect(s?.deltaPct).toBeNull();
    expect(s?.lines.some((l) => /more than|less than|Same as/.test(l))).toBe(false);
  });

  it('variation: the worst fuel first, and a fuel beyond the limit warns only when no alert already says so', () => {
    const v = report('dsr_variation', { status: 'attention', data: variationData({ offL: 98 }) });
    const slot = (alerts: Alert[]) => owner(feed({ reports: [v] }), { alerts }).find((s) => s.id === 'variation');
    expect(slot([])?.lines[0]).toBe('Diesel is 98 L beyond the limit');
    expect(slot([])?.status).toBe('attention');
    expect(slot([alertOf(v)])?.status).toBe('ok');
  });

  it('variation: a day before the first inspection says nothing', () => {
    const v = report('dsr_variation', { data: variationData({ beforeInspection: true }) });
    expect(owner(feed({ reports: [v] })).find((s) => s.id === 'variation')).toBeUndefined();
  });

  it('slot 3 is the deposit for an owner and the water checks for a manager', () => {
    const fd = feed({ reports: [report('credit_dod', { data: creditData() }), report('water_ingress', { data: waterData() })] });
    expect(owner(fd).find((s) => s.position === 3)?.id).toBe('deposit');
    expect(owner(fd, { role: 'manager' }).find((s) => s.position === 3)?.id).toBe('water');
  });

  it('slot 3 is the water checks for an owner with no credit report', () => {
    expect(owner(feed({ reports: [report('water_ingress', { data: waterData() })] })).find((s) => s.position === 3)?.id).toBe('water');
  });

  it('the deposit tile is absent when nothing is due', () => {
    const settled = report('credit_dod', { data: creditData({ verdict: 'settled', amount: 0 }) });
    expect(owner(feed({ reports: [settled] })).find((s) => s.id === 'deposit')).toBeUndefined();
  });

  it('a manager never gets an owner-only tile (the recheck, even if the server sent it)', () => {
    const fd = feed({ role: 'manager', reports: [report('credit_dod', { data: creditData() })] });
    expect(owner(fd, { role: 'manager' }).find((s) => s.id === 'deposit')).toBeUndefined();
  });

  it('water: "10 of 12 checks done, 2 missed"', () => {
    const w = report('water_ingress', { status: 'attention', data: waterData({ recorded: 10, total: 12 }) });
    const slot = owner(feed({ reports: [w] })).find((s) => s.id === 'water');
    expect(slot?.lines).toEqual(['10 of 12 checks done', '2 missed']);
  });

  it('slot 4 is the score while Kavach is on and the soonest paper while it is off', () => {
    const fd = feed({ reports: [report('paper_expiry', { data: paperData([{ daysLeft: 9, validUntil: '2026-12-06' }]) })] });
    expect(owner(fd, { kavach: kavach({ pct: 62 }) }).find((s) => s.position === 4)).toMatchObject({ id: 'score', value: 62 });
    expect(owner(fd, { kavach: kavach({ on: false }) }).find((s) => s.position === 4)).toMatchObject({ id: 'papers', value: 9 });
    expect(owner(fd, { kavach: null }).find((s) => s.position === 4)?.id).toBe('papers');
  });

  it('slot 4 is left out while the Kavach view is still loading, so the tile never flips', () => {
    const fd = feed({ reports: [report('paper_expiry', { data: paperData([{ daysLeft: 9, validUntil: '2026-12-06' }]) })] });
    expect(owner(fd, { kavach: undefined }).find((s) => s.position === 4)).toBeUndefined();
  });

  it('slots keep their fixed order and a slot with no source is left out', () => {
    const fd = feed({ reports: [sales(), report('water_ingress', { data: waterData() })] });
    const slots = owner(fd, { kavach: kavach() });
    expect(slots.map((s) => s.position)).toEqual([1, 3, 4]);
  });
});

describe('Pump now', () => {
  const rows = (fd: TodayFeed, over: Partial<Parameters<typeof pumpNowRows>[0]> = {}) =>
    pumpNowRows({ feed: fd, role: 'owner', lang: 'en', now: NOW, ...over });

  it('tanker: "Order the tanker today" with the Plan the order button', () => {
    const plan = report('load_plan', { status: 'attention', data: planData({ code: 'ORDER_TODAY' }) });
    const row = rows(feed({ reports: [plan] })).find((r) => r.id === 'tanker');
    expect(row?.text).toBe('Order the tanker today');
    expect(row?.action).toBe('planOrder');
    expect(row?.serviceId).toBe('load-planner');
    expect(row?.more?.[0]).toMatch(/^Tomorrow's cover: Diesel/);
  });

  it('tanker: an order on its way says when it arrives, with no button', () => {
    const plan = report('load_plan', { data: planData({ code: 'NEXT_ORDER' }) });
    const row = rows(feed({ reports: [plan] })).find((r) => r.id === 'tanker');
    expect(row?.text).toMatch(/^Arrives .* 2:00 pm$/);
    expect(row?.action).toBeUndefined();
  });

  it('tanker: an order alarm that has aged out is information and drops the button', () => {
    const plan = report('load_plan', { status: 'info', data: planData({ code: 'ORDER_TODAY' }) });
    const row = rows(feed({ reports: [plan] })).find((r) => r.id === 'tanker');
    expect(row?.action).toBeUndefined();
  });

  it('stock: with no reading it says so and offers a stock check', () => {
    const row = rows(feed()).find((r) => r.id === 'stock');
    expect(row?.text).toBe('No stock reading yet');
    expect(row?.action).toBe('askStock');
  });

  it('stock: cover per fuel is counted again from the run-out date', () => {
    const s = report('stock_check', { data: stockData({ fuels: [{ fuelKey: 'HSD', daysLeft: 4.2, runOutOn: '2026-12-01' }] }) });
    const row = rows(feed({ reports: [s] })).find((r) => r.id === 'stock');
    expect(row?.text).toMatch(/^Diesel lasts 4 days, runs out /);
    const later = rows(feed({ reports: [s] }), { now: ist('2026-11-30', '09:00') }).find((r) => r.id === 'stock');
    expect(later?.text).toMatch(/^Diesel lasts 1 day, runs out /);
  });

  it('stock: the load plan\'s pools stand in when there is no stock check', () => {
    const plan = report('load_plan', { data: planData() });
    const row = rows(feed({ reports: [plan] })).find((r) => r.id === 'stock');
    expect(row?.serviceId).toBe('load-planner');
    expect(row?.text).toMatch(/^Diesel lasts /);
  });

  it('water, supply, papers and the safety declaration each show when their data exists', () => {
    const fd = feed({
      reports: [
        report('water_ingress', { status: 'attention', data: waterData({ recorded: 10, total: 12 }) }),
        report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 2 }) }),
        report('paper_expiry', { data: paperData([{ daysLeft: 9, validUntil: '2026-12-06' }]) }),
        report('declaration_filed', { data: declarationData({ streak: 23 }) }),
      ],
    });
    const got = rows(fd);
    expect(got.find((r) => r.id === 'water')?.text).toBe('10 of 12 checks done, 2 missed');
    expect(got.find((r) => r.id === 'supply')?.text).toBe('Supply is stopped, 2 conditions pending');
    expect(got.find((r) => r.id === 'papers')?.text).toBe('Fire NOC: 9 days left');
    expect(got.find((r) => r.id === 'declaration')?.text).toBe('Safety declaration: 23 days in a row');
  });

  it('supply: open says open; an aged stop is information, not an alarm', () => {
    const open = report('ro_supply', { data: supplyData({ blocked: false }) });
    expect(rows(feed({ reports: [open] })).find((r) => r.id === 'supply')?.text).toBe('Supply is open');
    const aged = report('ro_supply', { status: 'info', data: supplyData({ blocked: true, failing: 1 }) });
    expect(rows(feed({ reports: [aged] })).find((r) => r.id === 'supply')?.status).toBe('info');
  });

  it('a row appears only when its data exists, and the stock row is always the first honest answer', () => {
    expect(rows(feed()).map((r) => r.id)).toEqual(['stock']);
  });

  it('a manager is not given the tanker row (its plan carries the owner\'s credit)', () => {
    // Owner-only data stays out of a manager's rows: here the plan is read with credit stripped by the server,
    // and the water row is read for the manager's role.
    const w = report('water_ingress', { data: waterData() });
    expect(rows(feed({ reports: [w] }), { role: 'manager' }).some((r) => r.id === 'water')).toBe(true);
  });
});

describe('Coming up', () => {
  const up = (fd: TodayFeed, over: Partial<Parameters<typeof comingUp>[0]> = {}) =>
    comingUp({ feed: fd, role: 'owner', lang: 'en', now: NOW, ...over });

  it('lists the next three dated things, soonest first, and no more', () => {
    const fd = feed({
      reports: [
        report('credit_dod', { data: creditData({ date: '2026-11-30' }) }),
        report('load_plan', { data: planData({ arriveOn: '2026-11-29' }) }),
        report('declaration_filed', { data: declarationData({ nextDueDay: '2026-11-28' }) }),
        report('paper_expiry', { data: paperData([{ daysLeft: 9, validUntil: '2026-12-06' }]) }),
      ],
    });
    const got = up(fd);
    expect(got).toHaveLength(COMING_UP_LIMIT);
    expect(got.map((g) => g.id)).toEqual(['declaration', 'tanker', 'deposit']);
    expect(got.map((g) => g.inDays)).toEqual([1, 2, 3]);
  });

  it('leaves out a date that has passed and one more than 30 days away', () => {
    const fd = feed({
      reports: [report('paper_expiry', { data: paperData([{ daysLeft: 1, validUntil: '2026-11-25' }, { daysLeft: 90, validUntil: '2027-02-25' }]) })],
    });
    expect(up(fd)).toEqual([]);
  });

  it('counts a date today as 0 days away', () => {
    const fd = feed({ reports: [report('declaration_filed', { data: declarationData({ nextDueDay: TODAY }) })] });
    expect(up(fd)[0]?.inDays).toBe(0);
  });

  it('a manager never sees the deposit date', () => {
    const fd = feed({ reports: [report('credit_dod', { data: creditData({ date: '2026-11-30' }) })] });
    expect(up(fd, { role: 'manager' })).toEqual([]);
    expect(up(fd, { role: 'owner' }).map((g) => g.id)).toEqual(['deposit']);
  });

  it('a settled deposit is not coming up', () => {
    const fd = feed({ reports: [report('credit_dod', { data: creditData({ verdict: 'settled', amount: 0 }) })] });
    expect(up(fd)).toEqual([]);
  });

  it('a Kavach point that opens soon is listed when Kavach is on', () => {
    const k = kavach({ upcoming: [kavachItem({ state: 'todo', opensAt: '2026-12-02T03:00:00.000Z' })] });
    expect(up(feed(), { kavach: k })[0]).toMatchObject({ id: 'kavach', day: '2026-12-02', inDays: 5 });
    expect(up(feed(), { kavach: kavach({ on: false, upcoming: k.upcoming }) })).toEqual([]);
  });

  it('keeps the feed\'s order when two things fall on the same day', () => {
    const fd = feed({
      reports: [
        report('load_plan', { data: planData({ arriveOn: '2026-11-29' }) }),
        report('declaration_filed', { data: declarationData({ nextDueDay: '2026-11-29' }) }),
      ],
    });
    expect(up(fd).map((g) => g.id)).toEqual(['tanker', 'declaration']);
  });
});

describe('the pump is read in the reader\'s language', () => {
  it.each(['en', 'hi', 'hl'] as const)('every Pump-now sentence is non-empty in %s', (lang) => {
    const fd = feed({
      reports: [
        report('water_ingress', { status: 'attention', data: waterData() }),
        report('ro_supply', { status: 'attention', data: supplyData({ blocked: true, failing: 2 }) }),
        report('paper_expiry', { data: paperData([{ daysLeft: 9, validUntil: '2026-12-06' }]) }),
        report('declaration_filed', { data: declarationData() }),
        report('load_plan', { status: 'attention', data: planData({ code: 'ORDER_TODAY' }) }),
      ],
    });
    for (const r of pumpNowRows({ feed: fd, role: 'owner', lang, now: NOW })) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.text).not.toMatch(/glance\./);
      if (lang === 'hl') expect(r.text).not.toMatch(/[ऀ-ॿ]/);
    }
  });
});
