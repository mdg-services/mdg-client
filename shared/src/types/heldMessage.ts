/**
 * The watch period's review queue (docs/specs/onboarding-v2.md §5).
 *
 * For the first days after a new outlet's services start, a message that would
 * reach that dealer with NO person in the loop — the Kavach daily line, the
 * morning asks, paper reminders, the tanker density notice, onboarding
 * reminders — is held here instead of being posted. A person sees it exactly as
 * the dealer would and sends it or drops it. Reports an admin sends with Share
 * already have a person looking and are never held. Nothing in the chat can be
 * recalled once posted (ADR 0014), which is why the hold comes first.
 */

export const HELD_MESSAGE_STATES = ['held', 'sent', 'dropped', 'expired'] as const;
export type HeldMessageState = (typeof HELD_MESSAGE_STATES)[number];

/** Which unattended sender wanted to post it. */
export const HELD_MESSAGE_SOURCES = [
  'kavach_digest',
  'morning_ask',
  'paper_reminder',
  'density_notice',
  'onboarding_reminder',
  'other',
] as const;
export type HeldMessageSource = (typeof HELD_MESSAGE_SOURCES)[number];

export interface HeldMessage {
  id: string;
  dealerId: string;
  dealerCode: string;
  source: HeldMessageSource;
  /** Who it would reach: owners, the manager group, or both. */
  audience: 'owners' | 'manager' | 'both';
  /** The words exactly as the dealer would read them (first language of the chat). */
  text: string;
  /** Files it carries, by name, for the preview. */
  attachments: Array<{ filename: string; contentType: string }>;
  heldAt: string;
  /** Unsent by then = dropped as `expired`. */
  expiresAt: string;
  state: HeldMessageState;
  decidedAt: string | null;
  decidedByName: string | null;
  dropReason: string | null;
}

export interface HeldMessageList {
  /** Oldest first: the one waiting longest is at the top. */
  items: HeldMessage[];
  counts: { held: number };
}
