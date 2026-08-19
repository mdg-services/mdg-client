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
 *     those litres were still sold. {@link DsrMonthOpening} carries them.
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
 * The day after `businessDate`, `YYYY-MM-DD`.
 *
 * UTC arithmetic on a date-only string: India keeps no daylight saving, and the
 * string carries no time, so there is no local midnight to slip across.
 */
export function dsrNextDate(businessDate: string): string {
  const t = new Date(`${businessDate}T00:00:00.000Z`);
  if (!Number.isFinite(t.getTime())) return businessDate;
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/**
 * Whether an opening has anything to say about this date.
 *
 * It must name the same month, and the date must fall AFTER the last day the
 * opening covers. That second condition is what makes the figure safe to leave
 * in the configuration: the ledger grows backwards from time to time — the
 * service generates the day before whichever day it is asked for — and an
 * opening that only named a month would then be added on top of ledger rows for
 * days it already contains, counting them twice. 1E's diesel showed 51,158.67 L
 * on 13 August that way, against the 47,947.18 L on their own sheet, and every
 * later day was over by that day's 3,211.49 L.
 */
export function dsrMonthOpeningApplies(
  monthOpening: DsrMonthOpening | undefined | null,
  businessDate: string,
): boolean {
  return (
    !!monthOpening &&
    dsrSameMonth(monthOpening.through, businessDate) &&
    businessDate > monthOpening.through
  );
}

/**
 * The litres a configured opening contributes to this date — its own figure when
 * it applies, and zero otherwise.
 */
export function dsrMonthOpeningSales(
  monthOpening: DsrMonthOpening | undefined | null,
  businessDate: string,
): number {
  if (!dsrMonthOpeningApplies(monthOpening, businessDate)) return 0;
  const n = Number(monthOpening!.sales);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The first day whose LEDGER sales count towards this date's cumulative: the day
 * after the opening reaches, or the 1st of the month when there is no opening.
 *
 * The two halves cannot overlap by construction — this is the same boundary the
 * opening's own `through` defines — so no day is ever counted twice.
 */
export function dsrCumulativeFrom(
  monthOpening: DsrMonthOpening | undefined | null,
  businessDate: string,
): string {
  return dsrMonthOpeningApplies(monthOpening, businessDate)
    ? dsrNextDate(monthOpening!.through)
    : dsrMonthStart(businessDate);
}

/**
 * Where a day's CUMULATIVE SALES starts from: everything sold earlier in its
 * month, opening figure included.
 *
 * `monthSalesBefore` is the sum of the ledger's own sales from
 * {@link dsrCumulativeFrom} up to (not including) this day — so the printed
 * cumulative is exactly the sales column above it added up, which is a claim a
 * dealer can check by hand on their own report. Kept as an argument rather than
 * fetched here because this file is the shared contract and has no database; the
 * caller supplies the sum.
 */
export function dsrCumulativeBefore(args: {
  /** The day whose baseline is wanted, `YYYY-MM-DD`. */
  businessDate: string;
  /** Σ sales over ledger days in [dsrCumulativeFrom .. businessDate). */
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
