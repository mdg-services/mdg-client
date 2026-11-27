import { describe, expect, it } from 'vitest';

import {
  NOW,
  creditData,
  report,
  salesData,
  variationData,
} from '@/features/glance/glanceFixtures';

import { addDays, historyItems, stripDays } from './serviceHistoryModel';

const dsr = (day: string, over: Parameters<typeof report>[1] = {}) =>
  report('dsr_sales', {
    day,
    sentAt: `${addDays(day, 1)}T01:35:00.000Z`,
    data: { ...salesData({ day }), businessDate: day },
    headline: `sales ${day}`,
    ...over,
  });

describe('the history rows of a service page', () => {
  it('lists by BUSINESS day, newest first, even when a report was sent after midnight', () => {
    const late = dsr('2026-11-26', { sentAt: '2026-11-27T00:50:00.000Z' });
    const earlier = dsr('2026-11-25');
    const items = historyItems([earlier, late], {
      serviceId: 'dsr-report',
      isOwner: true,
      lang: 'en',
    });
    expect(items.map((i) => i.day)).toEqual(['2026-11-26', '2026-11-25']);
  });

  it('keeps only the newest copy of a day for a once-a-day service, across both DSR kinds', () => {
    const first = dsr('2026-11-26', { sentAt: '2026-11-27T01:00:00.000Z' });
    const again = report('dsr_variation', {
      day: '2026-11-26',
      sentAt: '2026-11-27T05:00:00.000Z',
      data: { ...variationData(), businessDate: '2026-11-26' },
    });
    const items = historyItems([first, again], {
      serviceId: 'dsr-report',
      isOwner: true,
      lang: 'en',
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.report.kind).toBe('dsr_variation');
    // A service that files one report per thing keeps every one of them.
    const two = historyItems([first, again], {
      serviceId: 'tt-acknowledgement',
      isOwner: true,
      lang: 'en',
    });
    expect(two).toHaveLength(2);
  });

  it('marks a corrected report and never lets a manager see an owner-only kind', () => {
    const corrected = dsr('2026-11-26', {
      data: { ...salesData({ day: '2026-11-26' }), revised: true },
    });
    expect(
      historyItems([corrected], { serviceId: 'dsr-report', isOwner: true, lang: 'en' })[0]!
        .corrected,
    ).toBe(true);
    const credit = report('credit_dod', { data: creditData() });
    expect(
      historyItems([credit], { serviceId: 'credit-dod-monitoring', isOwner: false, lang: 'en' }),
    ).toEqual([]);
    expect(
      historyItems([credit], { serviceId: 'credit-dod-monitoring', isOwner: true, lang: 'en' }),
    ).toHaveLength(1);
  });

  it("takes the status from the kind's own verdict, then the tag", () => {
    const attention = dsr('2026-11-26', { status: 'attention' });
    expect(
      historyItems([attention], { serviceId: 'dsr-report', isOwner: true, lang: 'en' })[0]!.status,
    ).toBe('attention');
  });
});

describe('the day strip', () => {
  const rows = (days: string[]) =>
    historyItems(
      days.map((d) => dsr(d)),
      { serviceId: 'dsr-report', isOwner: true, lang: 'en' },
    );

  it('ends today, shows a past day with no report as "none" and today with none yet as "wait"', () => {
    const strip = stripDays(rows(['2026-11-26', '2026-11-25', '2026-11-23']), NOW, false);
    expect(strip).toHaveLength(14);
    expect(strip.at(-1)).toMatchObject({ day: '2026-11-27', state: 'wait' });
    expect(strip.find((d) => d.day === '2026-11-24')!.state).toBe('none');
    expect(strip.find((d) => d.day === '2026-11-25')!.state).toBe('came');
    expect(strip.at(0)!.day).toBe('2026-11-14');
  });

  it('starts at the oldest loaded day while more pages remain: nobody has looked further back', () => {
    const strip = stripDays(
      rows(['2026-11-26', '2026-11-25', '2026-11-24', '2026-11-23']),
      NOW,
      true,
    );
    expect(strip.map((d) => d.day)).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
    ]);
  });

  it('wears the triangle for a day whose report needs a look, and carries the report for a tap', () => {
    const items = historyItems([dsr('2026-11-26', { status: 'attention' }), dsr('2026-11-25')], {
      serviceId: 'dsr-report',
      isOwner: true,
      lang: 'en',
    });
    const strip = stripDays(items, NOW, true);
    expect(strip.map((d) => d.state)).toEqual(['came', 'look', 'wait']);
    expect(strip[1]!.report?.messageId).toBeTruthy();
    expect(strip[2]!.report).toBeUndefined();
  });

  it('shows today as a report that came when one is held', () => {
    const strip = stripDays(rows(['2026-11-27', '2026-11-26']), NOW, true);
    expect(strip.map((d) => d.state)).toEqual(['came', 'came']);
  });

  it('counts calendar days across a month end', () => {
    expect(addDays('2026-12-01', -1)).toBe('2026-11-30');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});
