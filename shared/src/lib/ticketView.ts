/**
 * Words and colours for tickets, on both sides.
 *
 * In shared rather than in `mdg-admin` because that app has no test runner;
 * the dealer app's vitest tests this module (see `aiFirstLineView.ts` for the
 * same arrangement). Every map is a `Record` over the closed list, so a new
 * trigger or topic cannot ship without a label.
 */
import type { AiHandoffReason } from '../types/aiFirstLine';
import type {
  TicketDealerView,
  TicketState,
  TicketTopic,
  TicketTrigger,
  TicketView,
} from '../types/ticket';

export type TicketTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const TICKET_TRIGGER_LABEL: Record<TicketTrigger, string> = {
  needs_person: 'Needs a person',
  asked_for_person: 'Asked for a person',
  dissatisfied: 'Unhappy with an answer',
  not_in_records: 'Not in our records',
  could_not_verify: 'AI could not check its answer',
  attachment: 'Voice note or file',
  blocked: 'Blocked message',
  machine_fault: 'AI fault',
  limit: 'Question limit reached',
};

/**
 * Whose work the ticket is. `person` is the real escalation — the machine did
 * its job. `gap` is something we could answer and never built. `fault` is a bug.
 * The Tickets page uses this to colour the trigger, so a morning of faults does
 * not hide inside a morning of honest escalations.
 */
export const TICKET_TRIGGER_KIND: Record<TicketTrigger, 'person' | 'gap' | 'fault'> = {
  needs_person: 'person',
  asked_for_person: 'person',
  dissatisfied: 'person',
  not_in_records: 'gap',
  could_not_verify: 'fault',
  attachment: 'person',
  blocked: 'person',
  machine_fault: 'fault',
  limit: 'person',
};

export function ticketTriggerTone(trigger: TicketTrigger): TicketTone {
  const kind = TICKET_TRIGGER_KIND[trigger];
  if (kind === 'fault') return 'danger';
  if (kind === 'gap') return 'warning';
  return trigger === 'dissatisfied' ? 'danger' : 'neutral';
}

export const TICKET_TOPIC_LABEL: Record<TicketTopic, string> = {
  money: 'Money',
  report: 'Reports',
  density: 'Density',
  documents: 'Papers',
  kavach: 'Kavach',
  staff: 'Staff',
  service: 'Services',
  app: 'The app',
  complaint: 'Complaint',
  other: 'Other',
};

export const TICKET_STATE_LABEL: Record<TicketState, string> = {
  OPEN: 'Open',
  RESOLVED: 'Resolved',
};

/**
 * Which ticket trigger a first-line handoff reason opens.
 *
 * `null` means NO TICKET: the reason posts nothing to the dealer (a manager's
 * group chatter) or is retired. Every other handoff is a question somebody at
 * MDG now has to answer, and the ticket is what makes sure they do.
 */
export const TICKET_TRIGGER_FOR_REASON: Record<AiHandoffReason, TicketTrigger | null> = {
  attachment: 'attachment',
  group_thread: null,
  asked_for_human: 'asked_for_person',
  guard_in: 'blocked',
  quota: 'limit',
  budget: 'machine_fault',
  repeat: 'needs_person',
  follow_up: null,
  dissatisfied: 'dissatisfied',
  repeat_miss: 'not_in_records',
  same_answer: 'dissatisfied',
  no_intent: 'not_in_records',
  tool_refused: 'not_in_records',
  tool_error: 'machine_fault',
  guard_out: 'could_not_verify',
  bad_router_output: 'machine_fault',
  model_error: 'machine_fault',
  vendor_busy: 'machine_fault',
  escalated: 'needs_person',
  could_not_verify: 'could_not_verify',
};

/** Minutes since `iso`, never negative. */
export function ticketAgeMinutes(iso: string, now: Date = new Date()): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 60_000));
}

/** "4 min", "3 h", "2 d". */
export function ticketAgeLabel(iso: string, now: Date = new Date()): string {
  const m = ticketAgeMinutes(iso, now);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Warn after 30 minutes open, danger after 2 hours or when urgent and unseen. */
export const TICKET_WARN_MINUTES = 30;
export const TICKET_DANGER_MINUTES = 120;

/** How loud an open ticket's age should look on the list. */
export function ticketAgeTone(
  t: Pick<TicketView, 'state' | 'raisedAt' | 'urgent' | 'seenAt'>,
  now: Date = new Date(),
): TicketTone {
  if (t.state === 'RESOLVED') return 'success';
  const m = ticketAgeMinutes(t.raisedAt, now);
  if (m >= TICKET_DANGER_MINUTES || (t.urgent && !t.seenAt)) return 'danger';
  if (m >= TICKET_WARN_MINUTES) return 'warning';
  return 'info';
}

/** The ticket's short name, the way a person says it. */
export function ticketRef(number: number): string {
  return `#${number}`;
}

/**
 * The one line under the dealer's bubble that says where their question stands.
 *
 * Three states and three plain phrases. "Done" is never said: RESOLVED means a
 * person closed it, and the reply they wrote in the chat is the answer — this
 * line only says the ticket is closed.
 */
export function ticketDealerStatus(
  t: Pick<TicketDealerView, 'state' | 'seen'>,
): 'raised' | 'looking' | 'resolved' {
  if (t.state === 'RESOLVED') return 'resolved';
  return t.seen ? 'looking' : 'raised';
}

export const TICKET_DEALER_STATUS_TEXT: Record<
  'raised' | 'looking' | 'resolved',
  { en: string; hi: string }
> = {
  raised: { en: 'Sent to the MDG team', hi: 'MDG टीम को भेजा गया' },
  looking: { en: 'MDG team is looking at it', hi: 'MDG टीम देख रही है' },
  resolved: { en: 'Closed by the MDG team', hi: 'MDG टीम ने बंद किया' },
};
