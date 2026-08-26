import type { Attachment, TicketCategory } from './conversation';

/**
 * Dealer Kavach — recurring compliance, verified by MDG.
 *
 * A FIRST-CLASS SUBSYSTEM, deliberately NOT a ServicePlugin: it is stateful
 * (per-task clocks, evidence exchanges) and always-on, which the stateless
 * single-run plugin contract (ADR 0002) cannot model. See ADR 0006 for the
 * original subsystem decision and ADR 0011 for the shape it has now.
 *
 * The one sentence that governs everything below: A TASK IS CERTIFIED BY AN MDG
 * ADMIN OR BY AN AUTOMATION, NEVER BY THE DEALER. A dealer's photo, note or
 * claim is an input to that decision and never the decision itself. Every
 * type here — the verification contract, the evidence request block, the
 * NOT_YET_VERIFIED and HELD states — exists to keep that promise checkable.
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

/**
 * WHO is allowed to certify this task as done. The dealer never appears here:
 * since ADR 0011 a task is closed by an MDG admin or by an automation, and a
 * dealer's photo or claim is an INPUT to that decision, never the decision.
 *
 *  - `ADMIN`                       an admin judges it (usually from a photo or a visit).
 *  - `AUTOMATION`                  a portal/vault signal proves it; no human in the loop.
 *  - `DEALER_EVIDENCE_THEN_ADMIN`  we ask the dealer for evidence, then an admin rules on it.
 */
export const KAVACH_VERIFICATION_MODES = [
  'ADMIN',
  'AUTOMATION',
  'DEALER_EVIDENCE_THEN_ADMIN',
] as const;
export type KavachVerificationMode = (typeof KAVACH_VERIFICATION_MODES)[number];

/**
 * WHAT the closer must attach when certifying. This replaces the old
 * `requiresProof` boolean, which could express neither "a written note is the
 * evidence" (a maintenance visit) nor "a machine proved it, nobody attaches
 * anything". Note the inversion from the old model: the obligation now falls on
 * the ADMIN closing the task, not on the dealer.
 */
export const KAVACH_EVIDENCE_MODES = ['NONE', 'PHOTO', 'NOTE', 'PHOTO_OR_NOTE'] as const;
export type KavachEvidenceMode = (typeof KAVACH_EVIDENCE_MODES)[number];

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

/**
 * Per-item lifecycle state. SOS_* are the event-driven analogues that never
 * decay on a clock.
 *
 * Two states exist because the score is now MDG's own statement about the
 * dealer, and a statement must be able to admit what it does not know:
 *
 *  - `NOT_YET_VERIFIED`  nobody has ever checked this since the programme began.
 *                        Excluded from BOTH sides of the percentage during the
 *                        settling window, then counted in the denominator. It is
 *                        always disclosed as a count in words, never quietly
 *                        rounded into a green number.
 *  - `HELD`              the automation that proves this could not run (portal
 *                        down, captcha changed, service not attached). Counts as
 *                        compliant and stays off both the dealer's pending list
 *                        and the admin queue, because a failed collection is OUR
 *                        problem and looks identical to a dealer who did nothing.
 *                        Capped at `holdUntil`, after which it surfaces as ours.
 */
export const KAVACH_ITEM_STATUSES = [
  'VALID',
  'EXPIRING_SOON',
  'EXPIRED',
  'PAUSED',
  'NOT_YET_VERIFIED',
  'HELD',
  'SOS_OK',
  'SOS_FLAGGED',
] as const;
export type KavachItemStatus = (typeof KAVACH_ITEM_STATUSES)[number];

/** Statuses that contribute their full points to the compliant numerator. */
export const KAVACH_COMPLIANT_STATUSES: readonly KavachItemStatus[] = [
  'VALID',
  'EXPIRING_SOON',
  'HELD',
] as const;

/**
 * Statuses that count as "we owe this dealer a look" — the admin work queue and
 * the dealer's daily pending list both read from this one list, so the two can
 * never disagree about what is outstanding.
 *
 * `SOS_FLAGGED` is in it deliberately: a flagged availability item is a live
 * non-compliance an admin must act on, and the old `DUE_STATUSES` pair could
 * structurally never surface one.
 */
export const KAVACH_PENDING_STATUSES: readonly KavachItemStatus[] = [
  'EXPIRED',
  'EXPIRING_SOON',
  'NOT_YET_VERIFIED',
  'SOS_FLAGGED',
] as const;

/** Programme-level lifecycle. Mirrors DealerService's ACTIVE/PAUSED. */
export const KAVACH_PROGRAMME_STATUSES = ['ACTIVE', 'PAUSED'] as const;
export type KavachProgrammeStatus = (typeof KAVACH_PROGRAMME_STATUSES)[number];

/**
 * Origin of a completion event in an item's history timeline.
 *
 * `MARK_DONE` and `ADMIN_RESOLVE` are LEGACY and no longer written: the first
 * was the dealer's own tick, the second was a chat thread being closed. Both are
 * retained so history recorded before ADR 0011 still deserialises and still
 * reads honestly — a row that says MARK_DONE means the dealer said so, and that
 * is exactly what it should keep saying.
 */
export const KAVACH_COMPLETION_SOURCES = [
  'INITIATION_BASELINE',
  /** An admin certified it, with whatever evidence the definition demanded. */
  'ADMIN_VERIFIED',
  /** A portal/vault signal proved it; `evidence` names the artifact. */
  'AUTOMATION',
  'ADMIN_OVERRIDE',
  /**
   * Legacy, read-only. `MARK_DONE` was the dealer's own tap and `ADMIN_RESOLVE`
   * was mass-certification by closing a chat thread. Neither is written any
   * more; the values survive only so history recorded before ADR 0011 still
   * deserialises and still reads honestly about what it was.
   */
  'MARK_DONE',
  'ADMIN_RESOLVE',
] as const;
export type KavachCompletionSource = (typeof KAVACH_COMPLETION_SOURCES)[number];

/** Who performed an action on an item. `automation` has no user behind it. */
export const KAVACH_ACTOR_KINDS = ['dealer', 'admin', 'automation'] as const;
export type KavachActorKind = (typeof KAVACH_ACTOR_KINDS)[number];

/**
 * Lifecycle of the one outstanding evidence exchange on an item. At most one is
 * live at a time, which is why this is a block ON the item rather than its own
 * collection — two documents describing one fact is how a screen ends up
 * showing a figure the calculation disagrees with.
 *
 *  - `NONE`       nothing outstanding.
 *  - `ASKED`      MDG asked the dealer for evidence and is waiting.
 *  - `SUBMITTED`  the dealer sent something; an admin must rule on it. This is
 *                 ALSO where an unprompted dealer claim ("I've done this") lands,
 *                 distinguished by `openedBy`.
 *  - `REJECTED`   an admin looked and it did not show what was needed; the
 *                 dealer is told why and can send again.
 *
 * Moving through these NEVER moves the score or the clock. "The dealer sent it"
 * and "MDG accepted it" are different facts and every screen must show them as
 * different facts.
 */
export const KAVACH_REQUEST_STATES = ['NONE', 'ASKED', 'SUBMITTED', 'REJECTED'] as const;
export type KavachRequestState = (typeof KAVACH_REQUEST_STATES)[number];

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
  /** Who may certify this task. See {@link KavachVerificationMode}. */
  verification: KavachVerificationMode;
  /** What the certifying admin must attach. See {@link KavachEvidenceMode}. */
  evidence: KavachEvidenceMode;
  /**
   * The id of a signal registered under `services/kavach/signals`. Validated at
   * boot: a signalId naming no registered signal fails the boot rather than
   * silently leaving the task un-provable and quietly expiring every cycle.
   *
   * Its meaning depends on `verification`:
   *  - `AUTOMATION` — the signal CLOSES the task on its own.
   *  - `ADMIN` / `DEALER_EVIDENCE_THEN_ADMIN` — the signal is CORROBORATION,
   *    surfaced beside the admin's decision ("our DSR for 26-08 was ready at
   *    09:12") and never closing anything. This is how a task whose real subject
   *    is the dealer's own paperwork gets the benefit of what we already know
   *    without our uptime being mistaken for their compliance.
   */
  signalId?: string;
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
  verification: KavachVerificationMode;
  evidence: KavachEvidenceMode;
  signalId?: string;
}

/* ─────────────────── Per-dealer overlay on the global catalog (ADR 0011) ─────────────────── */

/**
 * A task this dealer has that the global catalog does not. Structurally the twin
 * of `DealerCustomWorkItem` in the staff work list, and deliberately so — one
 * overlay shape, one mental model for admins, one resolver pattern to maintain.
 *
 * `code` is server-generated and ALWAYS prefixed `custom-`, which the global
 * create schema rejects. Without that rail the first per-dealer custom could
 * shadow a global code in the effective map, and the symptom would not be an
 * error — it would be a silently wrong score.
 */
export interface DealerCustomKavachItem {
  code: string;
  labelEn: string;
  labelHi: string;
  points: number;
  /** `null` iff trigger === 'SOS'. */
  cadenceDays: number | null;
  trigger: KavachTrigger;
  domain: KavachDomain;
  category: TicketCategory;
  verification: KavachVerificationMode;
  evidence: KavachEvidenceMode;
  notesEn?: string;
  notesHi?: string;
  active: boolean;
}

/**
 * A per-dealer amendment to a GLOBAL catalog row. Only the named fields differ;
 * everything else keeps resolving from the catalog, so a later global edit still
 * reaches this dealer for every field they have not overridden.
 *
 * This is also what makes the cutover from snapshotted items invisible: the
 * backfill writes one override for every live item whose snapshot disagrees with
 * its catalog row, so nobody's figures move on the day the resolver ships.
 */
export interface DealerKavachOverride {
  code: string;
  points?: number;
  cadenceDays?: number | null;
  verification?: KavachVerificationMode;
  evidence?: KavachEvidenceMode;
  notesEn?: string;
  notesHi?: string;
}

/**
 * One per dealer: their overlay on the global KavachTemplate catalog. The
 * EFFECTIVE task list is
 *   (global active catalog − hiddenCodes) + active customItems, with overrides applied.
 * Resolved at READ time — never snapshotted. See ADR 0011.
 */
export interface DealerKavachList {
  id: string;
  dealerId: string;
  /** Global codes that do not apply to this outlet (no solar panels, no water cooler…). */
  hiddenCodes: string[];
  customItems: DealerCustomKavachItem[];
  overrides: DealerKavachOverride[];
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A fully-resolved task definition for one dealer: catalog row + overlay, with
 * every derived field computed. This is the ONLY shape the engine, the queue,
 * the scorer and the serialisers read a definition from — nothing downstream
 * ever reaches back into KavachTemplate or the overlay itself.
 */
export interface EffectiveKavachItem {
  code: string;
  srNo: number;
  titleEn: string;
  titleHi: string;
  labelEn: string;
  labelHi: string;
  points: number;
  cadenceDays: number | null;
  trigger: KavachTrigger;
  domain: KavachDomain;
  category: TicketCategory;
  verification: KavachVerificationMode;
  evidence: KavachEvidenceMode;
  signalId?: string;
  notesEn?: string;
  notesHi?: string;
  /** Where this definition came from — drives what an admin may edit on it. */
  source: 'catalog' | 'custom';
  /** True when a per-dealer override changed at least one field of a catalog row. */
  overridden: boolean;

  /* ── Derived. Computed on the way out, never stored. ── */
  tier: KavachTier;
  cadenceBucket: KavachCadenceBucket;
  warnWindowDays: number;
  /**
   * Days of slack after `expiresAt` before the task reads EXPIRED.
   *
   * This exists because a DAILY task has a zero-day warning window and expires
   * at IST midnight, so at the default 08:00 digest hour every one of the ten
   * daily tasks already read EXPIRED — a perfectly compliant dealer would be
   * told every single morning that they were 585 points short, and 100% would
   * be unreachable by construction. One grace day for DAILY, none elsewhere.
   */
  verifyGraceDays: number;
}

/* ───────────────────────────────── Per-dealer programme ──────────────────────────────────── */

/**
 * Outlet metadata captured at initiation (from the sheet header).
 *
 * The outlet name and RO SAP code that used to be typed in here are gone: the
 * dealer's own code identifies the programme, and the RO code the portal
 * reports is collected automatically, so both fields only ever offered a second
 * spelling of something already known — and this block ships to dealer tokens
 * via `GET /kavach/me`.
 */
export interface KavachOutletMeta {
  /** e.g. "2026-01" — the month/year the programme baseline was captured. */
  monthYear: string;
}

/** Live, recomputed score snapshot. Dealers see overallPct; admins see byBucket too. */
export interface KavachScoreSnapshot {
  /**
   * Is there anything to divide by?
   *
   * FALSE means every scoreable task is still unexamined, so there is no
   * percentage to state — not that the outlet is at zero, and emphatically not
   * that it is at a hundred. Read this BEFORE `overallPct` on every surface; a
   * screen that prints the number without checking is making a claim the
   * calculation does not support.
   *
   * It exists because `overallPct` used to fall back to 100 when the
   * denominator was empty. That began as a kindness — a brand-new programme
   * should not open red — and it was defensible while the figure was the
   * dealer's own declaration. Once the figure became MDG's written statement
   * about them, a fresh outlet rendered "100% · 40 never checked · 0/0 points
   * compliant": three numbers in one line, one of which contradicted the other
   * two.
   */
  scored: boolean;
  /**
   * Overall operational % (0–100), meaningful only when `scored`. Excludes SOS
   * items (admin availability gauge, MVP). Zero when unscored, so a consumer
   * that ignores `scored` understates rather than invents a perfect score.
   */
  overallPct: number;
  /** Per-bucket sub-scores (0–100); admin-only. */
  byBucket: Partial<Record<KavachCadenceBucket, number>>;
  /** Sum of points currently counting as compliant. */
  validPoints: number;
  /** Sum of all non-paused, non-SOS item points (the live denominator). Never hardcoded. */
  totalPoints: number;
  /**
   * How many tasks nobody has checked yet, and what they are worth. Carried
   * alongside the percentage rather than folded into it: once the number is
   * MDG's own statement, "97%" with eleven unexamined tasks behind it has to be
   * sayable as "97%, and we have not looked at 11 things yet".
   */
  notYetVerifiedCount: number;
  notYetVerifiedPoints: number;
  /** How many are parked because the automation proving them could not run. */
  heldCount: number;
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
  /**
   * NOTHING reaches this dealer until an admin turns this on. Off by default,
   * including for a freshly initiated programme.
   *
   * The daily message and the shareable card both state a figure about the
   * dealer's outlet, and on the day a programme starts that figure is "nobody
   * has checked anything yet". This switch is what makes "we don't tell them
   * until we've actually done the work" an enforced rule rather than a habit
   * every admin has to remember.
   */
  dealerFacingEnabled?: boolean;
  /** Who turned the dealer-facing messages on, and when. */
  dealerFacingEnabledAt?: string;
  dealerFacingEnabledByAdminId?: string;
  /**
   * Per-dealer local hour-of-day (0–23, IST) at which the daily list is
   * delivered. Absent => the global `KAVACH_DEFAULT_REMINDER_HOUR` default (8).
   * Delivery is still gated on `dealerFacingEnabled` and capped at once per IST
   * day. Admin-editable from the dealer's Kavach panel.
   */
  reminderHour?: number;
  createdAt: string;
  updatedAt: string;
}

/* ─────────────────────────── Per-dealer, per-item stateful tracker ────────────────────────── */

/**
 * What an automation looked at when it certified a task. Rendered in the admin
 * drawer as "proved by: DSR for 2026-08-26, generated 09:12", with a link.
 * An "Auto-marked" badge with nothing behind it makes the first disputed score
 * unanswerable, so a machine mark without this is not allowed.
 */
export interface KavachAutomationEvidence {
  signalId: string;
  /** The plugin whose run produced the artifact, when there was one. */
  serviceId?: string;
  runId?: string;
  /** The proving document's id in its own collection. */
  docId?: string;
  /** The IST business date the artifact describes. */
  businessDate?: string;
  /** One human-readable line, frozen at mark time. */
  summary: string;
}

/** Append-only entry in an item's completion timeline. */
export interface KavachCompletionEvent {
  /** When the certification was RECORDED (the click / the reconciler tick). */
  at: string;
  /**
   * The IST business date being certified — which is not `at`. A photo taken
   * Monday evening is reviewed Tuesday morning; without this the clock would
   * move to Tuesday and Monday could never be credited, which alone makes the
   * daily photo tasks impossible to keep green.
   */
  doneOn?: string;
  by: {
    kind: KavachActorKind;
    /** Empty for `automation`. */
    userId: string;
    /**
     * Denormalised at write time so rendering a month of history is one query,
     * not one lookup per row (the ttDensity precedent).
     */
    name?: string;
  };
  source: KavachCompletionSource;
  proof?: Attachment;
  note?: string;
  /** Present only when `source === 'AUTOMATION'`. */
  evidence?: KavachAutomationEvidence;
  /**
   * The definition as it stood when this was scored. Points are now editable
   * globally, so without this a row from last month would silently re-read
   * itself at today's values.
   */
  defSnapshot?: {
    labelEn: string;
    labelHi: string;
    points: number;
  };
  /** Set when an admin closed a task without the evidence its definition demands. */
  evidenceOverrideReason?: string;
  previousExpiresAt?: string;
  newExpiresAt?: string;
}

/**
 * The one outstanding evidence exchange on an item. See
 * {@link KAVACH_REQUEST_STATES} for why this lives here and not in its own
 * collection or in the chat thread.
 */
export interface KavachEvidenceRequestState {
  state: KavachRequestState;
  /**
   * Who opened the current cycle. `admin` = MDG asked. `dealer` = the dealer
   * volunteered ("I've done this"), which lands in the same review queue but is
   * never treated as a completion.
   */
  openedBy?: 'admin' | 'dealer';
  askedAt?: string;
  /** Times we have asked in the current cycle. Drives the "stop chasing" rule. */
  askedCount: number;
  submission?: {
    at: string;
    byUserId: string;
    proof?: Attachment;
    note?: string;
  };
  reviewedAt?: string;
  reviewedByAdminId?: string;
  /** Shown to the dealer verbatim when an admin rejects what they sent. */
  rejectReason?: string;
}

/**
 * The stateful per-task tracker — one per task per dealer.
 *
 * The definition fields below are still ON this shape because every consumer
 * needs them, but since ADR 0011 they are RESOLVED at read time from the global
 * catalog plus the dealer's overlay, not snapshotted at initiation. That is what
 * makes a global points edit reach every dealer; while they were snapshotted,
 * the defaults editor could save successfully and move nobody.
 *
 * Stored on the document: only the state block (`status` downwards).
 */
export interface KavachItem {
  id: string;
  programmeId: string;
  dealerId: string;
  /** Catalog code, or the `custom-…` code of a dealer-only task. */
  templateCode: string;
  custom: boolean;

  /* ── Resolved definition (catalog + overlay). Never stored on the item. ── */
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
  verification: KavachVerificationMode;
  evidence: KavachEvidenceMode;
  signalId?: string;
  /** True when a per-dealer override amends the catalog row. */
  overridden?: boolean;
  notesEn?: string;
  notesHi?: string;

  /* ── Derived ── */
  tier: KavachTier;
  /** Cadence-relative warn lead, in days. */
  warnWindowDays: number;
  /** Slack after expiry before the task reads EXPIRED. See EffectiveKavachItem. */
  verifyGraceDays?: number;

  /* ── State ── */
  status: KavachItemStatus;
  /** When the certification was recorded. Baseline at initiation. */
  lastDoneAt?: string;
  /** The IST business date most recently certified. */
  doneOn?: string;
  /** doneOn + cadenceDays; null for SOS. */
  expiresAt?: string;
  /** While `status === 'HELD'`: when the hold lapses and it becomes OUR problem. */
  holdUntil?: string;
  /** Who certified it last — `automation` when a signal did. */
  lastVerifiedByKind?: KavachActorKind;
  /**
   * Shown to the DEALER as "MDG टीम ने जाँचा — 24 अगस्त". Deliberately never the
   * individual admin's name: the dealer's relationship is with MDG.
   */
  lastVerifiedAt?: string;
  /** The note the last certifier left, when they left one. */
  lastVerifiedNote?: string;
  /** The one outstanding evidence exchange, if any. */
  request: KavachEvidenceRequestState;
  lastProofAttachment?: Attachment;
  /** Admin-removed/paused for this RO: excluded from score + queue. */
  paused: boolean;
  /** Capped at the most recent {@link KAVACH_HISTORY_LIMIT} entries. */
  history: KavachCompletionEvent[];

  createdAt: string;
  updatedAt: string;
}

/**
 * How many completion events an item keeps inline. History is an embedded array
 * and the daily photo tasks generate roughly 1,500 proof rows per dealer per
 * year; unbounded, one admin list call would drag every one of them across the
 * wire. AuditLog remains the durable, uncapped trail.
 */
export const KAVACH_HISTORY_LIMIT = 50;

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

/**
 * Body for POST /kavach/items/:itemId/verify — an ADMIN certifies a task.
 * This is the only human write path that moves a clock.
 */
export interface VerifyKavachItemInput {
  /**
   * The IST business date being certified (YYYY-MM-DD). Defaults to today.
   * Must not be in the future, nor older than one cadence period — a stale
   * `doneOn` would set an expiry that has already passed.
   */
  doneOn?: string;
  /** Required when the resolved `evidence` is PHOTO or PHOTO_OR_NOTE. */
  proof?: Attachment;
  /** Required when the resolved `evidence` is NOTE or PHOTO_OR_NOTE. */
  note?: string;
  /**
   * Closes the task WITHOUT the evidence its definition demands, on the record.
   * An admin must never be structurally stuck, but they must say why, and the
   * reason is audited and printed in the item's history.
   */
  overrideEvidenceReason?: string;
}

/** Body for POST /kavach/items/:itemId/request-evidence — admin asks the dealer. */
export interface RequestKavachEvidenceInput {
  /** Optional extra line shown to the dealer with the ask. */
  message?: string;
}

/**
 * Body for POST /kavach/items/:itemId/evidence — the DEALER sends something.
 *
 * Also carries the unprompted claim: with no proof and no outstanding ask, this
 * is "I've done this", which queues the task for review and moves nothing.
 */
export interface SubmitKavachEvidenceInput {
  proof?: Attachment;
  note?: string;
}

/** Body for POST /kavach/items/:itemId/reject-evidence — admin sends it back. */
export interface RejectKavachEvidenceInput {
  /** Shown to the dealer verbatim, so it must be usable as-is. */
  reason: string;
}

/** Body for an admin adding a per-dealer custom task. */
export interface AddCustomKavachItemInput {
  labelEn: string;
  labelHi: string;
  points: number;
  /** cadenceDays for a TIME item; omit for SOS. */
  cadenceDays?: number;
  trigger: KavachTrigger;
  domain?: KavachDomain;
  category?: TicketCategory;
  verification?: KavachVerificationMode;
  evidence?: KavachEvidenceMode;
  notesEn?: string;
  notesHi?: string;
}

/** Body for PUT /dealers/:dealerId/kavach/work-list — full replace of the overlay. */
export interface UpdateDealerKavachListInput {
  hiddenCodes: string[];
  /** `code` is server-generated for a new task; echoed back for an existing one. */
  customItems: (Omit<DealerCustomKavachItem, 'code'> & { code?: string })[];
  overrides: DealerKavachOverride[];
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

/**
 * Row in the admin cross-dealer compliance dashboard.
 *
 * The escalation columns are gone with the escalation machinery. What replaced
 * them is the question that actually matters under a verified model: not "how
 * many tickets has this dealer got open against them" but "how long is it since
 * anybody at MDG looked at this dealer at all" — because the failure mode is now
 * OUR backlog, and it has no other alarm.
 */
export interface KavachDashboardRow {
  dealerId: string;
  dealerCode: string;
  programmeId: string;
  /** False when nothing has been verified: read this before `overallPct`. */
  scored: boolean;
  overallPct: number;
  expiredCount: number;
  expiringSoonCount: number;
  /** Tasks nobody has ever checked. */
  notYetVerifiedCount: number;
  /** Tasks where we are waiting on the dealer to send something. */
  awaitingDealerCount: number;
  /** Tasks the dealer has answered and nobody has ruled on. */
  awaitingReviewCount: number;
  /**
   * Whole IST days since ANY task of this dealer's was verified. `null` when
   * nothing ever has been. This is the staleness alarm — without it a dealer can
   * quietly go a fortnight untouched while their card keeps going out.
   */
  daysSinceLastVerified: number | null;
  /** False until an admin has switched this dealer's messages on. */
  dealerFacingEnabled: boolean;
  lastEvaluatedAt?: string;
}

/** Query for listing a dealer's items (Kavach tab "Today" vs admin full list). */
export interface KavachItemsQuery {
  /** Only tasks needing attention now ({@link KAVACH_PENDING_STATUSES}). */
  dueOnly?: boolean;
  bucket?: KavachCadenceBucket;
  status?: KavachItemStatus;
}

/* ─────────────────────── The admin cross-dealer work queue (ADR 0011) ────────────────────── */

/**
 * One outstanding task, for one dealer, in the admin queue. Deliberately flat
 * and pre-resolved: the queue is a repetitive data-entry surface, and every
 * field an admin needs to decide "can I close this now?" must arrive in the
 * list payload rather than behind a second request per row.
 */
export interface KavachWorkQueueRow {
  itemId: string;
  dealerId: string;
  dealerCode: string;
  /** The catalog / custom code, so rows can group BY TASK across dealers. */
  code: string;
  labelEn: string;
  labelHi: string;
  points: number;
  tier: KavachTier;
  cadenceBucket: KavachCadenceBucket;
  status: KavachItemStatus;
  verification: KavachVerificationMode;
  evidence: KavachEvidenceMode;
  expiresAt?: string;
  /** Whole IST days this has been outstanding. Negative = not due yet. */
  daysPending: number;
  /** The live evidence exchange, so "dealer sent a photo" shows in the list. */
  requestState: KavachRequestState;
  /** Set when the dealer has something waiting to be looked at. */
  submittedAt?: string;
  lastVerifiedAt?: string;
}

/** Cursor page of {@link KavachWorkQueueRow}. Keyset, never offset. */
export interface KavachWorkQueuePage {
  rows: KavachWorkQueueRow[];
  /** Opaque cursor for the next page; absent when the queue is exhausted. */
  nextCursor?: string;
  /** Total outstanding across the whole filter, for the header count. */
  total: number;
}

/** Query for GET /kavach/work-queue. */
export interface KavachWorkQueueQuery {
  dealerId?: string;
  /** Restrict to one task across every dealer — the fast "one task, one pass" mode. */
  code?: string;
  status?: KavachItemStatus;
  verification?: KavachVerificationMode;
  /** Only rows where the dealer has sent something (the review inbox). */
  awaitingReview?: boolean;
  cursor?: string;
  limit?: number;
}

/* ────────────────────────── The daily pending list (ADR 0011) ─────────────────────────────── */

/** One pending task as frozen onto a day's digest. */
export interface KavachDigestPendingEntry {
  code: string;
  labelEn: string;
  labelHi: string;
  points: number;
  status: KavachItemStatus;
  /** True when we are waiting on the dealer for a photo or a note. */
  awaitingDealer: boolean;
}

/**
 * One day's statement about one dealer, frozen at build time — the artifact
 * behind requirement 2. Mirrors DsrReport: built once per (dealer, IST date),
 * unique-indexed, and immutable afterwards, so the number on the card the dealer
 * keeps can always be reproduced.
 *
 * The chat line is delivered automatically at the dealer's hour; the rendered
 * PNG is admin-approved, because an image with a figure on it can be forwarded.
 */
export interface KavachDailyDigest {
  id: string;
  dealerId: string;
  /** IST calendar date, YYYY-MM-DD. */
  businessDate: string;
  /** The score as it stood when this was built — never recomputed on read. */
  score: KavachScoreSnapshot;
  pending: KavachDigestPendingEntry[];
  /** How many pending tasks exist beyond the ones listed above. */
  pendingOverflow: number;
  /** Tasks where we are waiting on the dealer to send something. */
  awaitingDealerCount: number;
  computedAt: string;
  /** The delivered chat line, kept so the card and the message cannot diverge. */
  messageBody?: string;
  messageSentAt?: string;
  /** Rendered card, once an admin has approved sharing it. */
  cardKey?: string;
  cardSize?: number;
  sharedAt?: string;
  sharedByAdminId?: string;
  createdAt: string;
  updatedAt: string;
}
