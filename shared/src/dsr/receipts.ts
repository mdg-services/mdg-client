/**
 * What a delivery is worth, and when the tank dip may speak for one.
 *
 * Two rules live here because both decide a figure the dealer is judged on, and
 * both were decided from the outlets' own history rather than from taste.
 */

/**
 * Deliveries are recorded at the next 500 litres up.
 *
 * A tanker is ordered and invoiced in round quantities — across every delivery
 * these eight outlets have ever had, the nominal figures are 4,000 / 6,000 /
 * 8,000 / 10,000 / 12,000 / 14,500 / 15,000 / 20,000 / 24,500 / 28,000. What the
 * portal reports is that quantity minus the ordinary loss of measuring it: 7,858
 * against a 8,000 L load, 3,933 against 4,000, 3,410 against 3,500.
 *
 * Carrying those measurement leftovers into the ledger makes the dealer's report
 * disagree with the dealer's own book on a figure neither side disputes, and the
 * disagreement then has to be explained every time. Rounding UP to the next 500
 * restores the quantity everyone actually transacted in.
 *
 * UP rather than to the nearest, because the error only ever runs one way: the
 * portal's figure is the load MINUS what measuring it cost, never plus, so the
 * true quantity is always at or above what is reported and rounding down can
 * only move further from it. Nearest-500 got 8,695.61 wrong — it produced 8,500
 * against a 9,000 L invoice — where rounding up lands exactly on the invoice.
 *
 * 500 rather than 1,000 because 3,500 and 14,500 are both real load sizes here.
 */
export const DSR_RECEIPT_ROUNDING_L = 500;

/**
 * How far above a 500 mark a figure may sit and still count as sitting ON it.
 *
 * Without this, rounding up turns 8,000.0000001 into 8,500 — half a tanker
 * conjured out of a floating-point remainder. The portal reports three decimal
 * places, so anything within half a litre of the mark is that mark.
 */
const SNAP_TOLERANCE_L = 0.5;

/**
 * A delivery's litres, rounded UP to the next {@link DSR_RECEIPT_ROUNDING_L}.
 *
 * Zero is returned unchanged and deliberately: a hand-entered 0 is the operator's
 * way of striking out a delivery the portal reported twice, and rounding must
 * never turn that intent into 500 litres of fuel. Anything not a finite positive
 * number passes through untouched for the caller's own guards to catch.
 */
export function dsrRoundReceipt(litres: number): number {
  if (!Number.isFinite(litres) || litres <= 0) return litres;
  return Math.ceil((litres - SNAP_TOLERANCE_L) / DSR_RECEIPT_ROUNDING_L) * DSR_RECEIPT_ROUNDING_L;
}

/**
 * The smallest gain in the tanks that may be read as an unreported delivery.
 *
 * The tank dip can prove a tanker arrived without any receipt row: over a closed
 * day, what the tank holds now must equal what it held then, plus what was
 * delivered, minus what was dispensed. Rearranged, the litres that must have
 * come in are knowable from two dips and the meters alone.
 *
 * The trap is that the same arithmetic also picks up two things that are NOT
 * deliveries, and at these outlets it picked them up four times out of five:
 *
 *   • a tank whose dip is broken. 1E's tank 4 reports 0 L every day while its
 *     nozzles sell from it, so its sales are counted while its fuel is not, and
 *     every litre it sells reads as a litre that appeared from nowhere. Three of
 *     the five alerts ever raised were exactly this — 2,853 / 3,675 / 2,440 L
 *     against tank-4 sales of 2,676 / 3,667 / 2,492 L.
 *   • a dip taken before the tank settled after a decant. 2E's petrol read
 *     2,571 L high on 18-08-2026 and 2,790 L low the next morning; over the two
 *     days it nets to −219 L, which is nothing.
 *
 * Hence the floor. It is paired with a same-size reversal check in the engine,
 * which disqualifies the settling case, and — because 3,000 sits BELOW 1E's
 * 3,675 L tank-4 day — with a refusal to infer anything for a product that has a
 * tank reporting no fuel while its nozzles sell. Two of the three guards exist
 * for the broken-dip case alone, because that is the one that produced most of
 * the false alerts.
 */
export const DSR_MIN_INFERRED_TANKER_L = 3000;

/**
 * How much of a gain must survive into the NEXT day for it to count as fuel.
 *
 * A settling dip gives the whole amount back; a real tanker gives none of it
 * back. Half is the dividing line, well clear of both.
 */
export const DSR_INFERRED_REVERSAL_FRACTION = 0.5;

/**
 * Did the day after a gain hand that gain back, i.e. was it the dip settling
 * rather than a delivery?
 *
 * `gain` is the earlier day's unexplained litres, `next` the following day's.
 * A `next` of `null` means that day has not been closed yet — nothing can be
 * concluded, so it is treated as a reversal and the gain is left alone. Waiting
 * one more day costs nothing; booking a tanker that never came costs the
 * dealer's whole variation.
 */
export function dsrGainWasReversed(gain: number, next: number | null | undefined): boolean {
  if (next === null || next === undefined || !Number.isFinite(next)) return true;
  return next <= -(gain * DSR_INFERRED_REVERSAL_FRACTION);
}
