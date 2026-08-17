/**
 * Ordering and display for dealer codes — the one thing that identifies a
 * dealer. Lives in shared because the backend sorts the cross-dealer roster
 * server-side while several admin panes filter and sort an already-loaded list,
 * and the two orders drifting apart is exactly the sort of thing nobody notices
 * until a dealer is missing from where an operator expected them.
 */

/**
 * Compare two dealer codes the way a person reads them: `2E` before `3E` before
 * `15E`. A plain string compare puts `15E` first, because `'1' < '2'`.
 *
 * Codes with no value sort last, so a roster's usable rows lead.
 */
export function compareDealerCodes(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = (a ?? '').trim();
  const right = (b ?? '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * A dealer code for display. Falls back to an em dash rather than an invented
 * label: before the code became the dealer's identity a record could exist
 * without one, and half a dozen different placeholders ("Unnamed dealer",
 * "Dealer", "This dealer") were in circulation for that case.
 */
export function dealerCodeLabel(code: string | null | undefined): string {
  return code?.trim() || '—';
}
