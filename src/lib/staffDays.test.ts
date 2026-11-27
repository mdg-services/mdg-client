import { describe, expect, it } from 'vitest';

import { daysInWindow, fmtPointsGrouped, lastMonthBounds, sameDaysLastMonthBounds } from './staff';

describe('last month and the same days of it (the Warriors page)', () => {
  it('last month is the whole month before, across a year line too', () => {
    expect(lastMonthBounds('2026-11-27')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(lastMonthBounds('2026-03-05')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(lastMonthBounds('2026-01-09')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(lastMonthBounds('2028-03-05')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('the same days are the 1st to the same day number, kept inside the month', () => {
    expect(sameDaysLastMonthBounds('2026-11-12')).toEqual({ from: '2026-10-01', to: '2026-10-12' });
    expect(sameDaysLastMonthBounds('2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(sameDaysLastMonthBounds('2026-12-01')).toEqual({ from: '2026-11-01', to: '2026-11-01' });
  });

  it('counts the days of an inclusive window', () => {
    expect(daysInWindow('2026-11-01', '2026-11-12')).toBe(12);
    expect(daysInWindow('2026-11-05', '2026-11-05')).toBe(1);
    expect(daysInWindow('2026-11-05', '2026-11-04')).toBe(0);
  });

  it('writes a big number of points with Indian grouping and trims a fraction', () => {
    expect(fmtPointsGrouped(118000)).toBe('1,18,000');
    expect(fmtPointsGrouped(1840)).toBe('1,840');
    expect(fmtPointsGrouped(13.3)).toBe('13.3');
  });
});
