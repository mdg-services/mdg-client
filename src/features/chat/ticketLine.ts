import { pick } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import {
  TICKET_DEALER_STATUS_TEXT,
  ticketDealerStatus,
  ticketRef,
} from '@dk/shared';
import type { TicketDealerView } from '@dk/shared/types';

/** Where a dealer's raised question stands: sent, being looked at, or closed. */
export type TicketLineStatus = ReturnType<typeof ticketDealerStatus>;

/** The two facts a bubble needs to draw its status line. Both primitives. */
export interface TicketLine {
  status: TicketLineStatus;
  number: number;
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
 */
export function ticketLinesById(
  tickets: readonly TicketDealerView[] | undefined,
): Map<string, TicketLine> {
  const lines = new Map<string, TicketLine>();
  for (const t of tickets ?? []) {
    lines.set(t.id, { status: ticketDealerStatus(t), number: t.number });
  }
  return lines;
}

/** "#42 · MDG team is looking at it", in the app's language. */
export function ticketLineText(
  lang: Lang,
  status: TicketLineStatus,
  number: number,
): string {
  const words = TICKET_DEALER_STATUS_TEXT[status];
  return `${ticketRef(number)} · ${pick(lang, words.en, words.hi)}`;
}
