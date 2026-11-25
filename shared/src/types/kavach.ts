import type { Attachment } from './conversation';

/**
 * Dealer Kavach v2 (ADR 0057).
 *
 * One checklist every outlet shares (admins edit it), each outlet's own
 * differences, and a CHECK per point per outlet per period. A point is proven
 * one of three ways — a photo the outlet sends, a sheet MDG makes that the
 * outlet fills and photographs, or data MDG already pulls — and an MDG admin
 * (or the data) decides. The dealer never marks a point done.
 */

/* ───────────────────────────── Enums ───────────────────────────── */

/** How a point is proven. */
export const KAVACH_HOWS = ['photo', 'sheet', 'data'] as const;
export type KavachHow = (typeof KAVACH_HOWS)[number];

/** Who at the outlet sends the photo. */
export const KAVACH_UPLOADERS = ['manager', 'owner', 'either'] as const;
export type KavachUploader = (typeof KAVACH_UPLOADERS)[number];

/** Where a `data` point is read from. */
export const KAVACH_SOURCES = [
  'dsr-variation-ok',
  'density-register',
  'licence-dto',
  'licence-wm',
  'licence-peso',
  'mock-drill-filed',
  'safety-declaration',
] as const;
export type KavachSourceId = (typeof KAVACH_SOURCES)[number];

/** A sheet MDG makes for the outlet (an A4 PDF). */
export const KAVACH_SHEETS = ['dsr-book', 'toilet-inspection', 'toilet-display', 'emergency-numbers'] as const;
export type KavachSheetId = (typeof KAVACH_SHEETS)[number];

/** The data an admin sees beside a photo. */
export const KAVACH_PANELS = ['dsr', 'stock', 'density', 'credit-dod', 'papers', 'staff'] as const;
export type KavachPanelId = (typeof KAVACH_PANELS)[number];

/** Display grouping, in this order. */
export const KAVACH_GROUPS = ['daily', 'cleanliness', 'safety', 'licences', 'displays', 'sdms', 'equipment'] as const;
export type KavachGroup = (typeof KAVACH_GROUPS)[number];

/** The life of one check (ADR 0057 §3). */
export const KAVACH_CHECK_STATES = ['todo', 'sent', 'sent_back', 'done', 'missed', 'excused'] as const;
export type KavachCheckState = (typeof KAVACH_CHECK_STATES)[number];

/** The reason chips an admin picks when asking again. `other` carries free text. */
export const KAVACH_SEND_BACK_REASONS = ['not_clear', 'wrong_page', 'numbers_differ', 'not_updated', 'other'] as const;
export type KavachSendBackReason = (typeof KAVACH_SEND_BACK_REASONS)[number];

/** Codes of an outlet's own points start with this. */
export const KAVACH_OWN_CODE_PREFIX = 'own-';

/* ───────────────────────────── The checklist ───────────────────────────── */

/** One point of the checklist, as resolved for an outlet (global ⊕ outlet overrides). */
export interface KavachTaskDef {
  code: string;
  srNo: number;
  titleEn: string;
  titleHi: string;
  /** What to do / what the photo must show. The admin sees the same lines as "What to check". */
  howToEn: string;
  howToHi: string;
  points: number;
  /** Validity in days. `null` = when it happens (no clock, not in the %). */
  everyDays: number | null;
  /** 'HH:MM' IST. Daily points only: late after this time. */
  dueTime: string | null;
  how: KavachHow;
  uploader: KavachUploader;
  source: KavachSourceId | null;
  sheet: KavachSheetId | null;
  panels: KavachPanelId[];
  group: KavachGroup;
  /** IOCL-portal (SDMS) work: hidden for outlets of other oil companies. */
  iocOnly: boolean;
  /** A PDF is accepted as well as a photo. */
  acceptsFile: boolean;
  active: boolean;
  sort: number;
  /** True for an outlet's own point (code starts with `own-`). */
  own?: boolean;
  /** True when the outlet changed something about this point. */
  overridden?: boolean;
}

/** The fields an outlet may override on a global point. */
export type KavachTaskOverride = { code: string } & Partial<
  Pick<
    KavachTaskDef,
    | 'points'
    | 'everyDays'
    | 'dueTime'
    | 'how'
    | 'uploader'
    | 'source'
    | 'sheet'
    | 'panels'
    | 'howToEn'
    | 'howToHi'
    | 'acceptsFile'
  >
>;

/** A global point as the admin editor sees it (with audit stamps). */
export interface KavachTaskRow extends KavachTaskDef {
  updatedAt: string | null;
  updatedByName: string | null;
  /** How many outlets hide this point / override it. */
  hiddenAt: number;
  overriddenAt: number;
}

/* ───────────────────────────── Score ───────────────────────────── */

export interface KavachCounts {
  done: number;
  sent: number;
  todo: number;
  late: number;
  sentBack: number;
}

export interface KavachSummary {
  /** 0–100, whole number. */
  pct: number;
  donePoints: number;
  totalPoints: number;
  counts: KavachCounts;
  computedAt: string;
}

/* ───────────────────────────── Checks ───────────────────────────── */

export interface KavachPerson {
  name: string;
  /** 'dealer-owner' | 'dealer-staff' | 'admin' | 'data' */
  role: string;
}

export interface KavachFile extends Attachment {
  /** Signed, inline, short-lived. Present on reads. */
  url?: string;
}

export interface KavachSubmission {
  files: KavachFile[];
  note: string | null;
  at: string;
  by: KavachPerson;
}

export interface KavachSendBack {
  at: string;
  reason: KavachSendBackReason;
  /** Free text (always set for `other`; optional otherwise). */
  note: string | null;
  byName: string;
}

export interface KavachOwnerReport {
  at: string;
  note: string;
  withPhoto: boolean;
  byName: string;
}

export interface KavachDataResult {
  /** `ok` proved; `not_ok` our data says it is not done; `unknown` cannot tell yet. */
  verdict: 'ok' | 'not_ok' | 'unknown';
  /** Plain words for an admin ("DSR of 24 Nov: all variations within limit"). */
  summary: string;
  /** Plain words for the dealer, both languages. */
  dealerEn: string;
  dealerHi: string;
  at: string;
}

export interface KavachHistoryEntry {
  at: string;
  /** 'opened' | 'sent' | 'approved' | 'sent_back' | 'told_owner' | 'excused' | 'marked_done' | 'marked_not_done' | 'data' | 'missed' */
  what: string;
  byName: string | null;
  note: string | null;
}

/** One check as the admin sees it in a list. */
export interface KavachCheckRow {
  id: string;
  dealerId: string;
  dealerCode: string;
  dealerName: string;
  code: string;
  title: string;
  periodKey: string;
  /** Plain period words: "25 Nov", "Nov 2026", "2026–27". */
  periodLabel: string;
  state: KavachCheckState;
  late: boolean;
  dueAt: string | null;
  submittedAt: string | null;
  submittedBy: KavachPerson | null;
  /** First file only, signed. */
  thumbUrl: string | null;
  fileCount: number;
  sendBackCount: number;
  how: KavachHow;
}

/** A generic data panel the admin draws beside a photo (ADR 0057 §7). */
export interface KavachPanel {
  id: KavachPanelId;
  title: string;
  subtitle: string | null;
  rows: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }[];
  table: { columns: string[]; rows: string[][] } | null;
  photo: { url: string; caption: string } | null;
  /** Set when there is nothing to show ("No DSR for 25 Nov yet"). */
  empty: string | null;
}

/** One check, fully, for the review screen. */
export interface KavachCheckDetail extends KavachCheckRow {
  task: KavachTaskDef;
  opensAt: string;
  closesAt: string | null;
  validUntil: string | null;
  doneAt: string | null;
  submission: KavachSubmission | null;
  superseded: KavachSubmission[];
  review: { at: string; byName: string; verdict: 'approved' | 'excused' | 'marked_done' | 'marked_not_done'; note: string | null } | null;
  sendBacks: KavachSendBack[];
  ownerReports: KavachOwnerReport[];
  dataResult: KavachDataResult | null;
  panels: KavachPanel[];
  /** The last approved upload for this point at this outlet (for comparison). */
  lastApproved: { periodLabel: string; at: string; files: KavachFile[] } | null;
  history: KavachHistoryEntry[];
  /** Whether the outlet has an owner on the app (Tell owner needs one). */
  ownerOnApp: boolean;
}

export interface KavachReviewGroup {
  /** task code when by=task, dealerId when by=outlet */
  key: string;
  label: string;
  /** outlet code when by=outlet; points when by=task */
  sub: string;
  count: number;
  oldestAt: string;
  lateCount: number;
}

/* ───────────────────────────── Outlets ───────────────────────────── */

export interface KavachOutletRow {
  dealerId: string;
  dealerCode: string;
  dealerName: string;
  oilCompany: string | null;
  on: boolean;
  onSince: string | null;
  summary: KavachSummary | null;
  /** Checks in `sent`. */
  waitingReview: number;
}

export interface KavachOutletDetail extends KavachOutletRow {
  hiddenCodes: string[];
  customTasks: KavachTaskDef[];
  overrides: KavachTaskOverride[];
  /** The outlet's effective list (global − hidden + own, overrides applied). */
  tasks: KavachTaskDef[];
  /** Hidden global points, for the "show again" list. */
  hiddenTasks: KavachTaskDef[];
  /** Every open or recently closed check (current period per point). */
  checks: KavachCheckRow[];
}

/* ───────────────────────────── The dealer's view ───────────────────────────── */

export interface KavachDealerItem {
  checkId: string | null;
  code: string;
  titleEn: string;
  titleHi: string;
  howToEn: string;
  howToHi: string;
  how: KavachHow;
  sheet: KavachSheetId | null;
  uploader: KavachUploader;
  /** Whether THIS member may send it (owner-only points are not a manager's). */
  canSend: boolean;
  acceptsFile: boolean;
  points: number;
  everyDays: number | null;
  state: KavachCheckState;
  late: boolean;
  dueAt: string | null;
  validUntil: string | null;
  /** When a longer point opens next (Coming up). */
  opensAt: string | null;
  sentAt: string | null;
  sentBack: { reason: KavachSendBackReason; note: string | null; at: string } | null;
  /** For data points: why it is not done yet, both languages. */
  dataEn: string | null;
  dataHi: string | null;
  thumbUrl: string | null;
}

export interface KavachDealerView {
  on: boolean;
  summary: KavachSummary | null;
  /** sent back first, then late, then due soonest */
  now: KavachDealerItem[];
  waiting: KavachDealerItem[];
  done: KavachDealerItem[];
  upcoming: KavachDealerItem[];
  events: KavachDealerItem[];
}

/** One check as the dealer sees it when they open a row (no admin names). */
export interface KavachDealerCheck {
  item: KavachDealerItem;
  submission: KavachSubmission | null;
  lastApproved: { at: string; files: KavachFile[] } | null;
  history: { at: string; what: string; note: string | null }[];
}

/* ───────────────────────────── Socket ───────────────────────────── */

export const KAVACH_CHANGED_EVENT = 'kavach:changed';
export interface KavachChangedPayload {
  dealerId: string;
}
