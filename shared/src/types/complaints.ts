/**
 * Maintenance complaints filed and followed on IndianOil's portals for the dealer
 * (ADR 0052). Four routes:
 *
 *  - `eicts`  IRAS ▸ eICTS — card machines (EDC/POS), paper rolls, card money, XTRAPOWER.
 *  - `eracts` IRAS ▸ eRACTS — retail automation (FCC, BOS, ATG/probes, UPS, DU in auto).
 *  - `du_stp` SDMS ▸ e-Mitra ▸ DU Complaints — dispenser mechanics (DU OEM vendor).
 *  - `efms`   SDMS ▸ e-Mitra ▸ EFMS — other facilities (tank, pipeline, high mast…).
 *
 * The portal's own words (a status, a vendor remark) are kept verbatim on the record
 * for the admin; the dealer only ever sees the stage they map to, in plain words.
 */
import type { SomeDealerWords } from './dealerLanguage';

export const COMPLAINTS_SERVICE_ID = 'maintenance-complaints';

export const COMPLAINT_ROUTES = ['eicts', 'eracts', 'du_stp', 'efms'] as const;
export type ComplaintRoute = (typeof COMPLAINT_ROUTES)[number];

/** `chat`: raised by a dealer through MDG. `portal`: found on the portal (system-raised or older). */
export const COMPLAINT_ORIGINS = ['chat', 'portal'] as const;
export type ComplaintOrigin = (typeof COMPLAINT_ORIGINS)[number];

/**
 * Where a complaint stands.
 *
 *  - `drafting`: MDG is still asking the dealer; `confirming`: the summary is shown.
 *  - `filing`: the dealer said yes; a run is filing it (`pressingAt` set at the click).
 *  - `filed` … `auto_closed`: the portal's status, mapped (ADR 0052 table).
 *  - `approved`: e-Mitra EFMS only — IndianOil approved the work order and no contractor has acted yet
 *    (approval is not an engineer: the two 1E rows approved in Oct 2025 and May 2026 had no visit).
 *  - `acknowledging`: the dealer answered fixed / not fixed; a run is telling the portal.
 *  - `cancelled`: the dealer left it before filing; `expired`: the yes ran out unfiled.
 *  - `not_filed`: the portal refused it or a check stopped the press (reason kept).
 *  - `unclear`: Submit was pressed and the answer was lost; settled by a later read or a person.
 *  - `duplicate`: not filed because the same complaint is already open (linked to it).
 *  - `unknown_status`: the portal shows a status MDG has no mapping for (team alerted).
 */
export const COMPLAINT_STAGES = [
  'drafting',
  'confirming',
  'filing',
  'filed',
  'approved',
  'assigned',
  'fixed_awaiting_ack',
  'acknowledging',
  'closed',
  'reopened',
  'rejected',
  'escalated',
  'auto_closed',
  'cancelled',
  'expired',
  'not_filed',
  'unclear',
  'duplicate',
  'unknown_status',
] as const;
export type ComplaintStage = (typeof COMPLAINT_STAGES)[number];

/** Stages after which nothing more happens on the portal. */
export const COMPLAINT_FINAL_STAGES: readonly ComplaintStage[] = [
  'closed',
  'auto_closed',
  'cancelled',
  'expired',
  'not_filed',
  'duplicate',
];

/** The events a dealer is told about, once each (a notice slot per event). */
export const COMPLAINT_EVENTS = [
  'question',
  'confirm',
  'filed',
  'duplicate',
  'not_filed',
  'assigned',
  'fixed_ask',
  'fixed_reminder',
  'ack_reason',
  'closed',
  'reopened',
  'rejected',
  'escalated',
  'auto_closed',
  'failed',
  /** "It has not moved for N days": the question with Remind / Tell the team / I'll wait (a filed complaint). */
  'nudge',
] as const;
export type ComplaintEvent = (typeof COMPLAINT_EVENTS)[number];

/**
 * The marker on a chat message that carries a complaint box. The app draws the live
 * box (questions, summary, steps, acknowledgement buttons) only on the message the
 * view names as `liveMessageId`; older marker messages show just their words.
 * The marker also keeps the message out of the WhatsApp backup.
 */
export interface MessageComplaint {
  complaintId: string;
  event: ComplaintEvent;
}

/** One button in a question. `label` in every dealer language. */
export interface ComplaintOption {
  id: string;
  label: SomeDealerWords;
  /** A second, smaller line (e.g. the machine's make and serial). */
  hint?: SomeDealerWords;
}

/** The one thing MDG is asking right now. */
export interface ComplaintQuestion {
  id: string;
  /** What it fills: route | tid | du | tank | fault | nozzles | product_dip | water_dip | sales_stopped | products | du_count | nozzle_count | vendor_mail_who | vendor_mail_sent | vendor_mail_date | ack_reason | existing_open (a complaint MDG filed is still open on the same machine) | nudge | reminder_who | reminder_sent (a filed complaint that is not moving; these three are shown under the step tracker). */
  field: string;
  prompt: SomeDealerWords;
  options: ComplaintOption[];
  /** When set, a free answer is accepted (typed in the box or in the chat); 'date' shows a day picker that stops at today. */
  input?: 'number' | 'text' | 'date' | null;
  /** Several options may be picked (products); answered with `optionIds`. */
  multi?: boolean;
  /** An option id that, when tapped, swaps in the full list. */
  moreOptionId?: string;
}

export type ComplaintStepKey = 'filed' | 'assigned' | 'fixed' | 'closed';

export interface ComplaintStep {
  key: ComplaintStepKey;
  label: SomeDealerWords;
  state: 'done' | 'current' | 'todo' | 'failed';
  /** ISO time the step was reached. */
  at?: string;
}

/** What the dealer's box shows. */
export type ComplaintScreen =
  | 'asking'
  | 'confirm'
  | 'filing'
  | 'tracking'
  | 'ack'
  | 'ack_reason'
  | 'acknowledging'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface ComplaintDealerView {
  id: string;
  route: ComplaintRoute;
  /** "Card machine", "Automation", "Dispenser", "Other facility". */
  routeLabel: SomeDealerWords;
  /** What is wrong, in plain words ("Card machine …775 not working"). */
  title: SomeDealerWords;
  /** The portal's complaint number, once filed. */
  number?: string;
  stage: ComplaintStage;
  screen: ComplaintScreen;
  question?: ComplaintQuestion;
  /** Rows of the summary (confirm screen and after). */
  summary?: Array<{ label: SomeDealerWords; value: SomeDealerWords }>;
  steps: ComplaintStep[];
  /** One line saying where it stands. */
  statusLine: SomeDealerWords;
  engineer?: { name?: string; phone?: string; etaHours?: number };
  canCancel: boolean;
  canCheckNow: boolean;
  /**
   * Card-money and account requests on the card-machine portal need an e-mail to the
   * card-machine company first. `who 'mdg'`: MDG sent it (no links). `who 'dealer'`: the box
   * shows the mail to copy, with a Gmail link and a mail-app link already filled in.
   */
  vendorMail?: ComplaintVendorMailView;
  /**
   * The reminder to the card-machine company that the dealer sends himself, shown (with the
   * "Sent?" question) under the step tracker of a filed complaint that is not moving.
   * Same shape as `vendorMail`; MDG's own reminders are never drawn as a card.
   */
  reminderMail?: ComplaintVendorMailView;
  /** The chat message that holds the live box. */
  liveMessageId?: string;
  filedAt?: string;
  updatedAt: string;
}

export interface ComplaintVendorMailView {
  who: 'mdg' | 'dealer';
  to: string;
  /** Who was copied (the dealer's own e-mail), when MDG sent it. */
  cc?: string;
  subject: string;
  body: string;
  /** What to attach, in plain words, only where it genuinely helps. */
  attachmentsHint?: SomeDealerWords;
  /** https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=… (who 'dealer' only). */
  gmailUrl: string;
  /** mailto:… with subject and body (who 'dealer' only). */
  mailtoUrl: string;
  /** ISO time MDG sent it. */
  sentAt?: string;
}

export interface ComplaintsMeView {
  complaints: ComplaintDealerView[];
}

/** One line of a complaint's history (admin). */
export interface ComplaintHistoryEntry {
  at: string;
  stage: ComplaintStage;
  /** The portal's status words, verbatim, when the entry came from a read. */
  portalStatus?: string;
  /** What happened, in plain English for the team. */
  note: string;
  by?: 'dealer' | 'robot' | 'admin' | 'portal';
}

/** What needs a person, if anything. */
export const COMPLAINT_ATTENTION = [
  'unclear_press',
  'unclear_ack',
  'unknown_status',
  'refused_unknown',
  'form_changed',
  'login_problem',
  'rejected',
  'ack_blocked',
  /** A complaint MDG filed has not moved for a week (or the owner asked for the team): nobody is on it. */
  'stalled',
] as const;
export type ComplaintAttention = (typeof COMPLAINT_ATTENTION)[number];

/** A complaint as the admin sees it. */
export interface ComplaintAdminRow {
  id: string;
  dealerId: string;
  dealerCode: string;
  dealerName: string;
  route: ComplaintRoute;
  origin: ComplaintOrigin;
  /** IndianOil's system raised it by itself (not the outlet). */
  systemRaised: boolean;
  number?: string;
  stage: ComplaintStage;
  /** The portal's status words, verbatim. */
  portalStatus?: string;
  /** Plain English: what is wrong. */
  title: string;
  /** The values filed (portal labels), e.g. { TID: '39141775', 'Issue Type': '…' }. */
  fields: Record<string, string>;
  remark?: string;
  /** Who raised it in the chat (name + role), for chat-origin complaints. */
  raisedBy?: string;
  conversationId?: string;
  engineer?: { name?: string; phone?: string; etaHours?: number };
  /** Vendor / IOCL remarks from the portal, verbatim. */
  portalRemarks?: Record<string, string>;
  attention?: ComplaintAttention;
  attentionDetail?: string;
  /** ISO time the "is it working now?" question was put to the dealer (set once per cycle). */
  ackAskedAt?: string;
  /** Can the team send the dealer the "is it fixed?" question (portal-origin, fixed_awaiting_ack). */
  canAskDealer: boolean;
  history: ComplaintHistoryEntry[];
  filedAt?: string;
  lastReadAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintsAdminList {
  rows: ComplaintAdminRow[];
  total: number;
  counts: { open: number; needsAck: number; attention: number; portalOnly: number };
}

/** The per-outlet admin pane. */
export interface ComplaintsDealerAdminView {
  dealerId: string;
  attached: boolean;
  /** Either of the two below (kept for older screens). */
  paused: boolean;
  /** The team paused Complaints for this outlet (the Complaints pause switch). */
  pausedByTeam: boolean;
  /** The Complaints service is attached and ACTIVE (not paused at the service level). */
  serviceActive: boolean;
  lastReadAt?: string;
  nextReadAt?: string;
  assets?: {
    readAt: string;
    tids: string[];
    dus: Array<{ label: string; make?: string; serial?: string; model?: string }>;
    tanks: Array<{ tankNo: number; product?: string }>;
  };
  rows: ComplaintAdminRow[];
}
