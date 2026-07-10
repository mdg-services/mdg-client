import * as React from 'react';

import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { Conversation, Message } from '@dk/shared/types';

/**
 * App-level delivery acknowledgement. The member's socket is always joined to
 * its own user room, so the server pushes every new message here even when the
 * chat screen isn't open. We ack delivery (✓✓) for messages from the other
 * party so the sender's ticks advance without the recipient opening the thread.
 * Reading (blue ✓✓) is handled separately by the chat screen.
 */
export function useDeliveryAck() {
  const userId = useAuthStore((s) => s.user?.id);

  React.useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    if (!socket) return;

    const onMessage = (payload: { message: Message; conversation: Conversation }) => {
      const { message } = payload;
      if (message.senderId === userId) return;
      if (message.id.startsWith('temp-')) return;
      socket.emit('delivered', {
        conversationId: message.conversationId,
        messageIds: [message.id],
      });
    };

    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
    };
  }, [userId]);
}
