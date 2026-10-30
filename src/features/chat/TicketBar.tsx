import * as React from 'react';

import { useLang } from '@/lib/i18n';
import type { TicketDealerView } from '@dk/shared/types';

import { msUntilBarChange, ticketBarView } from './ticketBarView';

/**
 * The pinned bar under the chat header: where the dealer's open question stands,
 * in one quiet line — "#3 · Being worked on · update by 6:00 pm". For 24 hours
 * after a ticket is closed it says "#3 · Done ✓", then it goes.
 *
 * Not a button, and the same white and grey as the header it hangs from: it
 * tells, it does not ask for anything. The line under the bubble that raised the
 * ticket is a separate thing and stays.
 *
 * `hidden` is the page asking it to step aside (messages being picked, a search
 * open) without leaving the tree — the same arrangement as the setup strip.
 *
 * THE BAR HAS TO CHANGE BY ITSELF. A promise running out, the team's hours
 * starting and a closed ticket's 24 hours ending send nothing to the phone, so
 * one timer is set for the next of them (`msUntilBarChange`) and bumps `tick`,
 * the same way the line under a bubble is kept honest in `MessageList`. A timer
 * does not count the time a phone was asleep, so coming back to the screen works
 * the bar out again at once.
 */
export function TicketBar({
  tickets,
  hidden = false,
}: {
  tickets: readonly TicketDealerView[] | undefined;
  hidden?: boolean;
}) {
  const lang = useLang();
  const [tick, setTick] = React.useState(0);
  const bar = React.useMemo(
    () => ticketBarView(tickets, lang),
    // `tick` is not read inside: bumping it is how the timer below asks for the
    // bar to be worked out again against the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickets, lang, tick],
  );
  React.useEffect(() => {
    const wait = msUntilBarChange(tickets);
    if (wait === null) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), wait);
    return () => window.clearTimeout(timer);
  }, [tickets, tick]);
  const hasTickets = !!tickets && tickets.length > 0;
  React.useEffect(() => {
    if (!hasTickets) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [hasTickets]);

  if (!bar || hidden) return null;
  return (
    <div
      data-ticket-bar
      data-phase={bar.phase}
      role="status"
      className="shrink-0 border-b border-wa-divider bg-wa-bar px-4 py-1.5 text-[13px] leading-snug text-wa-meta"
    >
      <span className="break-words">{bar.text}</span>
    </div>
  );
}
