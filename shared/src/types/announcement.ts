/**
 * Announcements: one message from MDG to many outlets, drawn in the chat as a
 * card that stands out from the reports around it (ADR 0039).
 *
 * An admin writes it once on the Announcements page, picks who gets it (every
 * outlet, the outlets that have one service, or a list of codes) and which side
 * of the outlet reads it (owners, managers, both). The server posts one copy per
 * chat, exactly as a Share does, and keeps a record of who it reached.
 *
 * The words are written ONCE and shown to everyone as written: they are
 * Hinglish on purpose, so there is no Hindi/English pair like a report has.
 * A line may carry `*bold*` (WhatsApp's own marks); nothing else is formatting.
 */
import type { ShareAudience } from './share';

/** The colour and label of the card. `new` = something MDG now does, `important` = act on it. */
export const ANNOUNCEMENT_TONES = ['new', 'notice', 'important'] as const;
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];

/** What the card's top strip says, in the dealer's own mix of Hindi and English. */
export const ANNOUNCEMENT_TONE_LABELS: Record<AnnouncementTone, string> = {
  new: 'Nayi suvidha',
  notice: 'Soochna',
  important: 'Zaroori soochna',
};

/** What an announcement message carries beside its body: the title and the card's tone. */
export interface MessageAnnouncement {
  title: string;
  tone: AnnouncementTone;
}

/** Longest title, body and phone-lock line an admin may write. */
export const ANNOUNCEMENT_LIMITS = { title: 90, body: 1800, pushText: 140 } as const;

export type AnnouncementTarget =
  /** Every outlet that is not archived. */
  | { kind: 'all' }
  /** Every outlet that has this service attached and running (not paused). */
  | { kind: 'service'; serviceId: string }
  /** Exactly these outlets, by code (`15E`). */
  | { kind: 'dealers'; codes: string[] };

/** One outlet in the recipient list the admin sees before pressing Send. */
export interface AnnouncementRecipientRow {
  dealerId: string;
  code: string;
  /** How many chats the send would post into at this outlet, by side. */
  reach: { owners: number; managers: number };
  /** Set when nothing can be posted at this outlet; the reason, in words. */
  cannotSend?: string;
  /** Set when it can be posted but the admin should know something first. */
  warning?: string;
}

export interface AnnouncementPreview {
  recipients: AnnouncementRecipientRow[];
  /** Outlets that would get a message. */
  willSend: number;
  /** Outlets left out, and why (each row's `cannotSend`). */
  willSkip: number;
}

export type AnnouncementDeliveryState = 'posted' | 'skipped' | 'failed';

/** What happened at one outlet. */
export interface AnnouncementDelivery {
  dealerId: string;
  code: string;
  state: AnnouncementDeliveryState;
  /** Chats posted into (0 unless `posted`). */
  copies: number;
  /** Why it was skipped or failed. */
  reason?: string;
}

export type AnnouncementStatus = 'sending' | 'sent';

export interface AnnouncementCounts {
  outlets: number;
  posted: number;
  skipped: number;
  failed: number;
}

/** A sent announcement, as the admin's history shows it. */
export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  tone: AnnouncementTone;
  /** The line a phone shows on its lock screen. Empty means the title is used. */
  pushText: string;
  audience: ShareAudience;
  target: AnnouncementTarget;
  status: AnnouncementStatus;
  createdAt: string;
  finishedAt: string | null;
  createdBy: { id: string; name: string };
  counts: AnnouncementCounts;
  /** Absent in the list (kept small); present on the detail. */
  deliveries?: AnnouncementDelivery[];
}

/** What the Announcements page needs to build its target pickers. */
export interface AnnouncementOptions {
  services: Array<{ serviceId: string; label: string; attached: number }>;
}
