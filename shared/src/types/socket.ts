import type { Conversation, Message, MessageReaction } from './conversation';
import type { DealerDocumentAskRow } from './documentAsk';
import type { WhatsAppChangedEvent, WhatsAppIncomingEvent } from './whatsappInbox';

export interface ServerToClientEvents {
  'message:new': (payload: { message: Message; conversation: Conversation }) => void;
  /** A message's reaction set changed; payload carries the full authoritative array. */
  'message:reaction': (payload: {
    conversationId: string;
    messageId: string;
    reactions: MessageReaction[];
  }) => void;
  /**
   * A voice note's transcript was saved (`Attachment.transcript`). The note was
   * already on screen, and a repeated `message:new` is ignored as a duplicate, so
   * this is how an open thread learns the words. Sent to the conversation's room
   * only (the dealer and any admin who has the thread open), like a reaction; a
   * thread that is not open reads the transcript with the message on its next load.
   */
  'message:transcript': (payload: {
    conversationId: string;
    messageId: string;
    /** Which attachment of the message: the voice note's storage key. */
    storageKey: string;
    transcript: string;
  }) => void;
  'conversation:updated': (payload: { conversation: Conversation }) => void;
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
  /**
   * The admin alert list changed: something was raised, cleared or hidden.
   *
   * Sent to every admin socket and carrying nothing, because what each admin
   * may see differs (server alerts are super-admin only) — the screen refetches
   * its own scoped list rather than trusting a count meant for someone else.
   */
  'alerts:changed': () => void;
  /**
   * An outlet's onboarding setup moved: services chosen, billing saved, a bill
   * sent or paid, a login saved, services started (types/outletSetup.ts).
   * Sent to that dealer's room (its setup cards and strip refetch
   * `GET /me/setup`) and to every admin socket (the Onboarding page refetches).
   * Carries only the outlet's id: each side reads its own scoped view.
   */
  'outletSetup:changed': (payload: { dealerId: string }) => void;
  /**
   * The watch-period review queue changed: a message was held, sent, dropped or
   * expired. Admin sockets only; the queue refetches its own list.
   */
  'heldMessages:changed': (payload: { dealerId: string }) => void;
  /**
   * A ticket was raised, merged into, opened for the first time, resolved or
   * reopened. Admin room only — a dealer learns of a change through
   * `conversation:updated`, whose `tickets` carries the dealer-safe view.
   */
  'tickets:changed': (payload: { ticketId: string; conversationId: string }) => void;
  /**
   * Something changed in these WhatsApp chats: a message in or out, a tick, a
   * name or a stage. SUPER-ADMIN sockets only — the payload names people by
   * their numbers, and the WhatsApp inbox is a super-admin page.
   */
  'whatsapp:changed': (payload: WhatsAppChangedEvent) => void;
  /**
   * Somebody wrote to one of our WhatsApp numbers. Super-admin sockets only.
   * Drives the toast, the sound and the desktop notification; the list itself
   * refreshes from `whatsapp:changed`.
   */
  'whatsapp:incoming': (payload: WhatsAppIncomingEvent) => void;
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
