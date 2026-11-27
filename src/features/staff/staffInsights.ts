import { daysInWindow, istDate, round2 } from '@/lib/staff';
import type { EmployeeWithPoints, StaffPointBatch } from '@dk/shared/types';

import { daysBefore, enumerateDays } from './warriorStats';

/**
 * The numbers of the Warriors page, as pure functions (spec 4.7). Every one reads what the roster
 * calls already return, so none needs a server change.
 *
 * Rule that runs through all of it (owner decision Q2, 19 Oct note): NO new number here is measured
 * against a target. "Behind" is a warrior's points per working day against the TEAM's average, never
 * against 100.
 */

/** The warriors who count: the active ones. Removed ones keep their history and drop out of every total. */
export function activeOnly<T extends Pick<EmployeeWithPoints, 'status'>>(rows: T[]): T[] {
  return rows.filter((e) => e.status === 'ACTIVE');
}

/**
 * The team's points: active warriors only, summed on the raw numbers and rounded once. The assistant
 * says the same total in chat (`brief/build.ts` `staff()`), so the page and the chat must agree.
 */
export function teamTotal(rows: Pick<EmployeeWithPoints, 'pointsInWindow'>[]): number {
  return round2(rows.reduce((sum, e) => sum + e.pointsInWindow, 0));
}

/** How many of the warriors earned any points in the window. */
export function earnedCount(rows: Pick<EmployeeWithPoints, 'pointsInWindow'>[]): number {
  return rows.filter((e) => e.pointsInWindow > 0).length;
}

/**
 * `pct` is the change in percent. A rise from zero has no percentage, so it carries `points` instead:
 * the points gained, whole, so the chip can still say how much ("28 more than...") and never only "more".
 */
export type Change = { dir: 'up' | 'down' | 'same'; pct?: number; points?: number };

/** The chip's number from a change: the percent when there is one, else the whole points gained. */
export function changeNumber(change: Change): { n: number; unit?: '%' } | null {
  if (change.pct !== undefined) return { n: change.pct, unit: '%' };
  if (change.points !== undefined && change.points > 0) return { n: change.points };
  return null;
}

/**
 * This against last time, in percent. `null` when there is nothing to say: both are zero. A rise
 * from zero has no percentage (it carries the whole points gained instead). A change under half a percent
 * reads "same": a chip that says "0% more" is noise.
 */
export function percentChange(current: number, previous: number): Change | null {
  if (previous <= 0) {
    if (current <= 0) return null;
    const points = Math.round(current);
    return points > 0 ? { dir: 'up', points } : { dir: 'up' };
  }
  const diff = ((current - previous) / previous) * 100;
  const pct = Math.round(Math.abs(diff));
  if (pct === 0) return { dir: 'same' };
  return { dir: diff > 0 ? 'up' : 'down', pct };
}

/** One warrior's change in points, whole points. Under half a point reads "same". */
export function pointsChange(
  current: number,
  previous: number,
): { dir: 'up' | 'down' | 'same'; n?: number } {
  const diff = current - previous;
  const n = Math.round(Math.abs(diff));
  if (n === 0) return { dir: 'same' };
  return { dir: diff > 0 ? 'up' : 'down', n };
}

/** The share of the team, as a whole percent; 0 when the team has no points. */
export function sharePercent(points: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((points / total) * 100));
}

export interface RankedRow<T> {
  row: T;
  /** Standing rank: two people with the same points share a rank and the next one skips ("1, 1, 3"). */
  rank: number;
}

/** Highest points first, ties by name; ranks as above. */
export function rankRows<T extends Pick<EmployeeWithPoints, 'pointsInWindow' | 'name'>>(
  rows: T[],
): RankedRow<T>[] {
  const sorted = [...rows].sort(
    (a, b) => b.pointsInWindow - a.pointsInWindow || a.name.localeCompare(b.name),
  );
  const out: RankedRow<T>[] = [];
  sorted.forEach((row, i) => {
    const before = out[i - 1];
    const tied = before !== undefined && before.row.pointsInWindow === row.pointsInWindow;
    out.push({ row, rank: tied ? before.rank : i + 1 });
  });
  return out;
}

/* ───────────────────────────────── Who is behind ─────────────────────────── */

/** A warrior is "behind" when the points per working day are under this share of the team's. */
export const BEHIND_BELOW = 0.6;
/** A warrior counts toward the average only after this many working days: three days say nothing. */
export const BEHIND_MIN_DAYS = 3;

/**
 * The working days of one warrior in a window: the days of the window from the day he was added (if
 * that is later), less the days he was on leave. Never below zero.
 */
export function workingDays(
  e: Pick<EmployeeWithPoints, 'createdAt' | 'leaveDaysInWindow'>,
  window: { from: string; to: string },
): number {
  const added = e.createdAt ? istDate(new Date(e.createdAt)) : window.from;
  const start = added > window.from ? added : window.from;
  return Math.max(0, daysInWindow(start, window.to) - e.leaveDaysInWindow);
}

/**
 * Who is behind, and by how much: a map from a warrior's id to the percent of the team average his
 * points per working day come to ("Behind: 40% of the team average per working day").
 *
 * A working day is a day of the window, from the day the warrior was added if that is later, less
 * the days he was on leave. The team average is the team's points over the team's working days (not
 * an average of averages, so a man who was off for a week does not pull it either way). Needs at
 * least two warriors with the minimum days: one man has no team to be behind.
 */
export function whoIsBehind(
  rows: EmployeeWithPoints[],
  window: { from: string; to: string },
): Map<string, number> {
  const out = new Map<string, number>();
  const eligible: { id: string; points: number; days: number }[] = [];
  for (const e of rows) {
    if (e.status !== 'ACTIVE') continue;
    const days = workingDays(e, window);
    if (days < BEHIND_MIN_DAYS) continue;
    eligible.push({ id: e.id, points: e.pointsInWindow, days });
  }
  if (eligible.length < 2) return out;
  const points = eligible.reduce((s, e) => s + e.points, 0);
  const days = eligible.reduce((s, e) => s + e.days, 0);
  const average = points / days;
  if (average <= 0) return out;
  for (const e of eligible) {
    const ratio = e.points / e.days / average;
    if (ratio < BEHIND_BELOW) out.set(e.id, Math.round(ratio * 100));
  }
  return out;
}

/* ────────────────────────────────── Sheet gaps ───────────────────────────── */

export interface SheetDay {
  /** `YYYY-MM-DD`. */
  day: string;
  /** The sheets whose work was done that day, newest sent first. */
  batches: StaffPointBatch[];
}

export interface SheetHistory {
  /** The last days, oldest first, from the first sheet ever sent (or the window start) to the last full day. */
  days: SheetDay[];
  /** The days with no sheet: past days only (today is not over), and none before the first sheet. */
  gaps: string[];
}

/**
 * Which days have a sheet and which do not. `batches` is what the batches call returns (up to 200,
 * newest first, each with the day its work was done). A day with no sheet counts as a gap only when
 * it is over (today is not) and it comes after the first sheet that was ever sent, so a pump that
 * only began last week is not told it missed the weeks before. `span` is how many days back to look.
 */
export function sheetHistory(batches: StaffPointBatch[], today: string, span = 14): SheetHistory {
  if (batches.length === 0) return { days: [], gaps: [] };
  let first = batches[0]!.workDate;
  for (const b of batches) if (b.workDate < first) first = b.workDate;
  const windowStart = daysBefore(today, span - 1);
  const from = first > windowStart ? first : windowStart;
  const byDay = new Map<string, StaffPointBatch[]>();
  for (const b of batches) {
    const list = byDay.get(b.workDate) ?? [];
    list.push(b);
    byDay.set(b.workDate, list);
  }
  const days: SheetDay[] = [];
  const gaps: string[] = [];
  for (const day of from > today ? [] : enumerateDays(from, today)) {
    const list = (byDay.get(day) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // Today with no sheet yet is not a gap and not a fact worth a dot: the day is not over.
    if (day === today && list.length === 0) continue;
    days.push({ day, batches: list });
    if (list.length === 0) gaps.push(day);
  }
  return { days, gaps };
}

/* ──────────────────────────────── A person's page ────────────────────────── */

/** The bars on a warrior's page cover this many days, ending today. */
export const PERSON_BAR_DAYS = 14;

/**
 * The one ledger window a warrior's page reads: from the earlier of the month's first day and
 * thirteen days ago (so the bars are whole across a month boundary) to today. `monthFrom` and
 * `barsFrom` are the two stats windows cut from it.
 */
export function personWindow(today: string): {
  from: string;
  to: string;
  monthFrom: string;
  barsFrom: string;
} {
  const monthFrom = `${today.slice(0, 8)}01`;
  const barsFrom = daysBefore(today, PERSON_BAR_DAYS - 1);
  return { from: monthFrom < barsFrom ? monthFrom : barsFrom, to: today, monthFrom, barsFrom };
}
