import type { Attachment, TicketCategory, TicketPriority } from './conversation';

/**
 * Kavach Programme — recurring assessment & compliance tracking.
 *
 * This is a FIRST-CLASS SUBSYSTEM, deliberately NOT a ServicePlugin: it is
 * stateful (per-item clocks, reminder ladders, escalation), always-on, and
 * dealer-input-driven, which the stateless single-run plugin contract
 * (ADR 0002) cannot model. See ADR 0006 and docs/specs/kavach-programme.md.
 * It reuses the per-member chat / escalation / ServiceLog spine (ADR 0005).
 */

/* ─────────────────────────── Enums (const arrays + derived types) ────────────────────────── */

/** How an item's clock works. TIME = decays on a cadence; SOS = event/visit-driven, no clock. */
export const KAVACH_TRIGGERS = ['TIME', 'SOS'] as const;
export type KavachTrigger = (typeof KAVACH_TRIGGERS)[number];

/**
 * Human grouping bucket, DERIVED from cadenceDays (the source of truth).
 * Days: 1/7/15/30/90/180/365/730. `SOS` is its own bucket (no clock).
 */
export const KAVACH_CADENCE_BUCKETS = [
  'DAILY',
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'BIENNIAL',
  'SOS',
] as const;
export type KavachCadenceBucket = (typeof KAVACH_CADENCE_BUCKETS)[number];

/** Importance tier derived from points; drives reminder count + escalation aggressiveness. */
export const KAVACH_TIERS = ['CRITICAL', 'STANDARD', 'LIGHT'] as const;
export type KavachTier = (typeof KAVACH_TIERS)[number];

/** Tier thresholds by points. CRITICAL ≥ 200, STANDARD 50–199, LIGHT < 50. */
export const KAVACH_TIER_THRESHOLDS = { critical: 200, standard: 50 } as const;

/**
 * Operational domain of a checklist item. Used to group items and to DERIVE the
 * escalation `category` (a real TicketCategory). This is NOT a TicketCategory.
 */
export const KAVACH_DOMAINS = [
  'daily-ops',
  'cleanliness',
  'safety',
  'statutory-license',
  'sdms-filing',
  'documentation-display',
  'equipment',
] as const;
export type KavachDomain = (typeof KAVACH_DOMAINS)[number];

/** Per-item lifecycle state. SOS_* are the event-driven analogues that never decay on a clock. */
export const KAVACH_ITEM_STATUSES = [
  'VALID',
  'EXPIRING_SOON',
  'EXPIRED',
  'PAUSED',
  'SOS_OK',
  'SOS_FLAGGED',
] as const;
export type KavachItemStatus = (typeof KAVACH_ITEM_STATUSES)[number];

/** Programme-level lifecycle. Mirrors DealerService's ACTIVE/PAUSED. */
export const KAVACH_PROGRAMME_STATUSES = ['ACTIVE', 'PAUSED'] as const;
export type KavachProgrammeStatus = (typeof KAVACH_PROGRAMME_STATUSES)[number];

/** Origin of a completion event in an item's history timeline. */
export const KAVACH_COMPLETION_SOURCES = [
  'INITIATION_BASELINE',
  'MARK_DONE',
  'ADMIN_RESOLVE',
  'ADMIN_OVERRIDE',
] as const;
export type KavachCompletionSource = (typeof KAVACH_COMPLETION_SOURCES)[number];

/**
 * Display-only catalog id for the programme (admin "initiate like a service"
 * affordance, and the dashboard join key). NOTE: this is intentionally NOT a
 * registered ServicePlugin, so escalation ServiceLogs are written with
 * `serviceId: 'other'` + a recognizable `serviceName` (see ADR 0006), not this id.
 */
export const KAVACH_PROGRAMME_SERVICE_ID = 'kavach-programme';

/* ─────────────────────────────────── Global template ─────────────────────────────────────── */

/**
 * One reconciled master item. Seeded globally; programmes SNAPSHOT these at
 * initiation so later template edits never silently rewrite live dealer state.
 */
export interface KavachTemplateItem {
  id: string;
  /** Stable slug, unique. Join key into per-dealer KavachItem.templateCode. */
  code: string;
  /** Original sheet row (1–45) for traceability. */
  srNo: number;
  /** Raw source title from the sheet (English) — kept admin-side for traceability. */
  titleEn: string;
  /** Raw source title from the sheet (Hindi/Devanagari). */
  titleHi: string;
  /** Clean, short, dealer-facing label (English). Never show the raw imported title to dealers. */
  labelEn: string;
  /** Clean, short, dealer-facing label (Hindi/Devanagari). */
  labelHi: string;
  /** Reconciled importance weight. Drives tier + score. */
  points: number;
  /** Reconciled validity in days. `null` iff trigger === 'SOS'. */
  cadenceDays: number | null;
  trigger: KavachTrigger;
  /** Denormalised from cadenceDays/trigger for grouping. */
  cadenceBucket: KavachCadenceBucket;
  domain: KavachDomain;
  /** Default CRM category used when this item escalates (derived from domain). */
  category: TicketCategory;
  /** If true, "Mark done" requires a photo. */
  requiresProof: boolean;
  notesEn?: string;
  notesHi?: string;
  /** Retire without deleting history. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Shape of a row in the seed data file (`shared/src/data/kavachTemplate.ts`).
 * Subset of KavachTemplateItem without server-managed fields.
 */
export interface KavachTemplateSeedItem {
  code: string;
  srNo: number;
  titleEn: string;
  titleHi: string;
  labelEn: string;
  labelHi: string;
  points: number;
  cadenceDays: number | null;
  trigger: KavachTrigger;
  cadenceBucket: KavachCadenceBucket;
  domain: KavachDomain;
  category: TicketCategory;
  requiresProof: boolean;
}

/* ───────────────────────────────── Per-dealer programme ──────────────────────────────────── */

/** Outlet metadata captured at initiation (from the sheet header). */
export interface KavachOutletMeta {
  retailOutletName: string;
  roSapCode: string;
  /** e.g. "2026-01" — the month/year the programme baseline was captured. */
  monthYear: string;
}

/** Live, recomputed score snapshot. Dealers see overallPct; admins see byBucket too. */
export interface KavachScoreSnapshot {
  /** Overall operational % (0–100). Excludes SOS items (admin availability gauge, MVP). */
  overallPct: number;
  /** Per-bucket sub-scores (0–100); admin-only. */
  byBucket: Partial<Record<KavachCadenceBucket, number>>;
  /** Sum of points currently counting as compliant. */
  validPoints: number;
  /** Sum of all non-paused, non-SOS item points (the live denominator). Never hardcoded. */
  totalPoints: number;
  computedAt: string;
}

export interface KavachProgramme {
  id: string;
  dealerId: string;
  status: KavachProgrammeStatus;
  outlet: KavachOutletMeta;
  score: KavachScoreSnapshot;
  /** Mirrors score.totalPoints, surfaced for convenience. */
  totalPoints: number;
  /**
   * Settling-in grace: until this instant, NO reminders or escalations fire and
   * the dealer never sees a failing score, so a freshly-initiated programme is
   * never a "public exam failure" on first open. Set to initiatedAt + grace days.
   */
  settlingUntil?: string;
  initiatedByAdminId: string;
  initiatedAt: string;
  lastEvaluatedAt?: string;
  /** Earliest reminder/expiry across items; lets the sweep skip idle programmes. */
  nextEvaluateAt?: string;
  /**
   * Per-dealer local hour-of-day (0–23, IST) at which the daily digest fires.
   * Absent => the global `KAVACH_DEFAULT_REMINDER_HOUR` env default (8). The
   * sweep still delivers at most once per IST day (server-internal `lastDigestAt`
   * gate). Admin-editable from the dealer's Kavach panel.
   */
  reminderHour?: number;
  createdAt: string;
  updatedAt: string;
}

/* ─────────────────────────── Per-dealer, per-item stateful tracker ────────────────────────── */

export interface KavachReminderState {
  /** Reminders sent this cycle (0 = none yet). */
  level: number;
  /** Max reminders before escalation: 3 CRITICAL / 2 STANDARD / 1 LIGHT. */
  maxLevel: number;
  lastSentAt?: string;
  /** When the next reminder is due. Absent = nothing scheduled. */
  nextRemindAt?: string;
  /** Start of the current expiry cycle; reset on mark-done. */
  cycleStartedAt?: string;
}

export interface KavachEscalationState {
  escalated: boolean;
  escalatedAt?: string;
  /** The OPEN conversation that carries this escalation in the admin inbox. */
  conversationId?: string;
  resolvedAt?: string;
}

/** Append-only entry in an item's completion timeline. */
export interface KavachCompletionEvent {
  at: string;
  by: {
    kind: 'dealer' | 'admin';
    userId: string;
  };
  source: KavachCompletionSource;
  proof?: Attachment;
  note?: string;
  previousExpiresAt?: string;
  newExpiresAt?: string;
}

/**
 * The stateful per-task tracker — one per item per dealer (template-derived OR
 * custom). Template fields are SNAPSHOTTED at instantiation. This is the
 * documented break from the stateless plugin contract (ADR 0006).
 */
export interface KavachItem {
  id: string;
  programmeId: string;
  dealerId: string;
  /** Template code if instantiated from master; null for admin custom items. */
  templateCode: string | null;
  custom: boolean;

  /* Snapshotted definition */
  titleEn: string;
  titleHi: string;
  labelEn: string;
  labelHi: string;
  points: number;
  cadenceDays: number | null;
  trigger: KavachTrigger;
  cadenceBucket: KavachCadenceBucket;
  domain: KavachDomain;
  category: TicketCategory;
  requiresProof: boolean;
  notesEn?: string;
  notesHi?: string;

  /* Derived / state */
  tier: KavachTier;
  status: KavachItemStatus;
  /** Baseline at initiation; reset to now on mark-done. */
  lastDoneAt?: string;
  /** lastDoneAt + cadenceDays; null for SOS. */
  expiresAt?: string;
  /** Cadence-relative warn lead, in days. */
  warnWindowDays: number;
  reminder: KavachReminderState;
  escalation: KavachEscalationState;
  lastProofAttachment?: Attachment;
  /** Admin-removed/paused for this RO: excluded from score + reminders. */
  paused: boolean;
  history: KavachCompletionEvent[];

  createdAt: string;
  updatedAt: string;
}

/* ──────────────────────────────────── API I/O shapes ─────────────────────────────────────── */

/** Body for initiating the programme for a dealer (admin, once). */
export interface InitiateKavachProgrammeInput {
  outlet: KavachOutletMeta;
  /**
   * Optional per-template baseline dates captured during the field-agent's first
   * visit, keyed by template code. Omitted items default to "fresh clock from
   * initiation" (never EXPIRED-on-day-one — see settling-in, ADR 0006).
   */
  baselines?: Record<string, string>;
  /** Template codes that don't apply to this RO and should start paused. */
  excludeCodes?: string[];
}

/** Body for a dealer (or admin) marking an item done. */
export interface MarkKavachItemDoneInput {
  /** Required when the item has requiresProof === true. */
  proof?: Attachment;
  note?: string;
}

/** Body for an admin adding a per-dealer custom item. */
export interface AddCustomKavachItemInput {
  labelEn: string;
  labelHi: string;
  points: number;
  /** cadenceDays for a TIME item; omit for SOS. */
  cadenceDays?: number;
  trigger: KavachTrigger;
  domain?: KavachDomain;
  category?: TicketCategory;
  requiresProof?: boolean;
  notesEn?: string;
  notesHi?: string;
}

/** Body for pausing/resuming an item for a dealer. */
export interface SetKavachItemPausedInput {
  paused: boolean;
  reason?: string;
}

/** Body for an admin flagging/clearing an SOS item's availability. */
export interface SetKavachSosComplianceInput {
  compliant: boolean;
  note?: string;
}

/** Row in the admin cross-dealer compliance dashboard. */
export interface KavachDashboardRow {
  dealerId: string;
  dealerName: string;
  dealerCode: string;
  programmeId: string;
  overallPct: number;
  expiredCount: number;
  expiringSoonCount: number;
  escalatedCount: number;
  worstPriority?: TicketPriority;
  lastEvaluatedAt?: string;
}

/** Query for listing a dealer's items (Kavach tab "Today" vs admin full list). */
export interface KavachItemsQuery {
  /** Only items needing attention now (EXPIRING_SOON | EXPIRED | escalated). Drives the dealer "Today" view. */
  dueOnly?: boolean;
  bucket?: KavachCadenceBucket;
  status?: KavachItemStatus;
}
