export type ConversationStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED';

export interface Conversation {
  id: string;
  dealerId: string;
  dealerName?: string;
  status: ConversationStatus;
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
  readBy: string[];
  createdAt: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}
