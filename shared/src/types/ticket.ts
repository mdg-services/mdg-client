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
  /** A PDF, several files, or a voice note the AI could not make out — nothing it can answer from. */
  'attachment',
  /** The message was blocked before the AI saw it (abuse, another outlet, passwords). */
  'blocked',
  /** The AI or its vendor failed, timed out or ran out of budget. */
  'machine_fault',
  /** The dealer hit the hourly or daily question limit. */
  'limit',
  /**
   * The dealer wrote again while a person had the thread — a reply was under
   * half an hour old, or someone was "on it" — so the AI stayed out and the
   * message was added to the open ticket. Only ever a follow-up's trigger; no
   * ticket is opened for it.
   */
  'dealer_wrote',
  /** A person at MDG opened it by hand — after a phone call, or for something the AI never saw. */
  'opened_by_person',
  /** The AI is switched off for this dealer (or everywhere), so the message came straight to a person. */
  'ai_off',
  /** The AI asked the dealer to say it again twice and still could not understand; a person reads it. */
  'not_understood',
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

/**
 * "On it until…" — a person at MDG has the ticket and has promised the dealer an
 * update by `until`. Until then the AI stays off that matter (it still answers a
 * clearly unrelated question). It ends with the ticket's resolve, with "Let AI
 * answer", or by `until` passing — the last needs no job: every reader compares
 * it with the clock.
 */
export interface TicketPromise {
  until: string;
  setAt: string;
  byName?: string;
  /**
   * Set when the time passed with no update and the dealer was sent the "taking
   * a little longer" line (ten minutes after `until`). From then the ticket is
   * Late everywhere, and the whole team is told.
   */
  lateAt?: string;
}

/** The longest "on it until" a person may set, in hours. */
export const TICKET_PROMISE_MAX_HOURS = 72;

/** `POST /tickets/:id/on-it`. `until` is an ISO instant, after now and inside the maximum. */
export interface TicketOnItBody {
  until: string;
}

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
  /** Set while a person is "on it"; absent once it is let go or the ticket is resolved. May be in the past. */
  promise?: TicketPromise;
  /** The person who last put themselves on it. Display only — not a lock. */
  ownerName?: string;
  /** Their id, so "Mine" never depends on two people having different names. */
  ownerId?: string;
  /**
   * The last time a person at MDG acted on it in a way the dealer would notice:
   * a typed reply in its thread, "answered outside the app", or opening it by
   * hand. Absent while nobody has — that is what makes a ticket New.
   */
  lastPersonAt?: string;
  /**
   * The thread's waiting clock (`Conversation.awaitingSince`), copied in when the
   * ticket is read: the oldest dealer message nobody at MDG has answered yet.
   * Absent when MDG spoke last.
   */
  dealerWaitingSince?: string;
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
  /** The time MDG promised an update by, while a person is "on it". The time only — never who. */
  promiseUntil?: string;
  /**
   * True when a person at MDG wrote to the dealer after the promise was made, so
   * a time that has passed is not a broken promise. Absent with no promise.
   */
  updatedAfterPromise?: boolean;
  /**
   * True once the "taking a little longer" line went out and the team was told
   * (`promise.lateAt`). Until then a passed time reads "MDG team is looking at it":
   * the bar never says the team was reminded before it was.
   */
  teamReminded?: boolean;
}

/** `GET /tickets/counts`. */
export interface TicketCounts {
  open: number;
  /** Open and nobody has opened it yet. */
  unseen: number;
  /** Open tickets that are New, Waiting or Late (`ticketDeskState`): the inbox badge. */
  needsUs: number;
  /** Open tickets the signed-in admin is on (`ownerName` is theirs and the promise is ahead). */
  mine: number;
  urgent: number;
}

/** Longest resolution note accepted. */
export const TICKET_NOTE_MAX = 1_000;
/** Most follow-ups kept on one ticket; older ones are dropped from the record, never the thread. */
export const TICKET_FOLLOW_UPS_MAX = 20;

/**
 * `POST /tickets/:id/close` — the one way to finish a ticket (the chat's own
 * Resolve is gone). Everything is optional. 409 with code `DEALER_WAITING` when
 * the dealer has written since MDG last replied: answer first (the admin's sheet
 * sends the answer as an ordinary reply, then closes).
 */
export interface TicketCloseBody {
  /** Internal; the dealer never sees it. */
  note?: string;
  /** Adds an entry to the dealer's "Services provided" history. */
  service?: { serviceId: string; serviceName?: string };
}

/** `POST /tickets` — a person opens a ticket by hand (after a call, a WhatsApp, a visit). */
export interface TicketOpenBody {
  conversationId: string;
  /** One line: what it is about. Shown to admins only. */
  summary: string;
  /** Optional "on it until" set in the same step. */
  onItUntil?: string;
}

/** `POST /conversations/:id/answered-outside` — "I answered this on the phone / WhatsApp". */
export interface AnsweredOutsideBody {
  /** Internal; kept in the audit trail. */
  note?: string;
}

/** Longest one-line summary a person may type for a ticket they open. */
export const TICKET_SUMMARY_MAX = 200;
