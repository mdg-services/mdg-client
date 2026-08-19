/**
 * What the report's CUMULATIVE SALES column means — and the one rule that says
 * where a day's running total starts from.
 *
 * It is the CALENDAR MONTH's total, not a total since the ledger began. Every
 * dealer's own macro workbook keeps it that way: the column climbs through the
 * month and starts again at the 1st, so the last row of a month is that month's
 * sales and nothing else. The figure is read that way by the people who use it —
 * it is the number a dealer quotes for "how much have we sold this month" — so a
 * total that silently spanned months, or that began on whichever day this
 * platform happened to start collecting, is not a smaller version of the same
 * number. It is a different number under the same heading.
 *
 * Two things follow, and both live here so the engine, the ledger reader and any
 * backfill cannot disagree about them:
 *
 *   • A day's baseline is what was sold EARLIER IN ITS OWN MONTH. Crossing into
 *     a new month drops it to zero, with no cron, no reset job and nothing to
 *     run on the 1st — the month is read off the row's own date, so a report
 *     regenerated for an old day still gets that day's month.
 *
 *   • A dealer whose ledger starts mid-month is missing the days before it, and
 *     those litres were still sold. {@link DsrMonthOpening} carries them. It
 *     names the month it belongs to, so it applies to exactly one month and then
 *     stops counting on its own — there is nothing to remember to remove.
 */
import type { DsrMonthOpening } from '../types/dsrReport';

/** `YYYY-MM` — the calendar month a `YYYY-MM-DD` business date falls in. */
export function dsrMonthKey(businessDate: string): string {
  return String(businessDate ?? '').slice(0, 7);
}

/** The first calendar day of that date's month, `YYYY-MM-DD`. */
export function dsrMonthStart(businessDate: string): string {
  return `${dsrMonthKey(businessDate)}-01`;
}

/** Whether two business dates fall in the same calendar month. */
export function dsrSameMonth(a: string, b: string): boolean {
  return dsrMonthKey(a) === dsrMonthKey(b);
}

/**
 * The litres a configured opening contributes to this date — its own figure when
 * the date is inside the month it names, and zero otherwise.
 *
 * The month check is the whole point: it is what makes the opening expire by
 * itself. Left as a bare number it would be added to every month forever, and
 * September would open at August's mid-month total.
 */
export function dsrMonthOpeningSales(
  monthOpening: DsrMonthOpening | undefined | null,
  businessDate: string,
): number {
  if (!monthOpening) return 0;
  if (monthOpening.month !== dsrMonthKey(businessDate)) return 0;
  const n = Number(monthOpening.sales);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Where a day's CUMULATIVE SALES starts from: everything sold earlier in its
 * month, opening figure included.
 *
 * `monthSalesBefore` is the sum of the ledger's own sales for the days of this
 * month before this one — so the printed cumulative is exactly the sales column
 * above it added up, which is a claim a dealer can check by hand on their own
 * report. Kept as an argument rather than fetched here because this file is the
 * shared contract and has no database; the caller supplies the sum.
 */
export function dsrCumulativeBefore(args: {
  /** The day whose baseline is wanted, `YYYY-MM-DD`. */
  businessDate: string;
  /** Σ sales over ledger days in [1st of the month .. businessDate). */
  monthSalesBefore: number;
  /** This product's configured opening for a part-covered month, if any. */
  monthOpening?: DsrMonthOpening | null;
}): number {
  const before = Number(args.monthSalesBefore);
  return (
    dsrMonthOpeningSales(args.monthOpening, args.businessDate) +
    (Number.isFinite(before) ? before : 0)
  );
}
