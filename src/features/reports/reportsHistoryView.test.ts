import { describe, expect, it, vi } from 'vitest';

import { translate } from '@/lib/i18n';
import type { ReportSummary, TodayReport } from '@dk/shared/types';

vi.mock('./registry', () => {
  const fake = {
    Overlay: () => null,
    Glyph: () => null,
    tile: () => null,
    alert: (data: { alert?: 'problem' | 'attention' }) =>
      data.alert ? { headline: 'h', line: 'l', severity: data.alert } : null,
    headline: (data: { kind: string }) => `line:${data.kind}`,
    share: () => '',
  };
  return { viewOfData: () => fake, getKindView: () => fake, KIND_VIEWS: {} };
});

const {
  businessDayOf,
  changeLine,
  dataOfRow,
  groupHistory,
  kindsNeedingLook,
  monthCard,
  needsLook,
  readableReports,
  rowHeadline,
  rowStatus,
} = await import('./reportsHistoryView');

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);
// 24 Nov 2026, 11:00 in India.
const NOW = new Date('2026-11-24T05:30:00.000Z');

let n = 0;
function row(over: Partial<TodayReport> = {}): TodayReport {
  n += 1;
  return {
    id: `m${n}`,
    kind: 'dsr_sales',
    status: 'ok',
    sentAt: '2026-11-24T04:00:00.000Z',
    headline: 'the words',
    attachments: [],
    conversationId: 'c1',
    messageId: `m${n}`,
    ...over,
  };
}

describe('groupHistory: by the business day, not the day sent', () => {
  it('puts a sales report sent just after midnight for yesterday under Yesterday, not Today', () => {
    // 12:20 am on the 24th in India (18:50 UTC on the 23rd), about the 23rd.
    const groups = groupHistory(
      [row({ sentAt: '2026-11-23T18:50:00.000Z', day: '2026-11-23' })],
      NOW,
      'en',
      t,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.day).toBe('2026-11-23');
    expect(groups[0]!.heading).toBe('Yesterday');
  });

  it('heads the days in words and puts the newest business day first, whatever order the rows came in', () => {
    const groups = groupHistory(
      [
        // Sent today but about the 22nd, then sent yesterday about the 23rd, then today's own.
        row({ sentAt: '2026-11-24T04:00:00.000Z', day: '2026-11-22' }),
        row({ sentAt: '2026-11-23T10:00:00.000Z', day: '2026-11-23' }),
        row({ sentAt: '2026-11-22T10:00:00.000Z', day: '2026-11-24', kind: 'water_ingress' }),
        row({ sentAt: '2026-11-22T04:00:00.000Z', day: '2026-11-22', kind: 'stock_check' }),
      ],
      NOW,
      'en',
      t,
    );
    expect(groups.map((g) => g.heading)).toEqual(['Today', 'Yesterday', 'Sun 22 Nov']);
    expect(groups.map((g) => g.rows.length)).toEqual([1, 1, 2]);
  });

  it('keeps the order rows arrived in inside one day', () => {
    const a = row({ kind: 'stock_check', day: '2026-11-23' });
    const b = row({ kind: 'tanker_density', day: '2026-11-23' });
    const [g] = groupHistory([a, b], NOW, 'en', t);
    expect(g!.rows.map((r) => r.report.messageId)).toEqual([a.messageId, b.messageId]);
  });

  it('falls back to the Indian day it was sent for a report with no day, never the UTC day', () => {
    // 19:00 UTC on the 23rd is half past midnight on the 24th in India.
    const r = row({ sentAt: '2026-11-23T19:00:00.000Z', kind: 'announcement' });
    expect(businessDayOf(r)).toBe('2026-11-24');
    expect(groupHistory([r], NOW, 'en', t)[0]!.heading).toBe('Today');
    // A day that is not a date is not used.
    expect(businessDayOf(row({ day: 'soon', sentAt: '2026-11-20T04:00:00.000Z' }))).toBe('2026-11-20');
  });

  it("words the headings in the reader's language", () => {
    const hi = groupHistory([row({ day: '2026-11-24' })], NOW, 'hi', (k, v) => translate('hi', k, v));
    expect(hi[0]!.heading).toBe('आज');
    const hl = groupHistory([row({ day: '2026-11-23' })], NOW, 'hl', (k, v) => translate('hl', k, v));
    expect(hl[0]!.heading).toBe('Kal');
    const old = groupHistory([row({ day: '2026-11-17' })], NOW, 'hi', (k, v) => translate('hi', k, v));
    expect(old[0]!.heading).toBe('मंगल 17 नवंबर');
  });

  it('marks the older of two reports of a once-a-day kind for the same business day as replaced', () => {
    const newer = row({ kind: 'dsr_sales', day: '2026-11-23', sentAt: '2026-11-24T05:00:00.000Z' });
    const older = row({ kind: 'dsr_sales', day: '2026-11-23', sentAt: '2026-11-24T03:00:00.000Z' });
    const otherDay = row({ kind: 'dsr_sales', day: '2026-11-22', sentAt: '2026-11-23T05:00:00.000Z' });
    const rows = groupHistory([newer, older, otherDay], NOW, 'en', t).flatMap((g) => g.rows);
    expect(rows.map((r) => [r.report.messageId, r.replaced])).toEqual([
      [newer.messageId, false],
      [older.messageId, true],
      [otherDay.messageId, false],
    ]);
  });

  it('never calls two tanker receipts, or two reports with no day, replaced: they are different reports', () => {
    const rows = groupHistory(
      [
        row({ kind: 'tt_ack', day: '2026-11-23' }),
        row({ kind: 'tt_ack', day: '2026-11-23' }),
        row({ kind: 'ledger_watch' }),
        row({ kind: 'ledger_watch' }),
      ],
      NOW,
      'en',
      t,
    ).flatMap((g) => g.rows);
    expect(rows.every((r) => !r.replaced)).toBe(true);
  });

  it('tags a revised DSR as corrected, and a message with no snapshot but a picture as a picture', () => {
    const revised = row({ kind: 'dsr_sales', day: '2026-11-23', data: { kind: 'dsr_sales', v: 1, revised: true, products: [] } as never });
    const plain = row({ kind: 'dsr_sales', day: '2026-11-22', data: { kind: 'dsr_sales', v: 1, revised: false, products: [] } as never });
    const old = row({
      kind: 'dsr_variation',
      day: '2026-11-21',
      attachments: [{ storageKey: 'k', filename: 'a.png', contentType: 'image/png', size: 1, kind: 'image', url: '' }],
    });
    const wordsOnly = row({ kind: 'announcement', day: '2026-11-20' });
    const rows = groupHistory([revised, plain, old, wordsOnly], NOW, 'en', t).flatMap((g) => g.rows);
    expect(rows.map((r) => r.corrected)).toEqual([true, false, false, false]);
    expect(rows.map((r) => r.picture)).toEqual([false, false, true, false]);
  });

  it('marks a report New only when it came after the last visit, and never on a first visit', () => {
    const before = row({ day: '2026-11-22', sentAt: '2026-11-23T04:00:00.000Z', kind: 'stock_check' });
    const after = row({ day: '2026-11-23', sentAt: '2026-11-24T04:00:00.000Z', kind: 'stock_check' });
    const since = '2026-11-23T10:00:00.000Z';
    const rows = groupHistory([after, before], NOW, 'en', t, { since }).flatMap((g) => g.rows);
    expect(rows.map((r) => r.isNew)).toEqual([true, false]);
    const first = groupHistory([after, before], NOW, 'en', t, { since: null }).flatMap((g) => g.rows);
    expect(first.every((r) => !r.isNew)).toBe(true);
    // A date the browser stored badly is a first visit too.
    const bad = groupHistory([after], NOW, 'en', t, { since: 'garbage' }).flatMap((g) => g.rows);
    expect(bad[0]!.isNew).toBe(false);
  });

  it('is empty for no reports', () => {
    expect(groupHistory([], NOW, 'en', t)).toEqual([]);
  });
});

describe('needs a look', () => {
  const dsr = (alert: string | undefined, over: Partial<TodayReport> = {}) =>
    row({ kind: 'dsr_sales', day: '2026-11-23', data: { kind: 'dsr_sales', v: 1, alert, products: [] } as never, ...over });

  it('keeps only the rows that ask for a look, and never a replaced older copy', () => {
    const calm = dsr(undefined);
    const attention = row({ kind: 'stock_check', day: '2026-11-23', status: 'attention' });
    const problem = dsr('problem', { day: '2026-11-22', sentAt: '2026-11-23T04:00:00.000Z' });
    // Two sales reports for the 21st: the older one alarms, the newer one (the fix) does not.
    const newerFix = dsr(undefined, { day: '2026-11-21', sentAt: '2026-11-22T06:00:00.000Z' });
    const olderAlarm = dsr('problem', { day: '2026-11-21', sentAt: '2026-11-22T04:00:00.000Z' });
    const groups = groupHistory([calm, attention, problem, newerFix, olderAlarm], NOW, 'en', t, { needsOnly: true });
    const ids = groups.flatMap((g) => g.rows.map((r) => r.report.messageId));
    expect(ids).toEqual([attention.messageId, problem.messageId]);
    // The day with nothing left is gone with its heading.
    expect(groups.map((g) => g.day)).toEqual(['2026-11-23', '2026-11-22']);
  });

  it('does not call an aged alarm a look: the server turned it to information', () => {
    const aged = row({ kind: 'water_ingress', status: 'info', day: '2026-11-20', data: { kind: 'water_ingress', v: 1, alert: 'attention' } as never });
    expect(rowStatus(aged, 'en')).toBe('info');
    expect(needsLook({ report: aged, replaced: false }, 'en')).toBe(false);
    const current = row({ kind: 'water_ingress', status: 'attention', day: '2026-11-24', data: { kind: 'water_ingress', v: 1, alert: 'attention' } as never });
    expect(needsLook({ report: current, replaced: false }, 'en')).toBe(true);
  });
});

describe("a row's status and line", () => {
  it("uses the kind's own verdict first, then the report's tag", () => {
    expect(rowStatus(row({ status: 'ok', data: { kind: 'dsr_sales', v: 1, alert: 'problem' } as never }), 'en')).toBe('problem');
    expect(rowStatus(row({ status: 'attention', data: { kind: 'dsr_sales', v: 1 } as never }), 'en')).toBe('attention');
    expect(rowStatus(row({ status: 'info' }), 'en')).toBe('info');
  });

  it("says the kind's headline for a snapshot, and the message's own words for an old report", () => {
    expect(rowHeadline(row({ data: { kind: 'dsr_sales', v: 1 } as never }), 'en')).toBe('line:dsr_sales');
    expect(rowHeadline(row({ headline: 'old words' }), 'en')).toBe('old words');
  });

  it('reads a snapshot only of the right version and kind', () => {
    expect(dataOfRow(row({ kind: 'dsr_sales', data: { kind: 'dsr_sales', v: 1 } as never }))).toBeDefined();
    expect(dataOfRow(row({ kind: 'dsr_sales', data: { kind: 'stock_check', v: 1 } as never }))).toBeUndefined();
    expect(dataOfRow(row({ kind: 'dsr_sales', data: { kind: 'dsr_sales', v: 2 } as never }))).toBeUndefined();
  });

  it('lets a manager hold no owner-only report whatever the server sent', () => {
    const rows = [row({ kind: 'dsr_sales' }), row({ kind: 'credit_dod' }), row({ kind: 'calibration_claim' })];
    expect(readableReports(rows, false).map((r) => r.kind)).toEqual(['dsr_sales']);
    expect(readableReports(rows, true)).toHaveLength(3);
  });
});

// ── change against the last one ─────────────────────────────────────────────

const salesBlock = (soldL: number, lastL: number | null) => ({
  state: 'closed',
  closedDay: '2026-11-23',
  soldL,
  sameWeekdayLastWeek: lastL === null ? null : { day: '2026-11-16', soldL: lastL },
  trend: [],
  rows: [],
});
const salesRow = (soldL: number, lastL: number | null, extra: Record<string, unknown> = {}) =>
  row({
    kind: 'dsr_sales',
    day: '2026-11-23',
    data: {
      kind: 'dsr_sales',
      v: 1,
      revised: false,
      products: [{ key: 'HSD', tankNos: [1], sales: salesBlock(soldL, lastL) }],
      ...extra,
    } as never,
  });
const varRow = (day: string, figures: Record<string, number>) =>
  row({
    kind: 'dsr_variation',
    day,
    data: {
      kind: 'dsr_variation',
      v: 1,
      revised: false,
      sheets: ['variation'],
      products: Object.entries(figures).map(([key, variationL]) => ({
        key,
        tankNos: [1],
        variation: { tone: 'ok', variationL, permissibleL: 500, offL: 0, lowEdgeL: -500, highEdgeL: 500 },
      })),
    } as never,
  });

describe('changeLine: what changed since the last one', () => {
  it('says how sales stand against the same weekday last week, from the report itself', () => {
    expect(changeLine(salesRow(10_600, 10_000), undefined, 'en')).toEqual({
      dir: 'up',
      text: 'Diesel: 6% more than last Monday',
    });
    expect(changeLine(salesRow(9_000, 10_000), undefined, 'en')).toEqual({
      dir: 'down',
      text: 'Diesel: 10% less than last Monday',
    });
    expect(changeLine(salesRow(10_000, 10_000), undefined, 'en')!.dir).toBe('same');
    expect(changeLine(salesRow(10_000, 10_000), undefined, 'hi')!.text).toBe('डीज़ल: पिछले सोमवार जितना ही');
  });

  it('says nothing when there is no honest comparison', () => {
    expect(changeLine(salesRow(10_600, null), undefined, 'en')).toBeNull();
    expect(changeLine(salesRow(10_600, 0), undefined, 'en')).toBeNull();
    // Sales still being worked out are never compared.
    const pending = row({
      kind: 'dsr_sales',
      data: {
        kind: 'dsr_sales',
        v: 1,
        revised: false,
        products: [{ key: 'HSD', tankNos: [1], sales: { ...salesBlock(0, 10_000), state: 'pending', soldL: null } }],
      } as never,
    });
    expect(changeLine(pending, undefined, 'en')).toBeNull();
    // A picture-only report has no snapshot to read.
    expect(changeLine(row({ kind: 'dsr_sales' }), undefined, 'en')).toBeNull();
  });

  it('compares the stock variation with the report before it', () => {
    const now = varRow('2026-11-23', { HSD: -310, MS: 40 });
    const before = varRow('2026-11-22', { HSD: -120, MS: 40 });
    // A shortage that grew is "worse", said in words: an up arrow would read as good.
    expect(changeLine(now, before, 'en')).toEqual({
      dir: 'worse',
      text: 'Diesel: 310 L short, was 120 L short before. Worse.',
    });
    // Better than before is said as better, and "extra" is said as extra.
    const better = varRow('2026-11-23', { HSD: 60 });
    expect(changeLine(better, varRow('2026-11-22', { HSD: -300 }), 'en')).toEqual({
      dir: 'better',
      text: 'Diesel: 60 L extra, was 300 L short before. Better.',
    });
    expect(changeLine(now, before, 'hi')!.text).toBe('डीज़ल: 310 लीटर कम, पहले 120 लीटर कम था, और बिगड़ा');
    // Nothing to compare with, or nothing changed.
    expect(changeLine(now, undefined, 'en')).toBeNull();
    expect(changeLine(now, varRow('2026-11-22', { HSD: -310, MS: 40 }), 'en')).toBeNull();
  });

  it("compares credit used and the day's water checks with the report before", () => {
    const credit = (usedPct: number | null) =>
      row({ kind: 'credit_dod', day: '2026-11-23', data: { kind: 'credit_dod', v: 1, limit: { usedPct } } as never });
    expect(changeLine(credit(71), credit(64), 'en')).toEqual({ dir: 'plain', text: 'Credit limit used 71%, up from 64%' });
    expect(changeLine(credit(60), credit(64), 'en')!.text).toBe('Credit limit used 60%, down from 64%');
    expect(changeLine(credit(71), credit(71), 'en')).toBeNull();
    expect(changeLine(credit(71), credit(null), 'en')).toBeNull();

    const water = (recordedSlots: number, totalSlots: number) =>
      row({ kind: 'water_ingress', day: '2026-11-23', data: { kind: 'water_ingress', v: 1, recordedSlots, totalSlots } as never });
    expect(changeLine(water(9, 12), water(12, 12), 'en')).toEqual({
      dir: 'worse',
      text: '9 of 12 checks done, 12 of 12 before. Fewer checks.',
    });
    expect(changeLine(water(12, 12), water(12, 12), 'en')).toBeNull();
  });

  it('puts the line on the row from the next older report of its kind, skipping replaced copies and same-day ones', () => {
    const today = varRow('2026-11-23', { HSD: -310 });
    today.sentAt = '2026-11-24T05:00:00.000Z';
    const replacedCopy = varRow('2026-11-23', { HSD: -999 });
    replacedCopy.sentAt = '2026-11-24T03:00:00.000Z';
    const yesterday = varRow('2026-11-22', { HSD: -120 });
    const rows = groupHistory([today, replacedCopy, yesterday], NOW, 'en', t).flatMap((g) => g.rows);
    expect(rows[0]!.change!.text).toBe('Diesel: 310 L short, was 120 L short before. Worse.');
    // A replaced copy and the oldest row (nothing older loaded) carry no line.
    expect(rows[1]!.change).toBeNull();
    expect(rows[2]!.change).toBeNull();
  });
});

// ── the 30-day card ─────────────────────────────────────────────────────────

const summary = (byKind: ReportSummary['byKind']): ReportSummary => ({
  since: '2026-10-25T05:30:00.000Z',
  byKind,
});
const dayRange = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-11-${String(from + i).padStart(2, '0')}`);

describe('monthCard', () => {
  it('is nothing when no report came', () => {
    expect(monthCard(summary({}), NOW)).toBeNull();
  });

  it('adds up what came and what needed a look, counts water days and papers filed', () => {
    const card = monthCard(
      summary({
        dsr_sales: { count: 20, needLook: 1, days: dayRange(3, 22) },
        water_ingress: { count: 30, needLook: 2, days: dayRange(1, 24).slice(0, 27) },
        declaration_filed: { count: 5, needLook: 0, days: [] },
        mock_drill: { count: 1, needLook: 0, days: [] },
        tt_ack: { count: 4, needLook: 0, days: [] },
        stock_check: { count: 3, needLook: 0, days: [] },
      }),
      NOW,
    )!;
    expect(card.came).toBe(63);
    expect(card.needLook).toBe(3);
    expect(card.waterDays).toBe(24);
    expect(card.filings).toBe(10);
  });

  it('builds the sales strip up to yesterday and names the gaps as days, newest first', () => {
    // Reports for 3 to 22 Nov, except the 18th and the 12th. Yesterday (the 23rd) is missing too, at 11:00.
    const days = dayRange(3, 22).filter((d) => d !== '2026-11-18' && d !== '2026-11-12');
    const card = monthCard(summary({ dsr_sales: { count: days.length, needLook: 0, days } }), NOW)!;
    expect(card.missingSalesDays).toEqual(['2026-11-23', '2026-11-18', '2026-11-12']);
    expect(card.salesStrip).toHaveLength(14);
    expect(card.salesStrip![0]).toEqual({ day: '2026-11-10', state: 'came' });
    expect(card.salesStrip!.at(-1)).toEqual({ day: '2026-11-23', state: 'none' });
    expect(card.salesStrip!.find((d) => d.day === '2026-11-18')!.state).toBe('none');
  });

  it("does not call yesterday a gap before the hour the report is expected by", () => {
    const early = new Date('2026-11-24T03:00:00.000Z'); // 8:30 am in India
    const days = dayRange(3, 22);
    const card = monthCard(summary({ dsr_sales: { count: days.length, needLook: 0, days } }), early)!;
    expect(card.missingSalesDays).toEqual([]);
    expect(card.salesStrip!.at(-1)!.day).toBe('2026-11-22');
    // But a report that did come for yesterday is shown, early or not.
    const withYesterday = monthCard(summary({ dsr_sales: { count: 21, needLook: 0, days: dayRange(3, 23) } }), early)!;
    expect(withYesterday.salesStrip!.at(-1)).toEqual({ day: '2026-11-23', state: 'came' });
  });

  it('starts the strip when the first sales report came, so a new pump is not shown a month of gaps', () => {
    const days = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];
    const card = monthCard(summary({ dsr_sales: { count: 4, needLook: 0, days } }), NOW)!;
    expect(card.salesStrip!.map((d) => d.day)).toEqual(days);
    expect(card.missingSalesDays).toEqual([]);
  });

  it('counts a variation message that holds both sheets as a sales report for its day', () => {
    const card = monthCard(
      summary({
        dsr_sales: { count: 1, needLook: 0, days: ['2026-11-22'] },
        dsr_variation: { count: 1, needLook: 0, days: ['2026-11-23'] },
      }),
      NOW,
    )!;
    expect(card.salesStrip!.map((d) => [d.day, d.state])).toEqual([
      ['2026-11-22', 'came'],
      ['2026-11-23', 'came'],
    ]);
  });

  it('draws no strip and names no gaps when no sales report ever came (the service may not be attached)', () => {
    const card = monthCard(summary({ water_ingress: { count: 5, needLook: 0, days: dayRange(18, 22) } }), NOW)!;
    expect(card.salesStrip).toBeNull();
    expect(card.missingSalesDays).toEqual([]);
  });

  it('never makes a gap of a day outside the window', () => {
    // A report for a day before the window opened (an old day sent again) does not stretch the gaps back.
    const days = ['2026-10-01', '2026-11-22', '2026-11-23'];
    const card = monthCard(summary({ dsr_sales: { count: 3, needLook: 0, days } }), NOW)!;
    expect(card.missingSalesDays.every((d) => d >= '2026-10-25')).toBe(true);
  });
});

describe('kindsNeedingLook', () => {
  it('lists the kinds with something to look at, and nothing without a summary', () => {
    expect(kindsNeedingLook(undefined)).toBeUndefined();
    expect(
      kindsNeedingLook(
        summary({
          dsr_sales: { count: 3, needLook: 0, days: [] },
          stock_check: { count: 2, needLook: 2, days: [] },
          water_ingress: { count: 9, needLook: 1, days: [] },
        }),
      ),
    ).toEqual(['stock_check', 'water_ingress']);
    expect(kindsNeedingLook(summary({}))).toEqual([]);
  });
});
