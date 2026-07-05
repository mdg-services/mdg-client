import type { UserRole } from './user';

export type ConversationStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED';

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
  /** The organisation member (User) this private thread belongs to. */
  userId: string;
  /** Member display name, populated by the API. */
  memberName?: string;
  /** Member role (dealer-owner / dealer-staff), populated by the API. */
  memberRole?: UserRole;
  /** Member display title (e.g. "Owner", "Manager"), populated by the API. */
  memberTitle?: string;
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
  unreadByDealer: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AttachmentKind = 'image' | 'file' | 'audio';

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
  createdAt: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}
