import { countsOf } from '@/features/glance/glanceModel';
import type { Role } from '@/features/glance/needsMe';
import type { KavachDealerView, TodayFeed } from '@dk/shared/types';

/**
 * What the Today door's badge counts (spec 2.1): ONLY the work that waits for the reader, the number the
 * verdict card calls "need you". It is the glance model's `countsOf(...).needYou`, the very function the
 * card's chip and My pump read, so for that number the badge and the card agree.
 *
 * It does NOT count the reports that "need a look". The card lists those from the alerts each report
 * kind raises, and a kind may raise none for a report whose status is `attention`; the bar loads no
 * kind's drawing code (`todayBadge.test.ts` pins that), so it cannot know which ones the card will
 * list, and a count it guessed showed 8 on the bar against 5 on the card. A number that can be wrong
 * is left off the bar; the card carries the "look" count. (To put it back, the server would mark which
 * attention reports raise a Today alert and the bar would count that flag.)
 *
 *  - `needYou`: the open tasks, plus the signed-in reader's own Kavach points that are late or sent
 *    back (the owner's count leaves out the manager's daily work, as the Kavach page does).
 *
 * `setupShown`: the setup hero is on Today and carries the feed's own setup task with its button, so
 * it is not counted a second time.
 */
export function todayBadgeCounts(input: {
  /** `done` may be absent in an older answer: it is read as empty. */
  feed: (Pick<TodayFeed, 'tasks' | 'reports'> & Partial<Pick<TodayFeed, 'done'>>) | undefined;
  kavach?: KavachDealerView | null | undefined;
  role: Role;
  now?: Date;
  setupShown?: boolean;
}): { needYou: number } {
  const { feed, kavach, role, now = new Date(), setupShown = false } = input;
  try {
    const { needYou } = countsOf({
      feed: feed ? ({ day: '', role, ...feed, done: feed.done ?? [], reports: feed.reports ?? [] } as TodayFeed) : null,
      kavach,
      role,
      now,
      setupShown,
    });
    return { needYou };
  } catch {
    // The bar is drawn on every door: one answer a newer or older server shaped differently must not take
    // it down. The open tasks are still counted.
    return { needYou: feed ? feed.tasks.filter((t) => !(setupShown && t.kind === 'setup')).length : 0 };
  }
}
