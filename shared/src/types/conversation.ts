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
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadByAdmin: boolean;
  unreadByDealer: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AttachmentKind = 'image' | 'file';

export interface Attachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: AttachmentKind;
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
  readBy: string[];
  createdAt: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}
