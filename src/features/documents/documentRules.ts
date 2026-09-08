import type { ExpiryState } from '@dk/shared';
// `ExpiryState` comes from the package ROOT and not from `@dk/shared/types`,
// because it is declared in `lib/expiry.ts` — the one home for the verdict the
// outlet Info tab and this screen both render. It was briefly re-exported from
// `types/` as well, which put two declarations of one name into the root barrel.
import type { DealerDocumentAskRow } from '@dk/shared/types';

/**
 * Every decision the papers screen makes, as functions with no React in them.
 *
 * The same arrangement `features/asks/askRules.ts` uses, and for the same
 * reason it gives: each of these is a rule somebody argued about — which push
 * lands on which card, whether a renewal is worth pointing at, what colour a
 * date deserves — and a rule that can only be exercised by rendering a
 * component is a rule nobody checks.
 *
 * NOTHING HERE READS A CLOCK. The verdict (`validityState`) and the day count
 * (`daysToExpiry`) are both decided on the SERVER against the server's IST day
 * and ride in on the row. That is the rule `askRules.ts` already holds for
 * `late`, extended to expiry for the same reason: a dealer whose phone is a day
 * fast must not see a valid licence badged red, and two people looking at one
 * outlet must not get two different answers.
 */

/* ──────────────────────── The push that opened the screen ────────────────── */

/**
 * The ask a notification asked us to show, out of the screen's own URL.
 *
 * THE SERVER HAS BEEN BUILDING THIS LINK SINCE BEFORE ANYTHING READ IT.
 * `services/documents/notify.ts` composes every document push as
 * `/documents?ask=<id>` and the native shell hands the whole string to the
 * WebView untouched, so notifications carrying it are already on phones. Until
 * this function existed the tap landed on the right list at the wrong scroll
 * position — a degradation rather than a failure, and the reason the parameter
 * was chosen over a path segment in the first place.
 *
 * The id is whatever `DealerDocumentAskRow.id` is for that row, which is NOT
 * always an ObjectId: a derived line arrives as `owed:<kindCode>:<periodKey>`
 * and a Kavach one as `kavach:<itemId>`, both percent-encoded into the query.
 * `URLSearchParams` decodes them, so nothing here has to know the three shapes
 * apart — which is the point, because a fourth would break a decoder that did.
 */
export function askIdFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('ask');
  const id = raw?.trim();
  return id ? id : null;
}

/**
 * The row that id names, or `undefined`.
 *
 * MATCHED ON THE ID AND NOT ON `askMatchKey`, which is the opposite of what the
 * offline queue does, and both are right. The queue matches on
 * `(kindCode, periodKey)` because it has to survive the server minting a new id
 * for a period the dealer has just answered. A push carries an id that was
 * minted BEFORE it was sent, so the id is exactly the handle it should be
 * looked up by — and matching on the period instead would scroll the dealer to
 * a different paper for the same day.
 *
 * A miss is ordinary and is not an error: the ask may have been withdrawn,
 * settled and aged off the list, or answered from the other phone at the same
 * outlet since the notification went out. The screen just does not scroll.
 */
export function findAskRow(
  rows: readonly DealerDocumentAskRow[],
  id: string | null,
): DealerDocumentAskRow | undefined {
  if (!id) return undefined;
  return rows.find((r) => r.id === id);
}

/* ─────────────────────────── Papers that run out ─────────────────────────── */

/**
 * The renewal request open against a filed paper, if there is still a job in it.
 *
 * `renewedByAskId` says a renewal WAS opened; it does not say it is still the
 * dealer's move. Once they have photographed the new certificate the ask is
 * with MDG, and a card that kept saying "MDG has asked you for the new one"
 * would be asking for a thing that is already sent — which is how a dealer
 * comes to photograph one page twice, the exact failure `outstandingRows` was
 * written to stop on the bar.
 *
 * So the pointer is drawn only when the named ask is on the dealer's own list
 * AND it is their turn on it. An ask that has aged off the list, or one MDG has
 * already accepted, gets no line at all — the new paper's own row is by then
 * sitting in the cabinet a few rows up, saying the same thing better.
 */
export function renewalPointer(
  filed: Pick<DealerDocumentAskRow, 'renewedByAskId'>,
  askRows: readonly DealerDocumentAskRow[],
): DealerDocumentAskRow | undefined {
  const id = filed.renewedByAskId;
  if (!id) return undefined;
  const row = askRows.find((r) => r.id === id);
  return row && row.waitingOn === 'dealer' ? row : undefined;
}

/**
 * How loudly a paper's expiry should be drawn.
 *
 * FOUR ANSWERS, NOT THREE, and the fourth is the one that keeps the screen
 * honest. A register page has no expiry and never will; a `quiet` badge reading
 * "valid until —" would send a dealer hunting for a date that does not exist,
 * so an undated paper gets no badge at all and is simply listed.
 *
 *  - `gone`  — past its date. Red, because there is nothing softer to say.
 *  - `soon`  — inside the reminder ladder's first step. Amber, and the amber
 *              has to be `warning-strong`: the DEFAULT amber under white text
 *              is 2.15:1 and the reader is 55, outdoors, under a canopy, on a
 *              cheap screen.
 *  - `fine`  — in force. Quiet on purpose. A green badge on nineteen rows makes
 *              the two that matter harder to find, not easier.
 *  - `none`  — no date on this kind of paper. Draw nothing.
 */
export type ValidityTone = 'gone' | 'soon' | 'fine' | 'none';

export function validityTone(state: ExpiryState | undefined): ValidityTone {
  if (state === 'expired') return 'gone';
  if (state === 'expiring') return 'soon';
  if (state === 'valid') return 'fine';
  return 'none';
}

/**
 * Whether this row has a validity worth drawing at all.
 *
 * BOTH halves are required, and the pairing is not belt-and-braces. `validUntil`
 * without a `validityState` means the server could not read the date it holds,
 * and no verdict beats a green one; `validityState` without `validUntil` cannot
 * happen today but would print "Good until undefined" if it ever did.
 */
export function hasValidity(
  row: Pick<DealerDocumentAskRow, 'validUntil' | 'validityState'>,
): boolean {
  return Boolean(row.validUntil) && Boolean(row.validityState);
}
