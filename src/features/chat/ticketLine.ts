import { pick } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import {
  TICKET_DEALER_STATUS_TEXT,
  promiseActive,
  ticketDealerStatus,
  ticketDealerUpdateBy,
  ticketRef,
} from '@dk/shared';
import type { TicketDealerView } from '@dk/shared/types';

/** Where a dealer's raised question stands: sent, being looked at, being worked on, or closed. */
export type TicketLineStatus = ReturnType<typeof ticketDealerStatus>;

/**
 * The facts a bubble needs to draw its status line. All primitives.
 *
 * `until` is there only while the status is `working` — the time the team said
 * it would update by, as an ISO string. It is left OUT of every other line, not
 * set to undefined, so a line that has nothing to say about time carries nothing
 * about time.
 */
export interface TicketLine {
  status: TicketLineStatus;
  number: number;
  until?: string;
}

/**
 * The conversation's tickets, keyed by id, reduced to what a bubble draws.
 *
 * Reduced HERE, once per list, so the memoized bubble is handed a status word
 * and a number and not the ticket object: the conversation is replaced in the
 * list cache on every socket update, and a fresh object per render would
 * re-render every bubble in the thread for a line only one of them shows.
 *
 * A ticket that is not in the list gets no entry, and the bubble shows nothing.
 * That is the rule for a resolved ticket older than the server's seven-day
 * window: the message that raised it stays in the thread, the line under it
 * does not.
 *
 * `now` is a parameter so a promise that has run out reads as `looking` or
 * `raised` again: the status depends on the clock, and the list is only rebuilt
 * when the tickets change or `msUntilPromiseEnds` says one has lapsed.
 */
export function ticketLinesById(
  tickets: readonly TicketDealerView[] | undefined,
  now: Date = new Date(),
): Map<string, TicketLine> {
  const lines = new Map<string, TicketLine>();
  for (const t of tickets ?? []) {
    const status = ticketDealerStatus(t, now);
    lines.set(
      t.id,
      status === 'working' && t.promiseUntil
        ? { status, number: t.number, until: t.promiseUntil }
        : { status, number: t.number },
    );
  }
  return lines;
}

/** The longest delay `setTimeout` accepts (about 24 days). The pinned bar's timer reads it too. */
export const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * How long until the soonest running "on it" time passes, or `null` when none is
 * running. Nothing is sent to the dealer's phone when a promise ends — the line
 * has to change by itself — so the list sets one timer for this.
 *
 * Never more than a timer can hold: a larger delay fires at once, and a timer
 * that fires at once and re-arms itself never stops.
 */
export function msUntilPromiseEnds(
  tickets: readonly TicketDealerView[] | undefined,
  now: Date = new Date(),
): number | null {
  let soonest: number | null = null;
  for (const t of tickets ?? []) {
    const until = t.promiseUntil;
    if (t.state !== 'OPEN' || !until || !promiseActive(until, now)) continue;
    const left = new Date(until).getTime() - now.getTime();
    if (soonest === null || left < soonest) soonest = left;
  }
  return soonest === null ? null : Math.min(soonest, MAX_TIMER_MS);
}

/**
 * "#42 · MDG team is looking at it", in the app's language. A `working` line
 * carries the time too — "#3 · MDG team is working on it · update by 6:00 pm" —
 * and without a time it is just the first half, never an empty tail.
 */
export function ticketLineText(
  lang: Lang,
  status: TicketLineStatus,
  number: number,
  until?: string,
  now: Date = new Date(),
): string {
  const words = TICKET_DEALER_STATUS_TEXT[status];
  const line = `${ticketRef(number)} · ${pick(lang, words.en, words.hi)}`;
  // `ticketDealerUpdateBy` answers "update by " for a time it cannot read, so the
  // time is checked here rather than the text it returns.
  if (status !== 'working' || !until || !Number.isFinite(new Date(until).getTime())) return line;
  return `${line} · ${ticketDealerUpdateBy(until, lang, now)}`;
}
