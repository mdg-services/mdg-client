import { keepPreviousData, useQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ChatAskState, Message } from '@dk/shared/types';

/**
 * Where each request MDG posted in a thread stands, for the buttons drawn on
 * those messages (ADR 0019).
 *
 * A request lives on the server — a paper, a register page, a Kavach photo — and
 * a message that asks for it is a snapshot from the day it was posted. Whether
 * its "Send photo" button should still be there TODAY is therefore a separate
 * question, asked here: one batched `GET /v1/asks/me/states?refs=a,b,c` per
 * thread, for the requests among the messages that are loaded.
 *
 * The server answers only for refs this dealer owns; a ref it does not mention
 * simply is not drawn (nothing to press, nothing to claim). The cap is the
 * server's — fifty — and the NEWEST fifty are asked for, because an old request
 * is the one nobody is going to act on.
 */

/** The server accepts at most this many refs in one call. */
export const MAX_ASK_REFS = 50;

/** Every ask-states query of one thread — the thing to invalidate or patch. */
export function chatAskStatesPrefix(conversationId: string) {
  return ['conversation', conversationId, 'ask-states'] as const;
}

export function chatAskStatesKey(conversationId: string, refsKey: string) {
  return [...chatAskStatesPrefix(conversationId), refsKey] as const;
}

/** What the thread's messages say about their requests. */
export interface AskRefs {
  /** The refs to ask about: newest request first, at most {@link MAX_ASK_REFS}. */
  refs: string[];
  /**
   * ref → the id of the message that most recently posted it.
   *
   * The same request is posted again when MDG nudges ("still waiting on the fire
   * NOC"), and two live "Send photo" buttons for one request is one too many —
   * the older one is out of date the moment the newer one lands. Only the newest
   * post of a request carries the button and the state.
   */
  latestIdByRef: Map<string, string>;
}

/** Pure, so it can be tested without a thread. */
export function collectAskRefs(messages: readonly Message[]): AskRefs {
  const newest = new Map<string, { id: string; createdAt: string }>();
  for (const m of messages) {
    // A message still on its way out is the dealer's own and never an ask.
    if (!m.ask || m.id.startsWith('temp-')) continue;
    const seen = newest.get(m.ask.ref);
    if (!seen || m.createdAt > seen.createdAt || (m.createdAt === seen.createdAt && m.id > seen.id)) {
      newest.set(m.ask.ref, { id: m.id, createdAt: m.createdAt });
    }
  }
  const refs = [...newest.entries()]
    .sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt))
    .slice(0, MAX_ASK_REFS)
    .map(([ref]) => ref);
  const latestIdByRef = new Map<string, string>();
  for (const [ref, v] of newest) latestIdByRef.set(ref, v.id);
  return { refs, latestIdByRef };
}

/** What a thread's messages need to know to draw their request footers. */
export interface ChatAskStates {
  /**
   * `loading`: nothing known yet. `ready`: the server answered (a refetch in the
   * background keeps the old answer on screen). `failed`: it did not, and there
   * is no earlier answer to fall back on.
   */
  status: 'loading' | 'ready' | 'failed';
  /** ref → state. A ref the server did not name is absent. */
  byRef: ReadonlyMap<string, ChatAskState>;
  latestIdByRef: ReadonlyMap<string, string>;
  refetch: () => void;
}

export function useChatAskStates(
  conversationId: string | undefined,
  messages: readonly Message[],
): ChatAskStates {
  const token = useAuthStore((s) => s.token);
  const { refs, latestIdByRef } = React.useMemo(() => collectAskRefs(messages), [messages]);
  // Sorted, so the same set of requests is the same cache entry whatever order
  // the thread happened to list them in.
  const refsKey = React.useMemo(() => [...refs].sort().join(','), [refs]);

  const q = useQuery({
    queryKey: chatAskStatesKey(conversationId ?? 'none', refsKey),
    enabled: !!token && !!conversationId && refs.length > 0,
    // A new request arriving changes the key. Keep drawing the old answers while
    // the new one is on its way, so the buttons already on screen do not blink.
    placeholderData: keepPreviousData,
    // Opening a thread asks again, as it does for the messages themselves: only
    // the open thread hears about changes, so one the dealer left a minute ago
    // may have had its request received since. After that, every real change
    // reaches us by invalidation (a message from MDG, a reconnect, our own
    // send) rather than by a clock.
    refetchOnMount: 'always',
    staleTime: 30_000,
    queryFn: () => api.get<ChatAskState[]>('/v1/asks/me/states', { refs: refs.join(',') }),
  });

  const byRef = React.useMemo(() => {
    const map = new Map<string, ChatAskState>();
    for (const s of q.data ?? []) map.set(s.ref, s);
    return map;
  }, [q.data]);

  // A failure only counts when there is nothing earlier to show: a background
  // refetch that fails keeps the answer the dealer was already looking at.
  const status: ChatAskStates['status'] = q.data
    ? 'ready'
    : q.isError
      ? 'failed'
      : 'loading';
  const { refetch } = q;
  const retry = React.useCallback(() => void refetch(), [refetch]);

  return React.useMemo(
    () => ({ status, byRef, latestIdByRef, refetch: retry }),
    [status, byRef, latestIdByRef, retry],
  );
}

/** Ask the server again about every request in this thread. */
export function invalidateChatAskStates(qc: QueryClient, conversationId: string): void {
  void qc.invalidateQueries({ queryKey: chatAskStatesPrefix(conversationId) });
}

/**
 * Ask the server again about the requests in EVERY thread this phone has opened.
 *
 * A paper is one request but may be posted into two chats (the owner's and the
 * manager group), and its state is the same in both. Something that settles it —
 * MDG marking it received, from the Vault or from another chat — reaches only the
 * thread the "Received" reply lands in, so the copy in the other chat, and the
 * one on a second phone, keep a live "Send photo" until it is asked again.
 */
export function invalidateAllChatAskStates(qc: QueryClient): void {
  void qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'conversation' && q.queryKey[2] === 'ask-states',
  });
}

/**
 * How long after an answer lands we ask where its request stands.
 *
 * The server files the photo once it has answered the send, so the first answer
 * can be too early. Four seconds is past the copy-and-file on a normal link; a
 * filing that failed (a file the server cannot use) is also announced by a reply
 * from MDG, which asks again by itself — this is the quiet path's safety net.
 */
export const ASK_STATE_RECHECK_MS = 4_000;

/**
 * An answer to a request has gone out (ours) or come in (a colleague's): show the
 * request as sent, now.
 *
 * The server files the photo AFTER it has answered the send, so asking it again
 * straight away can still say `open` — and a button that comes back the moment
 * it was pressed invites a second photo. This puts the answer on screen first;
 * the server's own answer replaces it on the next refetch. A request that has
 * already been received stays received.
 *
 * Returns how to take it back: a send that fails after this has marked the
 * request must give the button back, or the dealer is left with a "Sent" for a
 * photo that never went. It only reverts what it wrote — a refetch that has
 * since said something else is left alone.
 */
export function markAskSent(qc: QueryClient, conversationId: string, ref: string): () => void {
  const changed: Array<{ key: QueryKey; before: ChatAskState }> = [];
  for (const [key, data] of qc.getQueriesData<ChatAskState[]>({
    queryKey: chatAskStatesPrefix(conversationId),
  })) {
    const mine = data?.find((s) => s.ref === ref);
    if (!mine || mine.status === 'received' || mine.status === 'closed' || mine.status === 'sent') {
      continue;
    }
    changed.push({ key, before: mine });
    qc.setQueryData<ChatAskState[]>(key, (old) =>
      old?.map((s) => (s.ref === ref ? { ref, status: 'sent' } : s)),
    );
  }
  return () => {
    for (const { key, before } of changed) {
      qc.setQueryData<ChatAskState[]>(key, (old) =>
        old?.map((s) => (s.ref === ref && s.status === 'sent' ? before : s)),
      );
    }
  };
}

/**
 * {@link markAskSent}, and the server asked again once it has had time to file.
 * Returns the timer, for a caller that has to cancel it when its screen goes.
 */
export function markAskSentThenRecheck(
  qc: QueryClient,
  conversationId: string,
  ref: string,
): number {
  markAskSent(qc, conversationId, ref);
  return window.setTimeout(
    () => invalidateChatAskStates(qc, conversationId),
    ASK_STATE_RECHECK_MS,
  );
}
