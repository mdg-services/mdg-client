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

    socket.on('message:new', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('conversation:updated', onConvUpdated);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('connect', join);
      socket.off('message:new', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('conversation:updated', onConvUpdated);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
    };
  }, [conversationId, currentUserId, qc]);

  const emitTyping = React.useCallback(() => {
    if (!conversationId) return;
    const socket = getSocket();
    socket?.emit('typing', conversationId);
  }, [conversationId]);

  return { typing, emitTyping };
}
