import { describe, expect, it } from 'vitest';

import type { EffectiveWorkItem, StaffPointAward } from '@dk/shared/types';

import { buildWarriorStats, buildWorkMeta, daysBefore, enumerateDays } from './warriorStats';

const award = (
  workDate: string,
  points: number,
  code = 'du-clean',
  over: Partial<StaffPointAward> = {},
) =>
  ({
    id: `${workDate}-${code}-${points}`,
    workItemCode: code,
    workLabelEn: code === 'du-clean' ? 'DU cleaning' : 'Tanker help',
    workLabelHi: code === 'du-clean' ? 'DU की सफाई' : 'टैंकर में मदद',
    workDate,
    points,
    ...over,
  }) as StaffPointAward;

const META = buildWorkMeta([
  { code: 'du-clean', domain: 'cleaning', unit: 'each' },
  { code: 'tanker', domain: 'tanker', unit: 'each' },
] as unknown as EffectiveWorkItem[]);

describe('day arithmetic', () => {
  it('lists every day of a window and steps back across a month line', () => {
    expect(enumerateDays('2026-11-28', '2026-12-02')).toEqual([
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
    expect(daysBefore('2026-12-01', 1)).toBe('2026-11-30');
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
  });
});

describe('buildWarriorStats', () => {
  const base = { from: '2026-11-01', to: '2026-11-10', workMeta: META };

  it('zero-fills the days and sums points without float leakage', () => {
    const stats = buildWarriorStats({
      ...base,
      leaveDates: new Set(),
      awards: [award('2026-11-02', 0.1), award('2026-11-02', 0.2), award('2026-11-05', 10)],
    });
    expect(stats.days).toHaveLength(10);
    expect(stats.days[1]?.points).toBe(0.3);
    expect(stats.totalPoints).toBe(10.3);
    expect(stats.activeDays).toBe(2);
    expect(stats.bestDay?.date).toBe('2026-11-05');
  });

  it('holds a leave day that earned nothing out of the working-day average', () => {
    const stats = buildWarriorStats({
      ...base,
      leaveDates: new Set(['2026-11-03', '2026-11-04']),
      awards: [award('2026-11-04', 8), award('2026-11-05', 72)],
    });
    // two leave days, one of them worked anyway: 9 working days
    expect(stats.leaveDays).toBe(2);
    expect(stats.leaveOnlyDays).toBe(1);
    expect(stats.workedDays).toBe(9);
    expect(stats.avgPerWorkedDay).toBe(8.89);
  });

  it('drops rows outside the window so the headline and the days agree', () => {
    const stats = buildWarriorStats({
      ...base,
      leaveDates: new Set(),
      awards: [award('2026-10-30', 99), award('2026-11-02', 5)],
    });
    expect(stats.totalPoints).toBe(5);
    expect(stats.awardCount).toBe(1);
  });

  it('ranks works by points and groups them by domain, an unknown work falling to other', () => {
    const stats = buildWarriorStats({
      ...base,
      leaveDates: new Set(),
      awards: [
        award('2026-11-02', 4, 'du-clean'),
        award('2026-11-03', 4, 'du-clean'),
        award('2026-11-04', 20, 'tanker'),
        award('2026-11-05', 1, 'hidden-work'),
      ],
    });
    expect(stats.byWork.map((w) => [w.key, w.points, w.count])).toEqual([
      ['tanker', 20, 1],
      ['du-clean', 8, 2],
      ['hidden-work', 1, 1],
    ]);
    expect(stats.byDomain.map((d) => d.key)).toEqual(['tanker', 'cleaning', 'other']);
    expect(stats.distinctWorks).toBe(3);
  });

  it('carries no target: nothing in the result counts days at 100', () => {
    const stats = buildWarriorStats({
      ...base,
      leaveDates: new Set(),
      awards: [award('2026-11-02', 150)],
    });
    expect(Object.keys(stats).some((k) => /target/i.test(k))).toBe(false);
  });
});
