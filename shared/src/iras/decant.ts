/**
 * Which day a delivery counts on — the one rule the engine and the editor must
 * never disagree about.
 *
 * The portal answers the receipt query on when a delivery was ENTERED at the
 * outlet, not on when it was decanted, and it is asked for several days of them.
 * So one tanker routinely comes back in two consecutive days' data, and a tanker
 * entered late arrives days after the day it belongs to. The report resolves
 * that by counting a delivery on the day it was DECANTED: the twenty-four hours
 * ending at that day's shift close.
 *
 * It lives here, in the shared contract, because the editor has to show the same
 * answer. An operator who corrects a row the report will not read has been given
 * the founding fault of this whole area back again — a screen that says a figure
 * matters while the calculation ignores it — and the only durable way to prevent
 * that is for both of them to call the same function.
 *
 * Deliberately free of any timezone conversion: the portal's stamps and the
 * window bounds are compared as instants, and the window is supplied by the
 * caller who fetched it.
 */
import type { IrasRow } from '../types/irasData';

import { IRAS_DATE_RE, IRAS_TIME_RE } from './fields';

/** India has no daylight saving, so a shift-day is exactly this. */
const ONE_DAY_MS = 24 * 60 * 60_000;

/** IST is UTC+5:30, fixed. */
const IST_OFFSET_MS = 5.5 * 60 * 60_000;

/**
 * A portal `dd-MM-yyyy` + `HH:mm:ss` pair as an instant, read as IST.
 *
 * Returns null on anything unreadable, so one malformed row degrades that row
 * rather than the day.
 */
export function irasInstant(date: string | undefined, time: string | undefined): Date | null {
  const d = String(date ?? '').trim();
  const t = String(time ?? '').trim() || '00:00:00';
  if (!IRAS_DATE_RE.test(d) || !IRAS_TIME_RE.test(t)) return null;
  const [dd, mm, yyyy] = d.split('-').map(Number) as [number, number, number];
  const [hh, mi, ss = 0] = t.split(':').map(Number) as [number, number, number?];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, ss) - IST_OFFSET_MS);
}

/**
 * When a delivery was decanted, from whichever stamp the row actually carries.
 *
 * Three sources, best first: the end of the decant is the moment the fuel is in
 * the tank and is what the day should own; the start is within an hour of it;
 * the data-entry stamp is a last resort but still beats not knowing. A row with
 * a date and no time is dated to the start of that day rather than treated as
 * undatable.
 */
export function irasDecantInstant(row: IrasRow): Date | null {
  return (
    irasInstant(row.DECANT_END_DATE, row.DECANT_END_TIME) ??
    irasInstant(row.DECANT_START_DATE, row.DECANT_START_TIME) ??
    irasInstant(row.RECEIPT_DATAENTRY_DATE, row.RECEIPT_DATAENTRY_TIME)
  );
}

/** What a receipt row contributes to the day whose data carried it. */
export type RecRowDayVerdict =
  /** Decanted inside this day — the report counts it here. */
  | 'COUNTS'
  /** Decanted on another day — that day's report counts it, not this one. */
  | 'OTHER_DAY'
  /** No readable stamp — counted here, but that is a guess worth stating. */
  | 'UNDATED';

/**
 * Whether the day whose data carried this row is the day that counts it.
 *
 * The window is exactly ONE shift-day ending at the snapshot's anchor —
 * deliberately not the width the portal was asked for. `receiptLookbackDays` can
 * be two, in which case every delivery falls inside two consecutive fetches, and
 * using that bound would count each of them twice.
 */
export function recRowDayVerdict(
  row: IrasRow,
  window: { from: string; to: string } | undefined,
): RecRowDayVerdict {
  const at = irasDecantInstant(row);
  if (!at) return 'UNDATED';
  if (!window) return 'COUNTS';
  const to = new Date(window.to).getTime();
  if (!Number.isFinite(to)) return 'COUNTS';
  const t = at.getTime();
  return t > to - ONE_DAY_MS && t <= to ? 'COUNTS' : 'OTHER_DAY';
}

/** The attribution window as instants, for showing an operator what it is. */
export function recAttributionWindow(
  window: { from: string; to: string } | undefined,
): { from: Date; to: Date } | null {
  if (!window) return null;
  const to = new Date(window.to);
  if (!Number.isFinite(to.getTime())) return null;
  return { from: new Date(to.getTime() - ONE_DAY_MS), to };
}
