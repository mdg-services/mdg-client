import type { ConversationAiState, MessageAiMeta } from './aiFirstLine';
import type { MessageAsk } from './chatAsk';
import type { TicketDealerView } from './ticket';
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
  /**
   * The dealer's code, for the admin inbox's thread list. Populated only for
   * admin callers: a dealer already knows which outlet they are, and this rides
   * on `/conversations/mine` and every socket fan-out.
   */
  dealerCode?: string;
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
  /**
   * How many messages in this thread the VIEWER has not read yet — the number
   * in the green pill on the dealer's chat list.
   *
   * Set only on the dealer's own list (`GET /conversations/mine`), counted for
   * the member who asked. Absent everywhere else, and in particular on the
   * socket's `conversation:updated`, which goes to every participant of a group
   * thread at once and so cannot carry one reader's count. A client keeps the
   * last number it knew when a payload arrives without one.
   */
  unreadCount?: number;
  /**
   * Where this thread stands with the AI first line. Absent on every thread the
   * machine has never touched, which is most of them.
   *
   * An optional block rather than a fourth `ConversationStatus` — see
   * `ConversationAiState` for the four places a fifth status would have made an
   * AI-handled thread disappear from the inbox while a dealer waited on it.
   */
  ai?: ConversationAiState;
  /**
   * Tickets on this thread: every OPEN one, plus any resolved in the last
   * seven days. The dealer's bubble reads this to show "sent to MDG / MDG is
   * looking / closed" under the message that raised it. Dealer-safe by type —
   * state and times only.
   */
  tickets?: TicketDealerView[];
  /** Open tickets on this thread. Admin inbox only. */
  openTicketCount?: number;
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
}

/**
 * One hit from searching the text of a thread
 * (`GET /conversations/:id/messages/search?q=`), newest first.
 *
 * Only the words of a message are searched — the body, never a filename or a
 * picture — the same as WhatsApp's search inside a chat.
 */
export interface MessageSearchHit {
  messageId: string;
  senderId: string;
  createdAt: string;
  /** The body around the first match, trimmed to about 140 characters. */
  snippet: string;
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
  /**
   * The message's words: on the links tab a short excerpt giving the link
   * some context; on the media and docs tabs the caption sent with the file.
   */
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
  /**
   * Posted by MDG's machinery rather than typed by a person — a shared report,
   * a daily Kavach line, a "Resolved" notice. The dealer app draws it exactly
   * like any other message from MDG (a WhatsApp image or text bubble); the
   * admin inbox still sets it apart. The AI's briefing labels it a notice.
   */
  system?: boolean;
  /** User ids that have received the message on a device (drives the ✓✓ "delivered" tick). */
  deliveredTo?: string[];
  /** User ids that have read the message (drives the blue ✓✓ "seen" tick). Includes the sender. */
  readBy: string[];
  /**
   * Set on an MDG message that ASKS the dealer for something (ADR 0019): the
   * dealer's app draws a "Send photo" button on it, and the answer goes back as
   * a reply naming {@link MessageAsk.ref}. An app that predates the field shows
   * the message's words and nothing more.
   */
  ask?: MessageAsk;
  /**
   * Set on a DEALER's message that answered one of those requests — the
   * request's ref (`doc:…`, `reg:…`, `kv:…`). It is what lets the admin inbox
   * offer "Mark received" for the right request without guessing.
   */
  answersAsk?: string;
  /** Emoji reactions; at most one per user (server-enforced). */
  reactions?: MessageReaction[];
  /** Set when this message replies to (quotes) another message in the thread. */
  replyTo?: MessageReplyContext;
  /**
   * Set only on a message the AI first line posted. Its presence is the ONLY
   * thing that distinguishes one: the sender is the existing "MDG System" admin
   * user and `senderRole` is `'admin'`, deliberately: an `'ai'` role would be a
   * fourth sender kind every reader of `senderRole` (the admin inbox's side of
   * the thread, the SLA clock, the first line's own "did a person speak" check)
   * would have to learn. A client that predates this field ignores the unknown
   * key and renders an ordinary Support bubble.
   */
  ai?: MessageAiMeta;
  createdAt: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}
