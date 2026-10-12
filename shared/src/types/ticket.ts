/**
 * A ticket — one dealer question the AI could not settle, held open until a
 * person at MDG has looked at it and closed it.
 *
 * WHY THIS IS ITS OWN RECORD AND NOT THE CONVERSATION'S STATUS
 * ------------------------------------------------------------
 * ADR 0004 made the Conversation the ticket, and for a thread a person works by
 * hand that is still right. It cannot hold "the machine gave up on THIS
 * question" because everything around a thread moves on its own:
 *
 * - the AI answering a later, unrelated question cleared the reply clock and the
 *   "AI passed on" chip, while the first question was still unanswered;
 * - any admin reply, even "ok", cleared the clock and the 30-minute alert;
 * - a dealer's next message restarted the clock from that message, forgetting
 *   the original one;
 * - one thread has one status, so two separate problems could not both be open.
 *
 * So a ticket is opened by the machine, and CLOSED ONLY BY A PERSON. No reply,
 * no later AI answer, no dealer message, no sweep and no alert dismissal closes
 * one. Resolving needs a written note.
 *
 * ONE OPEN TICKET PER THREAD. A second escalation on a thread that already has
 * an open ticket is appended to it (`followUps`) rather than opening a second
 * one, so a dealer firing five unanswerable questions in a row is one piece of
 * work for one admin, not five rows that each look new.
 */

/** `OPEN` until a person resolves it. There is no third state, on purpose. */
export const TICKET_STATES = ['OPEN', 'RESOLVED'] as const;
export type TicketState = (typeof TICKET_STATES)[number];

/**
 * WHY the machine handed this question to a person. A closed list so the
 * Tickets page can tell "only a person can do this" from "we broke".
 */
export const TICKET_TRIGGERS = [
  /** The AI read the dealer's records and decided this needs a person: money, a dispute, a change only MDG can make. */
  'needs_person',
  /** The dealer asked for a person, in any words. */
  'asked_for_person',
  /** The dealer said an answer was wrong, or repeated themselves. */
  'dissatisfied',
  /** The records MDG holds do not answer it. */
  'not_in_records',
  /** The AI wrote an answer and could not prove every figure in it, so it did not send it. */
  'could_not_verify',
  /** A voice note, a PDF or several files — nothing the AI reads. */
  'attachment',
  /** The message was blocked before the AI saw it (abuse, another outlet, passwords). */
  'blocked',
  /** The AI or its vendor failed, timed out or ran out of budget. */
  'machine_fault',
  /** The dealer hit the hourly or daily question limit. */
  'limit',
] as const;
export type TicketTrigger = (typeof TICKET_TRIGGERS)[number];

/** What the question is about, in one word. Chosen by the AI, or by code for code-raised tickets. */
export const TICKET_TOPICS = [
  'money',
  'report',
  'density',
  'documents',
  'kavach',
  'staff',
  'service',
  'app',
  'complaint',
  'other',
] as const;
export type TicketTopic = (typeof TICKET_TOPICS)[number];

/** A later message folded into an open ticket. */
export interface TicketFollowUp {
  messageId: string;
  text: string;
  at: string;
  trigger: TicketTrigger;
}

/** The admin's view of a ticket. Everything. */
export interface TicketView {
  id: string;
  /** A short running number for people to say out loud — "ticket 42". */
  number: number;
  dealerId: string;
  dealerCode?: string;
  conversationId: string;
  conversationKind: 'support' | 'manager';
  state: TicketState;
  trigger: TicketTrigger;
  topic: TicketTopic;
  /** True when the AI judged it time-critical — supply blocked, a deadline today. */
  urgent: boolean;
  /** One line for the admin, in English, written by the AI or by code. Never shown to a dealer. */
  summary: string;
  /** The dealer's own words, the message that opened it. */
  question: string;
  inboundMessageId: string;
  /** The AI turn that raised it, when one did. */
  turnId?: string;
  /** The AI's reply that told the dealer it had been raised, when one was posted. */
  replyMessageId?: string;
  askedBy: { userId: string; name?: string; role?: 'dealer-owner' | 'dealer-staff' };
  followUps: TicketFollowUp[];
  raisedAt: string;
  /** The first time any admin opened it. "Looked at" without a third state. */
  seenAt?: string;
  seenByName?: string;
  resolvedAt?: string;
  resolvedByName?: string;
  /** Required to resolve. Internal — the dealer never sees it. */
  resolutionNote?: string;
  updatedAt: string;
}

/**
 * The dealer's view. State and times only: no note, no admin name, no summary,
 * no trigger — a dealer may learn about their own question, never about our
 * machinery.
 */
export interface TicketDealerView {
  id: string;
  number: number;
  state: TicketState;
  /** True once a person at MDG has opened it. Drives "MDG is looking". */
  seen: boolean;
  raisedAt: string;
  resolvedAt?: string;
}

/** `GET /tickets/counts`. */
export interface TicketCounts {
  open: number;
  /** Open and nobody has opened it yet. */
  unseen: number;
  urgent: number;
}

/** Longest resolution note accepted. */
export const TICKET_NOTE_MAX = 1_000;
/** Most follow-ups kept on one ticket; older ones are dropped from the record, never the thread. */
export const TICKET_FOLLOW_UPS_MAX = 20;
