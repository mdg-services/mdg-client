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
  dealer_wrote: 'Dealer wrote again',
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
  dealer_wrote: 'person',
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
  // The three quiet reasons open nothing. `ack` needs nobody; the other two are
  // a person already on the thread, and the message joins THEIR open ticket as a
  // `dealer_wrote` follow-up when there is one — never a new ticket.
  ack: null,
  quiet_reply: null,
  on_it: null,
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

/** True while a person's "on it until" time is still ahead. A past or missing time is not active. */
export function promiseActive(
  until: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!until) return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

/**
 * The one line under the dealer's bubble that says where their question stands.
 *
 * Four states and four plain phrases. "Done" is never said: RESOLVED means a
 * person closed it, and the reply they wrote in the chat is the answer — this
 * line only says the ticket is closed. `working` is a person "on it" with a time
 * still ahead; once that time passes the line goes back to `looking` by itself.
 */
export function ticketDealerStatus(
  t: Pick<TicketDealerView, 'state' | 'seen' | 'promiseUntil'>,
  now: Date = new Date(),
): 'raised' | 'looking' | 'working' | 'resolved' {
  if (t.state === 'RESOLVED') return 'resolved';
  if (promiseActive(t.promiseUntil, now)) return 'working';
  return t.seen ? 'looking' : 'raised';
}

export const TICKET_DEALER_STATUS_TEXT: Record<
  'raised' | 'looking' | 'working' | 'resolved',
  { en: string; hi: string }
> = {
  raised: { en: 'Sent to the MDG team', hi: 'MDG टीम को भेजा गया' },
  looking: { en: 'MDG team is looking at it', hi: 'MDG टीम देख रही है' },
  working: { en: 'MDG team is working on it', hi: 'MDG टीम इस पर काम कर रही है' },
  resolved: { en: 'Closed by the MDG team', hi: 'MDG टीम ने बंद किया' },
};

/* ───────────────────────── "On it until…" times ─────────────────────────── */

const IST_OFFSET_MS = 330 * 60_000;

/** The IST wall clock of an instant, as plain numbers. */
function istParts(d: Date): { y: number; m: number; day: number; h: number; min: number; dayKey: string } {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth(),
    day: s.getUTCDate(),
    h: s.getUTCHours(),
    min: s.getUTCMinutes(),
    dayKey: s.toISOString().slice(0, 10),
  };
}

/** The instant that is `hour`:00 IST on the IST day after `now`. */
function istTomorrowAt(now: Date, hour: number): Date {
  const p = istParts(now);
  // Date.UTC rolls the day over the month end by itself.
  return new Date(Date.UTC(p.y, p.m, p.day + 1, hour, 0) - IST_OFFSET_MS);
}

/** The three "on it until" choices a person taps. Times, not durations, so the dealer can be told one. */
export function onItChoices(now: Date = new Date()): Array<{ key: '1h' | '3h' | 'tomorrow'; label: string; until: Date }> {
  return [
    { key: '1h', label: '1 hour', until: new Date(now.getTime() + 60 * 60_000) },
    { key: '3h', label: '3 hours', until: new Date(now.getTime() + 3 * 60 * 60_000) },
    { key: 'tomorrow', label: 'Tomorrow 10:00', until: istTomorrowAt(now, 10) },
  ];
}

const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** सुबह 04:00–11:59, दोपहर 12:00–15:59, शाम 16:00–19:59, रात 20:00–03:59. */
function hiDayPart(h: number): string {
  if (h >= 4 && h < 12) return 'सुबह';
  if (h >= 12 && h < 16) return 'दोपहर';
  if (h >= 16 && h < 20) return 'शाम';
  return 'रात';
}

/**
 * An "on it until" time the way a person says it, in IST: "6:00 pm",
 * "tomorrow 10:00 am", "2 Nov, 10:00 am" — or "आज शाम 6 बजे", "कल सुबह 10 बजे",
 * "2 नवंबर सुबह 10 बजे". Relative to `now`'s IST day.
 *
 * PAST MIDNIGHT FROM AN EVENING IS "TONIGHT". "1 hour" picked at 11:30 pm lands
 * at 12:30 am on the next calendar day, and "कल रात 12:30" reads as tomorrow
 * night, a day late. Before 4 am, said from the evening before, it is "12:30 am
 * tonight" / "आज रात 12:30 बजे".
 */
export function promiseTimeText(iso: string, lang: 'en' | 'hi', now: Date = new Date()): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';
  const p = istParts(at);
  const nowParts = istParts(now);
  const today = nowParts.dayKey;
  const tomorrow = istParts(new Date(now.getTime() + 86_400_000)).dayKey;
  const tonight = p.dayKey === tomorrow && p.h < 4 && nowParts.h >= 18;
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const mm = String(p.min).padStart(2, '0');
  if (lang === 'hi') {
    const clock = p.min === 0 ? `${h12} बजे` : `${h12}:${mm} बजे`;
    if (tonight) return `आज रात ${clock}`;
    const day = p.dayKey === today ? 'आज' : p.dayKey === tomorrow ? 'कल' : `${p.day} ${HI_MONTHS[p.m]}`;
    return `${day} ${hiDayPart(p.h)} ${clock}`;
  }
  const clock = `${h12}:${mm} ${p.h < 12 ? 'am' : 'pm'}`;
  if (p.dayKey === today) return clock;
  if (tonight) return `${clock} tonight`;
  if (p.dayKey === tomorrow) return `tomorrow ${clock}`;
  return `${p.day} ${EN_MONTHS[p.m]}, ${clock}`;
}

/** "update by 6:00 pm" / "आज शाम 6 बजे तक अपडेट" — the tail of the dealer's `working` line. */
export function ticketDealerUpdateBy(iso: string, lang: 'en' | 'hi', now: Date = new Date()): string {
  const when = promiseTimeText(iso, lang, now);
  return lang === 'hi' ? `${when} तक अपडेट` : `update by ${when}`;
}
