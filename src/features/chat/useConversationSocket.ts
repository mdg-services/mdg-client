import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import * as React from 'react';

import { messagesQueryKey } from '@/hooks/api/useMessages';
import { reactionMutationsPending } from '@/hooks/api/useReactToMessage';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import type { Conversation, Message, MessageReaction } from '@dk/shared/types';

export interface TypingState {
  active: boolean;
  userName?: string;
}

export function useConversationSocket(
  conversationId: string | undefined,
  currentUserId: string | undefined,
) {
  const qc = useQueryClient();
  const [typing, setTyping] = React.useState<TypingState>({ active: false });
  const typingTimer = React.useRef<number | null>(null);

  // Merge a delivery/read receipt into the cached messages: append `userId` to
  // the given field (deliveredTo | readBy) for every message in `ids`.
  const applyReceipt = React.useCallback(
    (field: 'deliveredTo' | 'readBy', userId: string, ids: string[]) => {
      if (!conversationId || ids.length === 0) return;
      const idSet = new Set(ids);
      qc.setQueryData<InfiniteData<Message[]>>(
        messagesQueryKey(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) => {
                if (!idSet.has(m.id)) return m;
                const arr = m[field] ?? [];
                if (arr.includes(userId)) return m;
                return { ...m, [field]: [...arr, userId] };
              }),
            ),
          };
        },
      );
    },
    [conversationId, qc],
  );

  React.useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    if (!socket) return;

    // Join the room on every connect (including reconnects).
    const join = () => socket.emit('conversation:join', conversationId);
    if (socket.connected) join();
    socket.on('connect', join);

    // On a RE-connect (socket dropped and came back — common on flaky 2G), the
    // server does not replay history, so refetch the loaded messages to backfill
    // anything missed while we were offline. This is the safety net that lets us
    // keep refetchOnWindowFocus off in the WebView.
    const offReconnect = onSocketReconnect(socket, () => {
      // Skip while a send is in flight: a full refetch could momentarily drop the
      // just-sent optimistic bubble (it self-heals via the server echo, but this
      // avoids the flicker on the exact flaky link this backfill targets).
      if (qc.isMutating({ mutationKey: ['sendMessage'] }) > 0) return;
      void qc.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
    });

    const onNewMessage = (payload: { message: Message; conversation: Conversation }) => {
      if (payload.message.conversationId !== conversationId) return;
      const key = messagesQueryKey(conversationId);
      // The server fans a message to BOTH the conversation room and each
      // participant's user room, so a viewer receives it twice. Detect a repeat
      // delivery BEFORE the cache write so the read-ack below fires only once.
      const before = qc.getQueryData<InfiniteData<Message[]>>(key);
      const alreadyPresent =
        before?.pages.some((p) => p.some((m) => m.id === payload.message.id)) ?? false;
      qc.setQueryData<InfiniteData<Message[]>>(key, (old) => {
        if (!old) return { pages: [[payload.message]], pageParams: [undefined] };
        // Dedupe by real id across ALL pages (not just the first page).
        if (old.pages.some((p) => p.some((m) => m.id === payload.message.id))) {
          return old;
        }
        // If this is the sender's own echo, strip any optimistic temp-* placeholders
        // so we don't end up showing the message twice.
        const isOwnEcho = payload.message.senderId === currentUserId;
        const pages = old.pages.map((page) =>
          isOwnEcho ? page.filter((m) => !m.id.startsWith('temp-')) : page,
        );
        pages[0] = [payload.message, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      // The chat is open, so a message from the other party is read on arrival —
      // but only ack the first delivery (not the duplicate room echo).
      if (!alreadyPresent && payload.message.senderId !== currentUserId) {
        socket.emit('read', { conversationId, messageIds: [payload.message.id] });
      }
    };

    const onTyping = (payload: { conversationId: string; userId: string; userName: string }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.userId === currentUserId) return;
      setTyping({ active: true, userName: payload.userName });
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        setTyping({ active: false });
      }, 3000);
    };

    const onDelivered = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      applyReceipt('deliveredTo', payload.userId, payload.messageIds);
    };

    const onRead = (payload: {
      conversationId: string;
      userId: string;
      messageIds: string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      // Reading implies delivery — advance both so ticks settle on blue.
      applyReceipt('deliveredTo', payload.userId, payload.messageIds);
      applyReceipt('readBy', payload.userId, payload.messageIds);
    };

    // A message's reaction set changed. The payload carries the FULL
    // authoritative array, so replacing wholesale is idempotent — safe against
    // duplicate deliveries and it reconciles any optimistic local toggle.
    const onReaction = (payload: {
      conversationId: string;
      messageId: string;
      reactions: MessageReaction[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      // Skip while one of OUR toggles for this message is still in flight —
      // this echo may be the older request's snapshot, and applying it would
      // transiently resurrect state the newer optimistic toggle changed. The
      // last mutation's onSuccess reconciles to server truth.
      if (reactionMutationsPending(qc, payload.messageId) > 0) return;
      qc.setQueryData<InfiniteData<Message[]>>(
        messagesQueryKey(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) =>
                m.id === payload.messageId
                  ? { ...m, reactions: payload.reactions }
                  : m,
              ),
            ),
          };
        },
      );
    };

    socket.on('message:new', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('delivered', onDelivered);
    socket.on('read', onRead);
    socket.on('message:reaction', onReaction);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('connect', join);
      offReconnect();
      socket.off('message:new', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('delivered', onDelivered);
      socket.off('read', onRead);
      socket.off('message:reaction', onReaction);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
    };
  }, [conversationId, currentUserId, qc, applyReceipt]);

  const emitTyping = React.useCallback(() => {
    if (!conversationId) return;
    const socket = getSocket();
    socket?.emit('typing', conversationId);
  }, [conversationId]);

  // Mark the given messages read (called by the chat screen for messages from
  // the other party loaded over HTTP, which never came through message:new).
  const markRead = React.useCallback(
    (messageIds: string[]) => {
      if (!conversationId || messageIds.length === 0) return;
      const socket = getSocket();
      socket?.emit('read', { conversationId, messageIds });
    },
    [conversationId],
  );

  return { typing, emitTyping, markRead };
}
