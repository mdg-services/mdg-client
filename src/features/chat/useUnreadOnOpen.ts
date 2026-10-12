import * as React from 'react';

import type { Message } from '@dk/shared/types';

import { captureUnread, type UnreadOnOpen } from './messageRuns';

/**
 * What was unread at the moment this thread was opened — captured ONCE, and held
 * for as long as the thread stays open.
 *
 * It has to be a snapshot and not something worked out from the messages as they
 * are now: the screen tells the server it has read the messages the moment they
 * are on it, and a few moments later the thread's own cache says every one of
 * them is read. A divider computed from that would vanish the instant it was
 * drawn. Taken during the same render that first holds the fresh answer from the
 * server — and therefore BEFORE the effect that sends the "read" — it keeps
 * saying where the dealer left off until they leave.
 *
 * `fresh` is "the answer to the request made on opening is in". Before it, the
 * thread may only be showing what was cached from an earlier visit, which cannot
 * hold what arrived since, and the hook returns `null` ("not known yet").
 */
export function useUnreadOnOpen(
  conversationId: string | undefined,
  userId: string | undefined,
  messages: readonly Message[],
  fresh: boolean,
): UnreadOnOpen | null {
  const held = React.useRef<{ id: string | undefined; value: UnreadOnOpen | null }>({
    id: conversationId,
    value: null,
  });
  if (held.current.id !== conversationId) {
    held.current = { id: conversationId, value: null };
  }
  if (!held.current.value && fresh && userId && conversationId) {
    held.current.value = captureUnread(messages, userId);
  }
  return held.current.value;
}
