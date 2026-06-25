import type { Conversation, Message } from './conversation';
import type { DealerRecord } from './record';

export interface ServerToClientEvents {
  'message:new': (payload: { message: Message; conversation: Conversation }) => void;
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
