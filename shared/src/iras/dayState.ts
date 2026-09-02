/**
 * What each day-state is CALLED, worded once.
 *
 * The words matter more than usual here. The reader is a fuel-outlet admin
 * scanning a month of dates for the ones that need them, and "MISMATCH" tells
 * that person nothing they can act on. Every label below is a plain statement
 * about the day, short enough to sit in a table cell, and — for anything wrong —
 * says what is wrong rather than naming a category.
 *
 * Kept in `@dk/shared` rather than in the admin so that the next surface to show
 * a day's state (a digest, an export, a report) uses the same sentence. Two
 * screens calling the same state different things is how a team ends up unsure
 * whether they are looking at the same problem.
 */
import type { IrasDayState } from '../types/irasData.js';

/** The chip's own words — two or three, headline case. */
export const IRAS_DAY_STATE_LABEL: Record<IrasDayState, string> = {
  MISSING: 'No data',
  FAILED: 'Collection failed',
  PARTIAL: 'Partly collected',
  MISMATCH: 'Does not add up',
  MISMATCH_OK: 'Gap accepted',
  OPEN: 'Not closed yet',
  OK: 'Adds up',
};

/**
 * One sentence saying what the state means and, where there is one, what to do.
 *
 * Shown under the chip on a phone and as the row's tooltip on a desktop, because
 * a two-word chip cannot carry "a day closes when tomorrow's readings arrive" —
 * and without that sentence an admin reads "Not closed yet" as a fault.
 */
export const IRAS_DAY_STATE_HINT: Record<IrasDayState, string> = {
  MISSING:
    'Nothing was collected and nothing was typed in for this day. Its figures are absent from every report that covers it.',
  FAILED: 'The collection ran and failed, so this day has no usable figures. Collect it again.',
  PARTIAL:
    'Some of this day’s reports arrived and some did not, so any figure built from it is incomplete.',
  MISMATCH:
    'The tanks moved by more than the nozzles sold and this day’s tankers explain. Check the dips and the deliveries, then accept the day with a reason if it is genuine.',
  MISMATCH_OK: 'This day does not add up, and a named admin has accepted it with a reason.',
  OPEN: 'The figures are in, but a day’s sales are only known once the next morning’s meter readings arrive — so this day cannot be checked yet.',
  OK: 'What the tanks lost matches what the nozzles sold and the day’s tankers account for.',
};

/**
 * Whether a state is something someone has to do something about.
 *
 * Drives the "N days need attention" count above the list. `OPEN` is NOT
 * actionable: every dealer has exactly one open day at all times — today — and
 * counting it would mean the banner never reads zero, which is the fastest way
 * to teach someone to ignore a banner.
 */
export function irasDayNeedsAttention(state: IrasDayState): boolean {
  return state === 'MISSING' || state === 'FAILED' || state === 'PARTIAL' || state === 'MISMATCH';
}
