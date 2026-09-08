/**
 * Is this piece of paper still good? One verdict, one implementation.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * Two subsystems now count days to an expiry and both paint a badge somebody
 * acts on: the outlet profile's licence fields (`dealer/profile.ts`) and the
 * document filing cabinet (`types/documentValidity.ts`). A second copy of this
 * subtraction is how one screen comes to call a licence valid on the morning
 * another calls it lapsed — the authoritative-figure fault this codebase has
 * already been audited against once.
 *
 * So the arithmetic lives here exactly once, and the two callers differ in ONE
 * argument: how many days ahead counts as "soon". The profile says sixty,
 * because a PESO renewal is a district-office errand with a queue in it. A
 * document says whatever the first step of its own reminder ladder says, so that
 * the amber pill and the first notification land on the same morning. Both are
 * right; neither may be hard-coded twice.
 *
 * THE VOCABULARY IS THE PROFILE'S, DELIBERATELY. `expired` / `expiring` /
 * `valid` were already shipped and are already on screens. Inventing a second
 * spelling — `LAPSED`, `DUE_SOON` — for the same three ideas would mean every
 * reader had to learn which surface used which, and every serializer had to
 * translate. There is one set of words.
 *
 * IT FAILS CLOSED, AND THAT IS THE WHOLE POINT. A date that will not parse
 * returns `undefined` — NO VERDICT — never a passing one. The profile's version
 * of this function used to return `+Infinity` for an unreadable date, which read
 * downstream as "more than sixty days away" and painted a green "Valid" badge on
 * a licence nobody could read. A compliance verdict fails closed or it is not a
 * verdict.
 */
import { daysBetweenIsoDays } from './isoDays';

/** Where a dated document stands. Three words, used by every surface. */
export const EXPIRY_STATES = ['expired', 'expiring', 'valid'] as const;
export type ExpiryState = (typeof EXPIRY_STATES)[number];

/**
 * Whether a stored expiry has passed, is close, or is fine — as of a day the
 * caller supplies.
 *
 * PURE, and `today` is an argument rather than a clock read, for the reason the
 * fence gives for the same choice: the combinations are what this gets wrong,
 * not the plumbing, and a pure function can carry its boundary cases in tests
 * that need no database and no fake timers. Every date is a `YYYY-MM-DD`
 * calendar day, never a `Date` — an expiry is a day printed on a certificate,
 * and putting it through a timezone is how a licence expires a day early.
 *
 * `soonDays` is how many days ahead counts as `expiring`. `0` means nothing is
 * ever "soon": the verdict goes straight from `valid` to `expired`, which is the
 * honest rendering when a document's reminders have been switched off.
 *
 * Returns `undefined` when there is no date, no today, or a date that will not
 * parse. Callers render nothing at all rather than a guess.
 */
export function expiryState(
  expiresOn: string | undefined,
  today: string,
  soonDays: number,
): ExpiryState | undefined {
  if (!expiresOn || !today) return undefined;
  const days = daysBetweenIsoDays(today, expiresOn);
  // Unreadable is not "fine". No verdict, so the screen says nothing and the
  // machine has nothing to quote.
  if (Number.isNaN(days)) return undefined;
  if (days < 0) return 'expired';
  return days <= soonDays ? 'expiring' : 'valid';
}

/**
 * Whole days from `today` until `expiresOn`. Negative once it has gone by, `0`
 * on the day itself, `null` when it cannot be worked out.
 *
 * `null` rather than `NaN` at this boundary because this number is rendered and
 * serialised, and `NaN` does not survive `JSON.stringify` — it becomes `null`
 * anyway, one layer further out, where nobody chose it.
 */
export function daysToExpiry(expiresOn: string | undefined, today: string): number | null {
  if (!expiresOn || !today) return null;
  const days = daysBetweenIsoDays(today, expiresOn);
  return Number.isNaN(days) ? null : days;
}
