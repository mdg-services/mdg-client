import type { Attachment, ReportKind, ReportStatus, Message } from './conversation';
import type { ReportData } from './reportData';

/**
 * The Today page's feed (ADR 0055): `GET /v1/me/today-feed`. Built from the chats
 * the viewer belongs to, so who may see what follows chat membership. Every text is
 * already in the viewer's language. It never carries `ai`, `system`, `bodyLang` or a
 * sender's name, and nothing from a bill (no amount, no pay link).
 */

/** The open boxes the page lists under "Your work". */
export type TodayTaskKind =
  | 'ask'
  | 'sign_letter'
  | 'portal_login'
  | 'wemmis_login'
  | 'setup'
  | 'du_otp'
  | 'mock_drill'
  | 'declarations'
  | 'complaint'
  | 'work_permit'
  | 'outlet_details'
  | 'fuel_confirm'
  | 'password_pick';

/**
 * What the button on a Your-work card does (ADR 0056). A photo ask can be answered from
 * Today itself: the app picks a photo and sends it as the answer to `askRef`
 * (`doc:<id>`, `reg:<day>`, `kv:<id>`), exactly as the chat's "Send photo" does, and the
 * card turns into "Sent". Every other box opens the chat at the box.
 */
export type TodayTaskAction =
  | { type: 'photo'; askRef: string; acceptsFile: boolean }
  | { type: 'open_chat' };

/** One open task. It links to the newest box message of its kind, which stays in the chat. */
export interface TodayTask {
  id: string;
  kind: TodayTaskKind;
  title: string;
  subtitle?: string;
  /** ISO time the box was posted (the newest copy). */
  since: string;
  /** True when the task has been waiting longer than it should. */
  late?: boolean;
  conversationId: string;
  messageId: string;
  /** What the card's button does. Absent on an older server: read it as `open_chat`. */
  action?: TodayTaskAction;
}

/** One report row: the newest of its kind (and key) in the last seven days. */
export interface TodayReport {
  id: string;
  kind: ReportKind;
  status: ReportStatus;
  /** The business day the card is about (YYYY-MM-DD). */
  day?: string;
  /** ISO time the message was sent. */
  sentAt: string;
  /** The message's words, in the viewer's language. */
  headline: string;
  /** The card pictures in the viewer's language, signed; re-signed through the message route. */
  attachments: Attachment[];
  conversationId: string;
  messageId: string;
  /** A tanker card, drawn from the stored JSON as in the chat. */
  fuelCard?: Message['fuelCard'];
  /**
   * The report's snapshot (ADR 0056), when the message carries one. Never carries an
   * owner-only block for a manager. Absent on a message sent before snapshots existed.
   */
  data?: ReportData;
}

/**
 * One report opened in the overlay: `GET /v1/me/reports/:messageId` (ADR 0056). The
 * overlay draws from `data`; an old message has none and `attachments` (its stored
 * pictures, signed in the viewer's language) are what the old picture viewer shows.
 */
export interface ReportDetail extends TodayReport {
  /**
   * The photos the snapshot points at (a washroom filing's two photos, a mock drill's two),
   * each signed for this viewer with the same signer and lifetime as a chat attachment.
   * Absent when the snapshot holds no photo. A key that could not be signed is left out.
   */
  photos?: Array<{ key: string; url: string }>;
  /**
   * What the server knows now that the frozen snapshot cannot say. Every field is
   * optional and absent means "nothing to say".
   */
  live: {
    /** A newer message of the same kind and key in the viewer's chats (the "newer report" banner). */
    newerMessageId?: string;
    newerConversationId?: string;
    /** The team removed the message after the viewer was sent here (the route answers 410 instead; kept for a cached copy). */
    deleted?: boolean;
    /** A DSR sent again after a correction, or one the system marked stale. */
    corrected?: boolean;
    /** The viewer is a manager and the kind is the owner's alone. The route answers 404 instead; kept for the app's own state. */
    ownerOnlyBlocked?: boolean;
  };
}

/** One page of the 30-day report history: `GET /v1/me/reports` (ADR 0056), newest first. */
export interface ReportHistoryPage {
  items: TodayReport[];
  /** Pass back as `cursor` for the next page; absent on the last page. */
  nextCursor?: string;
}

export interface TodayFeed {
  /** Today's business day in India (YYYY-MM-DD). */
  day: string;
  role: 'owner' | 'manager';
  tasks: TodayTask[];
  reports: TodayReport[];
  /**
   * What MDG finished for the dealer today: receipts of today's business day. A report
   * listed here is NOT repeated in `reports`; "See it on Today" looks in both by `messageId`.
   */
  done: TodayReport[];
}
