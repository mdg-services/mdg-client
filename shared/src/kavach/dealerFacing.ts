/**
 * The one rule that decides whether MDG's Kavach figure may be shown to the
 * dealer it is about.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The rule was written once, in `mdg-client/src/pages/KavachPage.tsx`, as a
 * `useMemo` called `settling`. `GET /kavach/me` applied no check at all:
 * `programmeToPublic(doc, { forDealer: true })` stripped `byBucket` and
 * `validPoints` and then returned `overallPct` and `totalPoints` to every
 * caller, unconditionally. So the only thing standing between a dealer and a
 * percentage MDG has not stood behind was one `if` inside one React component —
 * and an older bundle, a WebView that failed to update, or anything reading the
 * API directly would have seen what the server chose to send rather than what
 * the page chose to draw. `types/documentAsk.ts` names this exact hole as the
 * counter-example to how the documents gate was built ("THE GATE BELONGS IN THE
 * QUERY, NOT THE PAGE"). This closes it.
 *
 * The rule now lives here, and the page, the serializer and the AI first line's
 * Kavach lookup all call it. A replicated gate is a gate that drifts; a gate
 * with a test can only be deleted on purpose.
 */

/**
 * Everything the gate reads, and nothing more.
 *
 * A structural shape rather than the whole `KavachProgramme` so the serializer
 * can ask the question while it is still assembling the public object, and so a
 * test does not have to build twenty fields to check one rule. `KavachProgramme`
 * satisfies it as it stands.
 */
export interface KavachPublishableInput {
  /** Has an admin switched dealer-facing messages on for this outlet? */
  dealerFacingEnabled?: boolean;
  /** Settling-in grace; ISO instant. Absent means the grace period is not in play. */
  settlingUntil?: string;
  score: {
    /** Is there a denominator? False means there is no percentage to state at all. */
    scored: boolean;
  };
}

/**
 * May this programme's score be shown to the dealer?
 *
 * Three conditions, all of which must hold, and they are the same three the
 * dealer's Kavach page has always applied:
 *
 *  1. an admin has switched dealer-facing messages on for this outlet;
 *  2. something has actually been verified, so there is a denominator to divide
 *     by — a fresh programme's honest figure is "nobody has checked anything
 *     yet", not zero and emphatically not a hundred;
 *  3. the settling-in grace has elapsed, so a brand-new outlet never opens on a
 *     public exam failure.
 *
 * ONE DELIBERATE DIFFERENCE FROM THE PAGE. The page tested
 * `dealerFacingEnabled === false`, which treats an ABSENT flag as switched on.
 * That was safe there because the only producer of the object,
 * `programmeToPublic`, coerces the field with `Boolean(...)` so a missing value
 * never crosses the wire — but now that the rule runs server-side and against
 * hand-built objects too, a missing switch must read as "nobody has turned this
 * on", which is what `mdg-admin`'s own `DealerKavachTab` already assumes with
 * `dealerFacingEnabled === true`. No live payload is affected either way.
 *
 * `now` is injectable so a test can stand on either side of `settlingUntil`
 * without touching the clock; it defaults to the real one.
 */
export function kavachScoreIsPublishable(p: KavachPublishableInput, now?: number): boolean {
  if (p.dealerFacingEnabled !== true) return false;
  if (!p.score.scored) return false;
  if (!p.settlingUntil) return true;
  const until = new Date(p.settlingUntil).getTime();
  // An unparseable date is not a licence to publish. It means we no longer know
  // when the grace ends, and the safe reading of "we do not know" is "not yet".
  if (Number.isNaN(until)) return false;
  return (now ?? Date.now()) >= until;
}
