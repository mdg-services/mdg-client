/**
 * What one warrior's page counts, as pure functions. A COPY of `mdg-admin/src/lib/warriorStats.ts`
 * (spec 4.7: a copy, not a `shared/` mirror), with two differences on purpose:
 *
 *  - Nothing here knows the 100-a-day target. The admin copy counts "days at target" and a
 *    "longest run"; the owner's ruling (Q2, 19 Oct note) is that no new insight is framed against a
 *    target, so those two numbers are not carried over.
 *  - A work's label is kept in both languages (`label`, `labelHi`) so the page can show it in the
 *    reader's own, and the group of a work is its code (`domain`), named by the page.
 *
 * The aggregation lives here and not in the page because it is the part that can be wrong: a rounding
 * slip or an off-by-one day is invisible inside a component that also fetches. The ledger the rows come
 * from is capped at 1,000 rows by the server, newest first; the page says so when it gets that many.
 *
 * Two inputs are joined in by the caller and are not decoration: `leaveDates` decides which days
 * count as worked (leave days would otherwise sit in the working-day divisor), and `workMeta` decides
 * what a per-unit quantity is a quantity OF.
 */
import type {
  EffectiveWorkItem,
  StaffPointAward,
  StaffWorkDomain,
  StaffWorkUnit,
} from '@dk/shared/types';

/* ─────────────────────────────── Day arithmetic ─────────────────────────── */

/**
 * Calendar days are counted in UTC although they are India business dates: a `YYYY-MM-DD` here is a
 * label, not an instant, so adding a day can never land on 23:00 or 01:00 and skip or repeat one.
 */
function ymdToUtc(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}

function utcToYmd(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** The most days this will ever list, so a date typo cannot turn into a frozen loop. */
export const MAX_ENUMERATED_DAYS = 2000;

/** Every calendar day in an inclusive window, in order. Capped. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const end = ymdToUtc(to);
  for (let t = ymdToUtc(from); t <= end && out.length < MAX_ENUMERATED_DAYS; t += 86_400_000) {
    out.push(utcToYmd(t));
  }
  return out;
}

/** The day `n` days before `day` (`n` may be 0). */
export function daysBefore(day: string, n: number): string {
  return utcToYmd(ymdToUtc(day) - n * 86_400_000);
}

/** Points carry 2 dp; summing floats without this leaks `0.30000000000000004`. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ───────────────────────────────── Work metadata ────────────────────────── */

export interface WorkMeta {
  domain?: StaffWorkDomain;
  unit?: StaffWorkUnit;
}

/**
 * code to domain and unit, from the dealer's EFFECTIVE work list. The ledger keeps a work's label
 * and points but not its group or unit, so they are joined back. A work the dealer has since hidden
 * has awards and no entry here: it falls to "other" rather than being dropped, because a missing
 * group is a smaller lie than a missing 40 points.
 */
export function buildWorkMeta(items: EffectiveWorkItem[] | undefined): Map<string, WorkMeta> {
  const map = new Map<string, WorkMeta>();
  for (const it of items ?? []) map.set(it.code, { domain: it.domain, unit: it.unit });
  return map;
}

/* ─────────────────────────────────── Shapes ─────────────────────────────── */

export interface WarriorDay {
  /** `YYYY-MM-DD`. */
  date: string;
  points: number;
  awardCount: number;
  onLeave: boolean;
}

export interface Tally {
  key: string;
  /** English label. */
  label: string;
  labelHi: string;
  points: number;
  count: number;
}

export interface WarriorStats {
  /** One entry per calendar day in the window, zero-filled. */
  days: WarriorDay[];
  totalDays: number;
  /** Days marked as leave, whether or not any points were earned on them. */
  leaveDays: number;
  /** Leave days that earned nothing: the ones held out of the average. */
  leaveOnlyDays: number;
  /** Days the worker was at the pump: the fair divisor. */
  workedDays: number;
  /** Days that earned at least one point. */
  activeDays: number;
  totalPoints: number;
  awardCount: number;
  avgPerWorkedDay: number;
  bestDay?: WarriorDay;
  byWork: Tally[];
  byDomain: Tally[];
  distinctWorks: number;
}

/* ─────────────────────────────── The aggregation ────────────────────────── */

export function buildWarriorStats(params: {
  awards: StaffPointAward[];
  from: string;
  to: string;
  /** Days THIS worker was on leave, already filtered to them and the window. */
  leaveDates: ReadonlySet<string>;
  workMeta: Map<string, WorkMeta>;
}): WarriorStats {
  const { awards, from, to, leaveDates, workMeta } = params;

  const dayList = enumerateDays(from, to);
  const dayIndex = new Map<string, WarriorDay>();
  for (const date of dayList) {
    dayIndex.set(date, { date, points: 0, awardCount: 0, onLeave: leaveDates.has(date) });
  }

  // The query is already bounded to this window, so this drops nothing in practice. It matters when
  // that is not true (a cached answer for a wider window): the headline and the day series must be
  // built from one set of rows, or they quietly disagree with each other and with the list.
  const lastDay = dayList[dayList.length - 1] ?? to;
  const inWindow = awards.filter((a) => a.workDate >= from && a.workDate <= lastDay);

  const works = new Map<string, Tally>();
  const domains = new Map<string, Tally>();
  let totalPoints = 0;

  for (const a of inWindow) {
    totalPoints += a.points;

    const day = dayIndex.get(a.workDate);
    if (day) {
      day.points += a.points;
      day.awardCount += 1;
    }

    const work = works.get(a.workItemCode);
    if (work) {
      work.points += a.points;
      work.count += 1;
    } else {
      works.set(a.workItemCode, {
        key: a.workItemCode,
        label: a.workLabelEn,
        labelHi: a.workLabelHi,
        points: a.points,
        count: 1,
      });
    }

    const domainKey = workMeta.get(a.workItemCode)?.domain ?? 'other';
    const domain = domains.get(domainKey);
    if (domain) {
      domain.points += a.points;
      domain.count += 1;
    } else {
      domains.set(domainKey, {
        key: domainKey,
        label: domainKey,
        labelHi: domainKey,
        points: a.points,
        count: 1,
      });
    }
  }

  const days = dayList.map((d) => {
    const day = dayIndex.get(d)!;
    return { ...day, points: round2(day.points) };
  });

  const leaveDays = days.filter((d) => d.onLeave).length;
  const activeDays = days.filter((d) => d.points > 0).length;
  // A day off that still earned points was WORKED: leave and awards are written by two paths that
  // never consult each other (a man marked off in the morning who comes in for half a shift). Only
  // a leave day that earned nothing is held out of the divisor.
  const leaveOnlyDays = days.filter((d) => d.onLeave && d.points === 0).length;
  const workedDays = days.length - leaveOnlyDays;

  let bestDay: WarriorDay | undefined;
  for (const d of days) {
    if (d.points > 0 && (!bestDay || d.points > bestDay.points)) bestDay = d;
  }

  const byPoints = (a: Tally, b: Tally) => b.points - a.points || a.label.localeCompare(b.label);
  const finish = (m: Map<string, Tally>): Tally[] =>
    [...m.values()].map((t) => ({ ...t, points: round2(t.points) })).sort(byPoints);

  return {
    days,
    totalDays: days.length,
    leaveDays,
    leaveOnlyDays,
    workedDays,
    activeDays,
    totalPoints: round2(totalPoints),
    awardCount: inWindow.length,
    avgPerWorkedDay: round2(totalPoints / Math.max(workedDays, 1)),
    bestDay,
    byWork: finish(works),
    byDomain: finish(domains),
    distinctWorks: works.size,
  };
}
