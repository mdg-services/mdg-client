import { describe, expect, it } from 'vitest';

import type { EmployeeWithPoints, StaffPointBatch } from '@dk/shared/types';

import {
  activeOnly,
  BEHIND_BELOW,
  changeNumber,
  earnedCount,
  percentChange,
  personWindow,
  pointsChange,
  rankRows,
  sharePercent,
  sheetHistory,
  teamTotal,
  whoIsBehind,
  workingDays,
} from './staffInsights';

const emp = (over: Partial<EmployeeWithPoints>): EmployeeWithPoints =>
  ({
    id: 'e',
    name: 'Ramesh',
    status: 'ACTIVE',
    pointsInWindow: 0,
    totalPoints: 0,
    leaveDaysInWindow: 0,
    onLeaveToday: false,
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  }) as EmployeeWithPoints;

const batch = (workDate: string, over: Partial<StaffPointBatch> = {}): StaffPointBatch =>
  ({
    id: `b-${workDate}`,
    batchId: `b-${workDate}`,
    workDate,
    totalPoints: 62,
    entryCount: 10,
    employeeCount: 3,
    createdAt: `${workDate}T15:00:00.000Z`,
    ...over,
  }) as StaffPointBatch;

describe('the team strip numbers', () => {
  it('counts only the active warriors, rounded once on the raw sum', () => {
    const rows = [
      emp({ id: 'a', pointsInWindow: 13.333 }),
      emp({ id: 'b', pointsInWindow: 13.333 }),
      emp({ id: 'c', pointsInWindow: 13.334 }),
      emp({ id: 'gone', pointsInWindow: 500, status: 'INACTIVE' }),
    ];
    expect(activeOnly(rows)).toHaveLength(3);
    expect(teamTotal(activeOnly(rows))).toBe(40);
    expect(earnedCount(activeOnly(rows))).toBe(3);
  });

  it('counts who earned anything', () => {
    expect(earnedCount([emp({ pointsInWindow: 0 }), emp({ pointsInWindow: 0.5 })])).toBe(1);
  });
});

describe('percentChange (this against the same days last month)', () => {
  it('is up or down in whole percent', () => {
    expect(percentChange(1840, 1700)).toEqual({ dir: 'up', pct: 8 });
    expect(percentChange(1500, 2000)).toEqual({ dir: 'down', pct: 25 });
  });
  it('says same under half a percent', () => {
    expect(percentChange(1000, 1001)).toEqual({ dir: 'same' });
  });
  it('has no percentage for a rise from nothing, and says nothing for nothing against nothing', () => {
    // ...but it carries the whole points gained, so the chip can still say how much.
    expect(percentChange(40, 0)).toEqual({ dir: 'up', points: 40 });
    expect(percentChange(28.5, 0)).toEqual({ dir: 'up', points: 29 });
    expect(percentChange(0.2, 0)).toEqual({ dir: 'up' });
    expect(percentChange(0, 0)).toBeNull();
  });
  it('the chip number is the percent, else the points gained, else nothing', () => {
    expect(changeNumber({ dir: 'up', pct: 8 })).toEqual({ n: 8, unit: '%' });
    expect(changeNumber({ dir: 'up', points: 29 })).toEqual({ n: 29 });
    expect(changeNumber({ dir: 'same' })).toBeNull();
  });
  it('points change is in whole points', () => {
    expect(pointsChange(420, 380)).toEqual({ dir: 'up', n: 40 });
    expect(pointsChange(100, 130)).toEqual({ dir: 'down', n: 30 });
    expect(pointsChange(100, 100.2)).toEqual({ dir: 'same' });
  });
});

describe('share and rank', () => {
  it('share is a whole percent and 0 for an empty team', () => {
    expect(sharePercent(420, 1840)).toBe(23);
    expect(sharePercent(5, 0)).toBe(0);
  });
  it('ranks by points, ties share a rank and the next one skips', () => {
    const ranked = rankRows([
      emp({ id: 'a', name: 'Asha', pointsInWindow: 10 }),
      emp({ id: 'b', name: 'Bhola', pointsInWindow: 30 }),
      emp({ id: 'c', name: 'Chandu', pointsInWindow: 10 }),
      emp({ id: 'd', name: 'Dev', pointsInWindow: 5 }),
    ]);
    expect(ranked.map((r) => [r.row.id, r.rank])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });
});

describe('who is behind (against the team average, never a target)', () => {
  const month = { from: '2026-11-01', to: '2026-11-20' }; // 20 days

  it('works days from the window start, less leave, and from the day he was added', () => {
    expect(workingDays(emp({ leaveDaysInWindow: 2 }), month)).toBe(18);
    expect(workingDays(emp({ createdAt: '2026-11-11T06:00:00.000Z' }), month)).toBe(10);
    expect(workingDays(emp({ leaveDaysInWindow: 99 }), month)).toBe(0);
  });

  it('flags a warrior under 60% of the team points per working day, with his own percent', () => {
    // 20 days each. Team: 400 + 400 + 100 = 900 over 60 days = 15 a day. 100/20 = 5 a day = 33%.
    const rows = [
      emp({ id: 'a', pointsInWindow: 400 }),
      emp({ id: 'b', pointsInWindow: 400 }),
      emp({ id: 'c', pointsInWindow: 100 }),
    ];
    const behind = whoIsBehind(rows, month);
    expect([...behind.keys()]).toEqual(['c']);
    expect(behind.get('c')).toBe(33);
    expect(BEHIND_BELOW).toBe(0.6);
  });

  it('a man who was on leave is judged on the days he worked', () => {
    // c worked 10 days (10 on leave) and earned 200: 20 a day, level with the team, so not behind.
    const rows = [
      emp({ id: 'a', pointsInWindow: 400 }),
      emp({ id: 'b', pointsInWindow: 400 }),
      emp({ id: 'c', pointsInWindow: 200, leaveDaysInWindow: 10 }),
    ];
    expect(whoIsBehind(rows, month).size).toBe(0);
  });

  it('never flags with fewer than three working days, one man, a removed man, or an empty team', () => {
    const early = { from: '2026-11-01', to: '2026-11-02' };
    expect(whoIsBehind([emp({ id: 'a', pointsInWindow: 50 }), emp({ id: 'b' })], early).size).toBe(
      0,
    );
    expect(whoIsBehind([emp({ id: 'a', pointsInWindow: 50 })], month).size).toBe(0);
    expect(
      whoIsBehind(
        [emp({ id: 'a', pointsInWindow: 50 }), emp({ id: 'b', status: 'INACTIVE' })],
        month,
      ).size,
    ).toBe(0);
    expect(whoIsBehind([emp({ id: 'a' }), emp({ id: 'b' })], month).size).toBe(0);
  });
});

describe('sheet gaps', () => {
  it('has no history and no gaps without a sheet', () => {
    expect(sheetHistory([], '2026-11-24')).toEqual({ days: [], gaps: [] });
  });

  it('marks a day with no sheet, but not today, and nothing before the first sheet', () => {
    const batches = [batch('2026-11-23'), batch('2026-11-21'), batch('2026-11-20')];
    const h = sheetHistory(batches, '2026-11-24');
    expect(h.days.map((d) => d.day)).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
    ]);
    expect(h.gaps).toEqual(['2026-11-22']);
  });

  it('shows today when its sheet is already in', () => {
    const h = sheetHistory([batch('2026-11-24'), batch('2026-11-23')], '2026-11-24');
    expect(h.days.map((d) => d.day)).toEqual(['2026-11-23', '2026-11-24']);
    expect(h.gaps).toEqual([]);
  });

  it('looks back 14 days by default', () => {
    const h = sheetHistory([batch('2026-10-01'), batch('2026-11-24')], '2026-11-24');
    expect(h.days[0]?.day).toBe('2026-11-11');
    expect(h.days).toHaveLength(14);
    expect(h.gaps).toHaveLength(13);
  });

  it('puts the newest sent sheet first when a day has two', () => {
    const early = batch('2026-11-23', { id: 'early', createdAt: '2026-11-23T08:00:00.000Z' });
    const late = batch('2026-11-23', { id: 'late', createdAt: '2026-11-23T18:00:00.000Z' });
    const h = sheetHistory([early, late], '2026-11-24');
    expect(h.days[0]?.batches.map((b) => b.id)).toEqual(['late', 'early']);
  });
});

describe("a warrior's page window", () => {
  it('reaches back to the month start when it is earlier than 14 days ago', () => {
    expect(personWindow('2026-11-27')).toEqual({
      from: '2026-11-01',
      to: '2026-11-27',
      monthFrom: '2026-11-01',
      barsFrom: '2026-11-14',
    });
  });
  it('reaches back 14 days, across the month line, early in a month', () => {
    const w = personWindow('2026-12-03');
    expect(w.monthFrom).toBe('2026-12-01');
    expect(w.barsFrom).toBe('2026-11-20');
    expect(w.from).toBe('2026-11-20');
  });
});
