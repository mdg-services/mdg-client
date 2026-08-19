/**
 * Where the since-inspection totals start counting from the LEDGER.
 *
 * The stock-vs-sales variation is measured from the dealer's last physical
 * inspection, and the days between that inspection and the first day our ledger
 * covers are carried by two configured figures — `inspection.seedReceipts` and
 * `inspection.seedTesting`. Everything after that comes from the ledger's own
 * rows. Two halves again, and the same hazard as the cumulative column: if they
 * disagree about where one stops and the other starts, a day is counted twice or
 * not at all.
 *
 * It is not hypothetical. The seeds were derived for a ledger whose first row
 * was 14 August. The service then generated 13 August — it always produces the
 * day before whichever day it is asked for — and 1E's diesel receipts since
 * inspection went up by the 8,000 L that day had already contributed through the
 * seed, while its petrol variation moved by 6,000 L. Nothing failed; the report
 * simply told the dealer their tank was 6,000 L short.
 *
 * So the seeds say which day they reach, and the ledger's half starts after it.
 */

import { dsrNextDate } from './cumulative';

/**
 * The first ledger day whose receipts and testing count towards the
 * since-inspection totals.
 *
 * The later of the inspection itself and the day after the seeds reach. Without
 * a `seedThrough` this is the inspection date, which is what the figures meant
 * before the boundary was stated — so an unconfigured dealer keeps exactly the
 * behaviour it had.
 */
export function dsrLedgerSumFrom(sinceDate: string, seedThrough?: string | null): string {
  if (!seedThrough) return sinceDate;
  const after = dsrNextDate(seedThrough);
  return after > sinceDate ? after : sinceDate;
}
