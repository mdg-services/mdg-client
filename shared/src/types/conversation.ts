import type { UserRole } from './user';

export type ConversationStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED';

/**
 * What kind of thread a conversation is:
 *  - 'support' : a dealer member's private thread with the MDG admin support
 *                pool — the classic 1:1 chat; `userId` is that member.
 *  - 'manager' : the manager's group thread — the manager (`userId`, a
 *                `dealer-staff`) plus EVERY owner of the dealer, together with the
 *                admin pool. Owners join as participants, not as the primary member.
 */
export type ConversationKind = 'support' | 'manager';

/**
 * A dealer-side participant of a conversation, decorated for display. The MDG
 * admin support pool is implicit and never appears in this list.
 */
export interface ConversationParticipant {
  userId: string;
  name?: string;
  role?: UserRole;
  title?: string;
}

/** Ticket priority for the admin/CRM side. Hidden from dealers. */
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

/** Coarse ticket category for triage/reporting. Hidden from dealers. */
export type TicketCategory =
  | 'general'
  | 'sales'
  | 'compliance'
  | 'billing'
  | 'technical'
  | 'onboarding';
export const TICKET_CATEGORIES: TicketCategory[] = [
  'general',
  'sales',
  'compliance',
  'billing',
  'technical',
  'onboarding',
];

/**
 * Reply-SLA thresholds, in minutes since the client's oldest unanswered message.
 * A waiting client turns the ticket yellow at WARN and red at URGENT so the whole
 * support team notices. (The separate 20-minute auto-unassign is server-side.)
 */
export const TICKET_FLAG_WARN_MINUTES = 90;
export const TICKET_FLAG_URGENT_MINUTES = 180;

export type TicketFlagLevel = 'none' | 'warn' | 'urgent';

/**
 * Derive the escalation level for a waiting ticket from `awaitingReplySince`.
 * `nowMs` is the current epoch (pass `Date.now()`) so the level advances live
 * as the client keeps waiting, without needing a server round-trip.
 */
export function ticketFlagLevel(
  awaitingReplySince: string | null | undefined,
  nowMs: number,
): TicketFlagLevel {
  if (!awaitingReplySince) return 'none';
  const since = new Date(awaitingReplySince).getTime();
  if (Number.isNaN(since)) return 'none';
  const mins = (nowMs - since) / 60_000;
  if (mins >= TICKET_FLAG_URGENT_MINUTES) return 'urgent';
  if (mins >= TICKET_FLAG_WARN_MINUTES) return 'warn';
  return 'none';
}

export interface Conversation {
  id: string;
  dealerId: string;
  dealerName?: string;
  /**
   * The PRIMARY member (User) this thread belongs to — the owner for a 'support'
   * thread, the manager for a 'manager' thread. Exactly one per thread (a unique
   * index enforces it); additional dealer participants live in `participantUserIds`.
   */
  userId: string;
  /** Primary member display name, populated by the API. */
  memberName?: string;
  /** Primary member role (dealer-owner / dealer-staff), populated by the API. */
  memberRole?: UserRole;
  /** Primary member display title (e.g. "Owner", "Manager"), populated by the API. */
  memberTitle?: string;
  /** Thread kind — a 1:1 support thread or the manager's group thread. Defaults 'support'. */
  kind?: ConversationKind;
  /**
   * Authoritative set of dealer-side participant user ids, INCLUDING the primary
   * `userId`. A 'support' thread has just `[userId]`; a 'manager' thread has
   * `[managerId, ...ownerIds]`. The admin pool is implicit and not listed. Backs
   * "conversations I'm a participant of" and realtime fan-out to every member.
   */
  participantUserIds?: string[];
  /** Decorated participant list (name/role/title), populated by the API for display. */
  participants?: ConversationParticipant[];
  status: ConversationStatus;
  /** Admin-only triage fields; never surfaced to dealers. */
  priority?: TicketPriority;
  category?: TicketCategory;
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  /**
   * ISO timestamp of the client's oldest still-unanswered message, or null when
   * the client isn't waiting on a reply (last message was the support team's, or
   * the thread is resolved). Drives the reply-SLA flag colour (`ticketFlagLevel`)
   * and the server-side 20-minute auto-unassign sweep.
   */
  awaitingReplySince?: string | null;
  /**
   * True when an ASSIGNED ticket was auto-returned to the unassigned pool because
   * the assigned admin left the client waiting past the auto-unassign SLA.
   * Cleared on the next pickup, reply, or resolve.
   */
  flagged?: boolean;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadByAdmin: boolean;
  /** Coarse "any dealer participant has unread" flag (admin-side display + legacy). */
  unreadByDealer: boolean;
  /**
   * Which dealer participants currently have unread messages. Per-participant so a
   * group thread shows unread for the manager but not an owner who's caught up.
   * The client computes its own badge from whether this includes the viewer.
   */
  unreadDealerUserIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export type AttachmentKind = 'image' | 'file' | 'audio';

/**
 * The fixed quick-reaction set offered by every chat UI and accepted by the
 * API (server validates against this list). One reaction per user per message.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type QuickReaction = (typeof QUICK_REACTIONS)[number];

/** One user's emoji reaction to a message. */
export interface MessageReaction {
  userId: string;
  /** Display name, decorated by the API at read time. */
  userName?: string;
  /** Typed as string (not QuickReaction) so future emoji don't break old clients. */
  emoji: string;
  createdAt: string;
}

/**
 * Denormalized snapshot of the message a reply quotes, embedded on the reply
 * at send time (server-built) so the quote renders without a second fetch and
 * survives the original paging out.
 */
export interface MessageReplyContext {
  messageId: string;
  senderId: string;
  senderName?: string;
  /** Original body, truncated server-side to REPLY_SNIPPET_MAX chars. */
  body?: string;
  /** Kind of the original's first attachment, so the quote can show an icon. */
  attachmentKind?: AttachmentKind;
  /** Filename of the original's first attachment (file quotes). */
  attachmentName?: string;
  /** Voice-note length of the original, for a "0:42" quote label. */
  durationMs?: number;
  /** Storage key of the original's first image, for the quote thumbnail. */
  imageStorageKey?: string;
  /** Signed thumbnail URL, populated by the API at read time. */
  imageUrl?: string;
  /** True when the original was a record card. */
  card?: boolean;
  /** Card title when the original was a record card. */
  cardTitle?: string;
}

/** Tabs of the per-conversation media gallery. */
export type ConversationMediaTab = 'media' | 'docs' | 'links';
export const CONVERSATION_MEDIA_TABS: ConversationMediaTab[] = ['media', 'docs', 'links'];

/**
 * One gallery item: an attachment (media/docs tabs) or the links extracted
 * from one message's body (links tab).
 */
export interface ConversationMediaItem {
  messageId: string;
  senderId: string;
  senderName?: string;
  createdAt: string;
  /** Present for 'media' and 'docs' items. */
  attachment?: Attachment;
  /** Present for 'links' items: URLs extracted from the message body. */
  urls?: string[];
  /** Short body excerpt giving the link some context. */
  bodySnippet?: string;
}

export interface Attachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: AttachmentKind;
  /**
   * Length of the clip in milliseconds. Only set for `audio` attachments
   * (voice notes) so the UI can show the duration before playback.
   */
  durationMs?: number;
  /** Signed download URL, populated by the API when returning messages. */
  url?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: 'admin' | 'dealer-owner' | 'dealer-staff';
  senderName?: string;
  body?: string;
  attachments: Attachment[];
  /** When present, this message renders as a rich record card in the chat. */
  card?: import('./record').RecordCard;
  /** Distinguishes system/automated messages (e.g. "Your DSR is ready"). */
  system?: boolean;
  /** User ids that have received the message on a device (drives the ✓✓ "delivered" tick). */
  deliveredTo?: string[];
  /** User ids that have read the message (drives the blue ✓✓ "seen" tick). Includes the sender. */
  readBy: string[];
  /** Emoji reactions; at most one per user (server-enforced). */
  reactions?: MessageReaction[];
  /** Set when this message replies to (quotes) another message in the thread. */
  replyTo?: MessageReplyContext;
  createdAt: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}
