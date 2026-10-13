/**
 * Asks in the chat (ADR 0019): everything MDG needs from a dealer is asked for
 * IN the chat, answered IN the chat, and marked received by MDG.
 *
 * MDG posts a request as an ordinary MDG message carrying a {@link MessageAsk}.
 * The dealer's app draws it with a "Send photo" button; the photo goes back as
 * a reply to that message, naming the request (`answersAsk`). The server files
 * it where the request lives — a document ask, a density register day, a
 * Kavach task — and either marks it received at once (the register page) or
 * leaves it for an MDG person to check (papers, Kavach photos).
 *
 * A request is named by a REF, one string a message, a reply and an admin
 * action can all carry without knowing which collection it lives in:
 *   - `doc:<askId>`   a DocumentAsk row (licences, papers, anything an admin asked for)
 *   - `reg:<YYYY-MM-DD>` the density register page for that IST day
 *   - `kv:<itemId>`   a Kavach task's photo evidence
 */

export type ChatAskKind = 'document' | 'register' | 'kavach';

export const CHAT_ASK_REF_PATTERN = /^(doc|reg|kv):([A-Za-z0-9-]{1,40})$/;

/** The request a message asks for, carried on the message itself. */
export interface MessageAsk {
  /** `doc:<askId>` | `reg:<YYYY-MM-DD>` | `kv:<itemId>` — see the file header. */
  ref: string;
  kind: ChatAskKind;
  /** What is wanted, in the language of the chat it was posted into. */
  title: string;
  /** The day or period it is for, already in words ("12 Oct"), when there is one. */
  periodLabel?: string;
  /** True when a PDF is as good as a photo (papers); false for a photo-only ask. */
  acceptsFile?: boolean;
}

/**
 * Where a request stands, as the dealer's app needs to draw it:
 *  - `open`     still the dealer's turn — the button shows
 *  - `sent`     the dealer answered; MDG has not checked it yet
 *  - `received` MDG has it (checked by a person, or received automatically)
 *  - `closed`   no longer wanted (withdrawn, lapsed) — no button, no tick
 */
export type ChatAskStatus = 'open' | 'sent' | 'received' | 'closed';

export interface ChatAskState {
  ref: string;
  status: ChatAskStatus;
  /** When MDG sent it back, its reason, verbatim — the ask is `open` again. */
  rejectReason?: string;
}

/**
 * One open request for the admin inbox's "Open requests" card: what MDG is
 * waiting for from this outlet, and — when the dealer has answered in the
 * chat — the message that answered it, so "Mark received" can name the photo.
 */
export interface DealerOpenRequest {
  ref: string;
  kind: ChatAskKind;
  titleEn: string;
  titleHi: string;
  periodLabel?: string;
  /** `open`: waiting on the dealer. `sent`: the dealer answered, waiting on MDG. */
  status: 'open' | 'sent';
  /** The dealer's chat message carrying the answer, when it came through the chat. */
  answeredBy?: { conversationId: string; messageId: string };
  /** The paper carries an expiry date the admin must type when marking it received. */
  tracksValidity?: boolean;
  /** The admin's own words when they asked, if any. */
  note?: string;
}

/** `doc:abc` → `{ kind: 'document', id: 'abc' }`; anything else → null. */
export function parseChatAskRef(ref: string): { kind: ChatAskKind; id: string } | null {
  const m = CHAT_ASK_REF_PATTERN.exec(ref);
  if (!m) return null;
  const kind: ChatAskKind = m[1] === 'doc' ? 'document' : m[1] === 'reg' ? 'register' : 'kavach';
  return { kind, id: m[2]! };
}

export function chatAskRef(kind: ChatAskKind, id: string): string {
  return `${kind === 'document' ? 'doc' : kind === 'register' ? 'reg' : 'kv'}:${id}`;
}
