import type { Conversation, Message, MessageReaction } from './conversation';
import type { DealerDocumentAskRow } from './documentAsk';
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
  /**
   * A paper MDG needs from this dealer was asked for, nudged, or settled.
   *
   * Sent to the DEALER'S room, carrying the whole row rather than an id, so an
   * open screen redraws without a round trip — an ask has to reach the forecourt
   * in minutes, and a phone with the app open should not have to wait for a
   * pull-to-refresh to learn that MDG needs today's register page.
   *
   * The push notification is the other half and is NOT a substitute: push is for
   * a phone in a pocket, this is for a phone already in a hand.
   */
  'document-ask:updated': (payload: { row: DealerDocumentAskRow }) => void;
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
