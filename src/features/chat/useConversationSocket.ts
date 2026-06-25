import type { Conversation, Message } from '@dk/shared/types';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import * as React from 'react';

import { messagesQueryKey } from '@/hooks/api/useMessages';
import { getSocket } from '@/lib/socket';

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

    const join = () => socket.emit('conversation:join', conversationId);
    if (socket.connected) join();
    socket.on('connect', join);

    const onNewMessage = (payload: { message: Message; conversation: Conversation }) => {
      if (payload.message.conversationId !== conversationId) return;
      const key = messagesQueryKey(conversationId);
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
      qc.setQueryData<Conversation>(['conversation', 'mine'], payload.conversation);
      // The chat is open, so a message from the other party is read on arrival.
      if (payload.message.senderId !== currentUserId) {
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

    const onConvUpdated = (payload: { conversation: Conversation }) => {
      if (payload.conversation.id !== conversationId) return;
      qc.setQueryData<Conversation>(['conversation', 'mine'], payload.conversation);
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

    socket.on('message:new', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('conversation:updated', onConvUpdated);
    socket.on('delivered', onDelivered);
    socket.on('read', onRead);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('connect', join);
      socket.off('message:new', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('conversation:updated', onConvUpdated);
      socket.off('delivered', onDelivered);
      socket.off('read', onRead);
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
