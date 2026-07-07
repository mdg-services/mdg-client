import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { Conversation } from '@dk/shared/types';

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
 * App-wide listener that keeps the dealer's conversation LIST (and its unread
 * badges) live for EVERY thread they participate in — not just the open one.
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

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const apply = (conv: Conversation) => {
      qc.setQueryData<Conversation[]>(myConversationsKey, (old) => upsert(old, conv));
    };
    const onNewMessage = (p: { conversation: Conversation }) => apply(p.conversation);
    const onConvUpdated = (p: { conversation: Conversation }) => apply(p.conversation);

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
          };
        }),
      );
    };

    // After a reconnect the list may have missed updates — refetch it.
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
