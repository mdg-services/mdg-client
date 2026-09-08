/**
 * Day arithmetic on `YYYY-MM-DD` strings, and nothing else.
 *
 * ONE DEFINITION, BECAUSE THIS IS WHERE COMPLIANCE VERDICTS COME FROM. Two
 * subsystems now count days to an expiry — the outlet profile's licence fields
 * (`dealer/profile.ts`) and the document filing cabinet
 * (`types/documentValidity.ts`) — and both paint a badge a dealer acts on. A
 * second copy of this subtraction is how one screen comes to call a licence
 * valid on the morning another calls it lapsed.
 *
 * THE RULE THIS MODULE EXISTS TO HOLD: **an unreadable date is not a good one.**
 * The profile version of this function used to return `+Infinity` for a date it
 * could not parse, which read downstream as "more than sixty days away" and
 * painted a green "Valid" badge on a licence whose expiry nobody could even
 * read. It returns `NaN` now, and every caller must turn that into NO VERDICT
 * rather than a passing one. A compliance verdict fails closed or it is not a
 * verdict.
 *
 * STRINGS, NEVER `Date` OBJECTS, at every boundary. An expiry is a day printed
 * on a certificate; it has no time and no zone. UTC arithmetic on a date-only
 * string — the same choice `dsr/cumulative.ts` makes and states — is what stops
 * a licence expiring a day early for somebody whose phone is set to Assam.
 */

/**
 * Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is
 * earlier than `from`; `0` when they are the same day.
 *
 * `NaN` for anything that will not parse. Callers turn that into no verdict —
 * see the module header.
 */
export function daysBetweenIsoDays(from: string, to: string): number {
  // BOTH MUST BE REAL DAYS, not merely parseable ones. `Date.parse` accepts
  // `2026-02-30` and quietly rolls it to 2 March — so a licence stored with an
  // impossible date would come back with a confident verdict computed against a
  // day that never existed, and on today's clock that verdict reads `expired`
  // for a certificate whose real date nobody can determine. `isIsoDay`
  // round-trips it, so an unreal date reaches the caller as NaN and gets NO
  // verdict, which is the module's whole rule.
  if (!isIsoDay(from) || !isIsoDay(to)) return Number.NaN;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * The day `days` after `isoDay`, as `YYYY-MM-DD`. Negative `days` goes backwards.
 *
 * Returns the input unchanged when it will not parse, matching `dsrNextDate`:
 * a shift that cannot be computed must not invent a date, and every caller here
 * is building a form prefill a human is about to confirm.
 */
export function shiftIsoDay(isoDay: string, days: number): string {
  const t = Date.parse(`${isoDay}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return isoDay;
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The day `months` calendar months after `isoDay`, as `YYYY-MM-DD`.
 *
 * CALENDAR MONTHS, NOT THIRTY-DAY BLOCKS. "Valid for three months" from 30
 * November is 28 February, not 28 February plus a day of drift — and a
 * certificate issued on the 31st and renewed monthly must land on the last day
 * of the short month rather than rolling into the next one. `setUTCMonth` alone
 * rolls (31 Jan + 1 month = 3 March), so the day is clamped to the target
 * month's length first.
 *
 * This only ever PREFILLS a form box. The date that governs is the one printed
 * on the paper, which a person reads and confirms — see
 * `DocumentAsk.validUntil`.
 */
export function addIsoMonths(isoDay: string, months: number): string {
  const t = Date.parse(`${isoDay}T00:00:00.000Z`);
  if (!Number.isFinite(t) || !Number.isInteger(months)) return isoDay;
  const d = new Date(t);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastOfTarget));
  return d.toISOString().slice(0, 10);
}

/** Whether a string is a well-formed `YYYY-MM-DD` that names a real day. */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  // `Date.parse` accepts 2026-02-30 in some engines and rolls it to 2 March, so
  // round-trip it: a day that does not survive the trip did not exist.
  return new Date(t).toISOString().slice(0, 10) === value;
}
