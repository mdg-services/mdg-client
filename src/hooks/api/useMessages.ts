import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Message } from '@dk/shared/types';

const PAGE_SIZE = 30;

export function messagesQueryKey(conversationId: string) {
  return ['conversation', conversationId, 'messages'] as const;
}

/** A message the phone made up while the server has not answered yet. */
export function isPendingMessage(m: Pick<Message, 'id'>): boolean {
  return m.id.startsWith('temp-');
}

/**
 * Which row a confirmed message stands in for.
 *
 * A message you send is drawn at once under a made-up id (`temp-…`), and when
 * the server answers it is swapped for the real one. Keyed by id, that swap
 * would tear the row down and build another, and a photograph would blink at the
 * exact moment it is sent. Remembering "this real id is that temp id" lets the
 * list keep the same row (and the same picture on screen) across the swap.
 *
 * Bounded: a session sends a few hundred messages at most and each entry is two
 * short strings, but nothing here should be able to grow without end.
 */
const ALIASES = new Map<string, string>();
const ALIAS_LIMIT = 200;

export function aliasMessageId(realId: string, tempId: string): void {
  ALIASES.set(realId, tempId);
  if (ALIASES.size > ALIAS_LIMIT) {
    const oldest = ALIASES.keys().next().value;
    if (oldest !== undefined) ALIASES.delete(oldest);
  }
}

/** The key to give a message's row: its temp id if it began life as one. */
export function renderKey(id: string): string {
  return ALIASES.get(id) ?? id;
}

function oldestCreatedAt(page: readonly Message[]): string | undefined {
  let oldest: string | undefined;
  for (const m of page) {
    if (oldest === undefined || m.createdAt < oldest) oldest = m.createdAt;
  }
  return oldest;
}

export function useMessages(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    queryKey: conversationId
      ? messagesQueryKey(conversationId)
      : ['conversation', 'unknown', 'messages'],
    enabled: !!conversationId,
    // OPENING A CHAT ALWAYS ASKS THE SERVER AGAIN. Only the thread that is open
    // listens for new messages, so a thread the dealer left a minute ago has not
    // heard anything since — and with the chat list as the first screen, "left a
    // minute ago" is the ordinary case, not the exception. The 2-minute freshness
    // window the rest of the app runs on would show them the old thread under a
    // list that says two messages are waiting.
    refetchOnMount: 'always',
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const items = await api.get<Message[]>(
        `/v1/conversations/${conversationId}/messages`,
        { before: pageParam, limit: PAGE_SIZE },
      );
      if (pageParam !== undefined || !conversationId) return items;
      // A refetch replaces the newest page wholesale. A message that is still on
      // its way to the server (a photograph being uploaded can take a minute on
      // 2G) is not in that answer, and must not vanish from under the sender
      // because something else caused a refetch.
      const pending = (
        qc.getQueryData<InfiniteData<Message[]>>(messagesQueryKey(conversationId))
          ?.pages.flat() ?? []
      ).filter(isPendingMessage);
      return pending.length > 0 ? [...pending, ...items] : items;
    },
    getNextPageParam: (lastPage) => {
      // A message that is still being sent is not part of the server's page, so
      // it must not make a short page look full.
      const real = (lastPage ?? []).filter((m) => !isPendingMessage(m));
      if (real.length < PAGE_SIZE) return undefined;
      // The cursor is the OLDEST message of the page. It used to be "index 0",
      // which is the oldest only until a live message is put at the front of
      // that same page — and then the next "older" request asked for everything
      // before the NEWEST message and drew most of the thread twice.
      return oldestCreatedAt(real);
    },
  });
}
