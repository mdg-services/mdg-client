import type { Lang } from '@/store/lang';
import {
  TEAM_HOURS,
  TICKET_CLOSED_BAR_HOURS,
  ticketBarPhase,
  ticketBarText,
  ticketForBar,
  type TicketBarPhase,
} from '@dk/shared';
import type { TicketDealerView } from '@dk/shared/types';

import { MAX_TIMER_MS } from './ticketLine';

/**
 * What the pinned bar under the chat header draws: the phase (which the page
 * styles and tests read) and the whole line, "#3 · Being worked on · update by
 * 6:00 pm", in the app's language.
 */
export interface TicketBarView {
  phase: TicketBarPhase;
  text: string;
}

/**
 * The bar for this conversation, or `null` for no bar.
 *
 * Which ticket it is about, which phase it is in and every word are the shared
 * helpers' (`ticketForBar`, `ticketBarPhase`, `ticketBarText`), so the admin's
 * wording of the same states and this one cannot drift. Nothing here decides
 * anything: this only strings the three together against one `now`.
 *
 * `now` is a parameter because the answer depends on the clock — a promise that
 * has run out, a closed ticket past its 24 hours, the team's hours starting — and
 * nothing is sent to the phone when any of those happens. See `msUntilBarChange`.
 */
export function ticketBarView(
  tickets: readonly TicketDealerView[] | undefined,
  lang: Lang,
  now: Date = new Date(),
): TicketBarView | null {
  const ticket = ticketForBar(tickets, now);
  if (!ticket) return null;
  const phase = ticketBarPhase(ticket, now);
  if (!phase) return null;
  return { phase, text: ticketBarText(ticket, phase, lang, now) };
}

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** The next instant the IST clock reads `hour`:00 — later today if it has not yet, else tomorrow. India has no daylight saving, so a day is always 24 hours. */
function nextIstHour(now: Date, hour: number): number {
  const ist = now.getTime() + IST_OFFSET_MS;
  const at = ist - (ist % DAY_MS) + hour * HOUR_MS;
  return (at > ist ? at : at + DAY_MS) - IST_OFFSET_MS;
}

/**
 * How long until the bar could read differently, or `null` when only a message
 * from the server can change it. The bar's phase depends on the clock in exactly
 * three ways, and a phone is told about none of them, so the bar sets one timer:
 *
 * - **"Being worked on" ends** when the promised time passes. Its words also name
 *   the day ("tomorrow 10:00 am"), which is wrong after IST midnight, so that is
 *   a wake-up too.
 * - **"Sent" and "the team will see this from 9 am" swap** when the team's hours
 *   start (09:00 IST) or end (23:00 IST).
 * - **"Done ✓" goes away** 24 hours after the ticket was closed.
 *
 * "Looking at it" and "taking a little longer" only change when MDG does
 * something, and that arrives as a conversation update, so they get no timer.
 *
 * The delay is to the first millisecond the bar can differ: the promise helper
 * counts a time as over AT that instant, but the closed window still holds AT its
 * last one, so that case is one millisecond later. Never more than a timer can
 * hold: a longer delay fires at once, and a timer that fires at once and re-arms
 * itself never stops.
 */
export function msUntilBarChange(
  tickets: readonly TicketDealerView[] | undefined,
  now: Date = new Date(),
): number | null {
  const ticket = ticketForBar(tickets, now);
  const phase = ticket ? ticketBarPhase(ticket, now) : null;
  if (!ticket || !phase) return null;

  let at: number | null = null;
  if (phase === 'working') {
    const until = ticket.promiseUntil ? new Date(ticket.promiseUntil).getTime() : NaN;
    at = Math.min(Number.isFinite(until) ? until : Infinity, nextIstHour(now, 0));
  } else if (phase === 'new' || phase === 'night') {
    at = Math.min(nextIstHour(now, TEAM_HOURS.open), nextIstHour(now, TEAM_HOURS.close));
  } else if (phase === 'closed' && ticket.resolvedAt) {
    at = new Date(ticket.resolvedAt).getTime() + TICKET_CLOSED_BAR_HOURS * HOUR_MS + 1;
  }
  if (at === null || !Number.isFinite(at)) return null;
  return Math.min(Math.max(at - now.getTime(), 0), MAX_TIMER_MS);
}
