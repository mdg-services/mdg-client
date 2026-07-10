import type { Conversation, Message, MessageReaction } from './conversation';
import type { DealerRecord } from './record';

export interface ServerToClientEvents {
  'message:new': (payload: { message: Message; conversation: Conversation }) => void;
  /** A message's reaction set changed; payload carries the full authoritative array. */
  'message:reaction': (payload: {
    conversationId: string;
    messageId: string;
    reactions: MessageReaction[];
  }) => void;
  'conversation:updated': (payload: { conversation: Conversation }) => void;
  'record:new': (payload: { record: DealerRecord }) => void;
  typing: (payload: { conversationId: string; userId: string; userName: string }) => void;
  delivered: (payload: { conversationId: string; userId: string; messageIds: string[] }) => void;
  read: (payload: { conversationId: string; userId: string; messageIds: string[] }) => void;
}

export interface ClientToServerEvents {
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  typing: (conversationId: string) => void;
  delivered: (payload: { conversationId: string; messageIds: string[] }) => void;
  read: (payload: { conversationId: string; messageIds: string[] }) => void;
}
