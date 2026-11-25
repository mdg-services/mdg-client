import type { InfiniteData } from '@tanstack/react-query';

import type { Message, TodayFeed, TodayTaskKind } from '@dk/shared/types';

/**
 * Finding the exact box a report's button should open in the chat (ADR 0056 §4).
 *
 * A report is one message; the box that answers it (the photo ask, the DU OTP steps, the mock
 * drill) is ANOTHER message, usually posted earlier or later. The report's own button used to open
 * the chat at the report, and the dealer then had to scroll to the box. Two places already know
 * where each box is:
 *
 *  - the Today feed's open tasks: every ask is a task with id `ask:<ref>`, and every other box is a
 *    task of its kind, each carrying the box's own conversation and message id, and
 *  - the thread's loaded messages: an ask message carries `ask.ref`.
 *
 * Pure, so each rule is tested without a screen.
 */

/** Where a box is: which chat and which message in it. */
export interface BoxTarget {
  conversationId: string;
  messageId: string;
}

/** The open ask for `askRef` in the feed's tasks, or null. Matches a photo ask and a sign-a-letter ask alike. */
export function askInFeed(feed: Pick<TodayFeed, 'tasks'> | undefined, askRef: string): BoxTarget | null {
  const hit = feed?.tasks.find(
    (t) => t.id === `ask:${askRef}` || (t.action?.type === 'photo' && t.action.askRef === askRef),
  );
  return hit ? { conversationId: hit.conversationId, messageId: hit.messageId } : null;
}

/** The newest open box of a kind (the DU OTP steps, the mock drill, the declarations) in the feed's tasks, or null. */
export function taskInFeed(feed: Pick<TodayFeed, 'tasks'> | undefined, kind: TodayTaskKind): BoxTarget | null {
  const hits = (feed?.tasks ?? []).filter((t) => t.kind === kind);
  if (hits.length === 0) return null;
  const newest = [...hits].sort((a, b) => b.since.localeCompare(a.since))[0]!;
  return { conversationId: newest.conversationId, messageId: newest.messageId };
}

/** The newest message of a thread's loaded pages that asks for `askRef`, or null. */
export function askInThread(
  thread: InfiniteData<Message[]> | undefined,
  conversationId: string,
  askRef: string,
): BoxTarget | null {
  let best: Message | null = null;
  for (const m of thread?.pages.flat() ?? []) {
    if (m.ask?.ref !== askRef || m.id.startsWith('temp-')) continue;
    if (!best || m.createdAt > best.createdAt) best = m;
  }
  return best ? { conversationId, messageId: best.id } : null;
}
