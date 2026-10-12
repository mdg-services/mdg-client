import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useMatch } from 'react-router-dom';

import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { Conversation, Message } from '@dk/shared/types';

/** Upsert a conversation into the list cache, keeping it sorted newest-first. */
function upsert(
  list: Conversation[] | undefined,
  conv: Conversation,
): Conversation[] | undefined {
  // If the list isn't loaded yet, leave it — the query's own fetch will include it.
  if (!list) return list;
  const exists = list.some((c) => c.id === conv.id);
  const next = exists
    ? list.map((c) => (c.id === conv.id ? conv : c))
    : [conv, ...list];
  return [...next].sort((a, b) =>
    (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
  );
}

/**
 * The number in the green pill after a live update.
 *
 * Only the dealer's own `GET /conversations/mine` carries `unreadCount` — it is
 * counted for the one member who asked. A socket payload goes to EVERY
 * participant of a group thread at once and so cannot carry one reader's number:
 * it arrives without it, and the last number this phone knew has to be kept
 * rather than dropped, or every incoming message would blank the pill.
 *
 * `bump` is "this update is one more message the dealer has not read" — set by
 * the caller only for a message from somebody else, in a thread that is not the
 * one on screen. A thread this phone has no entry for yet (the first message of
 * a brand-new chat) starts at 1. A thread it knows about but whose count it was
 * never told (a server that predates the field) is left without one, so the
 * list falls back to its plain unread dot instead of inventing a wrong number.
 */
function nextUnreadCount(
  prev: Conversation | undefined,
  incoming: Conversation,
  bump: boolean,
): number | undefined {
  if (incoming.unreadCount !== undefined) return incoming.unreadCount;
  const known = prev?.unreadCount;
  if (!bump) return known;
  if (known !== undefined) return known + 1;
  return prev ? undefined : 1;
}

/**
 * App-wide listener that keeps the dealer's conversation LIST (and its unread
 * counts) live for EVERY thread they participate in — not just the open one.
 * Mounted once in AppShell.
 *
 * Ownership split: the per-thread `useConversationSocket` owns message bodies +
 * receipts for the OPEN thread's message cache; this hook owns the list cache.
 * They write different caches, so both can handle the same `message:new` without
 * conflicting. This replaces the old pattern of writing a singleton
 * `['conversation','mine']` key, which would clobber across threads.
 */
export function useConversationsListSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const myId = useAuthStore((s) => s.user?.id);

  // Which thread is on screen right now. A message that lands in the thread the
  // dealer is reading is read the moment it arrives, so counting it would flash
  // a pill on a list nobody is looking at. Kept in a ref so that walking into
  // or out of a thread does not tear the socket listeners down and set them up
  // again. Exact match on purpose: `/chat/:id/media` and `/chat/:id/info` are
  // not reading the thread's messages.
  const openMatch = useMatch('/chat/:id');
  const openIdRef = React.useRef<string | undefined>(undefined);
  openIdRef.current = openMatch?.params.id;

  // Messages already counted. The server delivers `message:new` to a member's
  // conversation room AND their own room, so a phone in both gets it twice (the
  // thread's cache dedupes by id for the same reason); without this each new
  // message would add two to the pill.
  const countedRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const apply = (conv: Conversation, bump: boolean) => {
      qc.setQueryData<Conversation[]>(myConversationsKey, (old) => {
        if (!old) return old;
        const prev = old.find((c) => c.id === conv.id);
        const unreadCount = nextUnreadCount(prev, conv, bump);
        return upsert(old, unreadCount === undefined ? conv : { ...conv, unreadCount });
      });
    };

    const onNewMessage = (p: { message?: Message; conversation: Conversation }) => {
      const message = p.message;
      const fromSomeoneElse = !!message && message.senderId !== myId;
      const threadIsOpen = openIdRef.current === p.conversation.id;
      let bump = fromSomeoneElse && !threadIsOpen;
      if (bump && message?.id) {
        const counted = countedRef.current;
        if (counted.has(message.id)) bump = false;
        else {
          // A session only ever needs the recent ones; keep the set small.
          if (counted.size > 500) counted.clear();
          counted.add(message.id);
        }
      }
      apply(p.conversation, bump);
    };
    const onConvUpdated = (p: { conversation: Conversation }) => apply(p.conversation, false);

    // When *I* read a thread, the server clears me from unreadDealerUserIds but
    // only emits `read` (not conversation:updated), so the list badge would stay
    // lit. Mirror the clear into the list cache here. (Same socket, so the reader
    // receives their own `read` echo.)
    const onRead = (p: { conversationId: string; userId: string }) => {
      if (!myId || p.userId !== myId) return;
      qc.setQueryData<Conversation[]>(myConversationsKey, (old) =>
        old?.map((c) => {
          if (c.id !== p.conversationId) return c;
          const nextIds = (c.unreadDealerUserIds ?? []).filter((id) => id !== myId);
          return {
            ...c,
            unreadDealerUserIds: nextIds,
            // The reader clearing the last unread also clears the coarse flag.
            unreadByDealer: nextIds.length > 0 ? c.unreadByDealer : false,
            // The pill counts MY unread messages, and I have just read them.
            unreadCount: 0,
          };
        }),
      );
    };

    // After a reconnect the list may have missed updates — refetch it (the
    // server's own count replaces whatever this phone had been adding up).
    const offReconnect = onSocketReconnect(socket, () => {
      void qc.invalidateQueries({ queryKey: myConversationsKey });
    });

    socket.on('message:new', onNewMessage);
    socket.on('conversation:updated', onConvUpdated);
    socket.on('read', onRead);
    return () => {
      offReconnect();
      socket.off('message:new', onNewMessage);
      socket.off('conversation:updated', onConvUpdated);
      socket.off('read', onRead);
    };
  }, [token, myId, qc]);
}
