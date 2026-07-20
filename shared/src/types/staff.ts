/**
 * Staff Points — dealer-internal staff management & work-reward tracking.
 *
 * A petrol-pump owner/manager keeps a roster of their own workers (Employees —
 * plain dealer-owned records, NOT login Users) and awards them points for
 * operational work drawn from a seeded 66-item bilingual work catalog
 * ("स्टाफ प्रबंधन" sheet). This is a sibling of the Kavach programme but
 * dealer-INTERNAL: the audience is the owner + manager, not MDG admins.
 *
 * Contracts here are the single source of truth for the shared shapes; see
 * ADR 0007 and docs/specs/staff-points.md. Bilingual copy follows the repo
 * convention of flat `<field>En` / `<field>Hi` sibling string fields.
 */

/* ─────────────────────────── Enums (const arrays + derived types) ────────────────────────── */

/**
 * How a work item's points are turned into per-employee awards. This encodes the
 * source sheet's REMARKS column so point totals stay honest:
 *  - FLAT     : a fixed award to each selected worker (a one-off job; usually one worker).
 *  - SPLIT    : the points are divided equally among the workers who did it
 *               ("जितने आदमियों द्वारा किया जायेगा उसमें बट जायेगा").
 *  - EACH     : every selected worker gets the full points ("सबको मिलेगा").
 *  - PER_UNIT : points × quantity (per vehicle / per ₹1000 / per guest / per tank …).
 */
export const STAFF_POINT_DISTRIBUTIONS = ['FLAT', 'SPLIT', 'EACH', 'PER_UNIT'] as const;
export type StaffPointDistribution = (typeof STAFF_POINT_DISTRIBUTIONS)[number];

/** Operational grouping used to make the work picker navigable. */
export const STAFF_WORK_DOMAINS = [
  'cleaning',
  'du',
  'equipment',
  'automation',
  'tanker',
  'mobile-dispenser',
  'sales',
  'office',
  'customer',
  'kitchen',
  'misc',
] as const;
export type StaffWorkDomain = (typeof STAFF_WORK_DOMAINS)[number];

/**
 * The catch-all works — "Other cleaning work", "Other DU work", "Other office
 * work", plus the open-ended tanker preventive-maintenance work. Their label says
 * nothing about what was actually done, so a free-text description is REQUIRED
 * before points can be awarded for one; every other work names itself and takes
 * an optional note.
 *
 * Enforced in `staffDraftEntrySchema` / `awardWorkSelectionSchema`, so the rule
 * holds for the client, the draft autosave and the finalize path alike.
 */
export const DESCRIPTION_REQUIRED_WORK_CODES = [
  'other-cleaning-work',
  'other-du-work',
  'other-office-work',
  'tanker-preventive-work',
] as const;

/** Whether this work demands a written description of what was done. */
export function requiresDescription(workItemCode: string): boolean {
  return (DESCRIPTION_REQUIRED_WORK_CODES as readonly string[]).includes(workItemCode);
}

/** Max length of a per-work description. */
export const WORK_NOTE_MAX = 300;

/** The unit a PER_UNIT item is counted in (drives the quantity stepper's label). */
export const STAFF_WORK_UNITS = [
  'vehicle',
  'rupee-1000',
  'guest',
  'customer',
  'transaction',
  'item',
  'tank',
  'photo',
] as const;
export type StaffWorkUnit = (typeof STAFF_WORK_UNITS)[number];

/**
 * How a work item's base points are SET.
 *  - 'labour'   : points are DERIVED from the work's factors (time + skill +
 *                 effort + responsibility) via `deriveBasePoints()`. Never typed.
 *  - 'incentive': points are a typed business/policy value (sales & acquisition
 *                 rewards, e.g. per-₹1000 fuel sales). The factor formula does not apply.
 */
export const STAFF_PRICING_MODES = ['labour', 'incentive'] as const;
export type StaffPricingMode = (typeof STAFF_PRICING_MODES)[number];

/** Employee roster lifecycle. INACTIVE = left the pump; kept for award history. */
export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/**
 * The sheet's baseline: every worker ("योद्धा") must earn at least this many
 * points. Surfaced as the leaderboard's target line; never a hard block.
 */
export const STAFF_DAILY_POINT_TARGET = 100;

/** Display-only catalog id, mirroring KAVACH_PROGRAMME_SERVICE_ID. */
export const STAFF_POINTS_FEATURE_ID = 'staff-points';

/* ─────────────────────────────── Work catalog (seeded) ───────────────────────────────────── */

/**
 * One work item in the reward catalog. Seeded globally & versioned; the award
 * ledger denormalises the label at award time so later catalog edits never
 * rewrite historical entries.
 */
export interface StaffWorkItem {
  id: string;
  /** Stable slug, unique per version. Join key from a StaffPointAward. */
  code: string;
  /** Original sheet row (1–66) for traceability. */
  srNo: number;
  /** Faithful English of the raw sheet text (admin traceability). */
  titleEn: string;
  /** Raw sheet text (Hindi/Devanagari) — kept verbatim. */
  titleHi: string;
  /** Clean, short, dealer-facing label (English). */
  labelEn: string;
  /** Clean, short, dealer-facing label (Hindi/Devanagari). */
  labelHi: string;
  /** Base points. Derived from the factors below for labour works; a typed policy value for incentive works. May be fractional (e.g. 0.5). */
  points: number;
  distribution: StaffPointDistribution;
  /** Whether `points` is derived from factors ('labour') or a typed policy value ('incentive'). */
  pricingMode: StaffPricingMode;
  /** Estimated hands-on minutes — whole-job for FLAT/SPLIT/EACH, per-unit for PER_UNIT. Labour works only. */
  timeMin?: number;
  /** Skill required, 0–100. Labour works only. */
  skill?: number;
  /** Physical effort / hardship, 0–100. Labour works only. */
  effort?: number;
  /** Responsibility — consequence of error (money, safety, trust), 0–100. Labour works only. */
  responsibility?: number;
  /** Present iff distribution === 'PER_UNIT'. */
  unit?: StaffWorkUnit;
  unitLabelEn?: string;
  unitLabelHi?: string;
  domain: StaffWorkDomain;
  /** The sheet flags some tasks as needing dealer/manager approval before doing. Informational. */
  requiresApproval: boolean;
  /** Optional bilingual hint (e.g. "Complete before 10 AM"). */
  notesEn?: string;
  notesHi?: string;
  /** Retire without deleting history. */
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Shape of a row in the seed file (`shared/src/data/staffWorkCatalog.ts`). */
export interface StaffWorkItemSeedItem {
  code: string;
  srNo: number;
  titleEn: string;
  titleHi: string;
  labelEn: string;
  labelHi: string;
  /** Derived snapshot for labour works, typed policy value for incentive works. Optional — the seeder recomputes labour points from the factors. */
  points?: number;
  distribution: StaffPointDistribution;
  pricingMode: StaffPricingMode;
  /** Whole-job minutes (FLAT/SPLIT/EACH) or per-unit minutes (PER_UNIT). Required for labour works. */
  timeMin?: number;
  skill?: number;
  effort?: number;
  responsibility?: number;
  unit?: StaffWorkUnit;
  unitLabelEn?: string;
  unitLabelHi?: string;
  domain: StaffWorkDomain;
  requiresApproval: boolean;
  notesEn?: string;
  notesHi?: string;
}

/* ──────────────────────────────── Employee (dealer-owned) ────────────────────────────────── */

/**
 * A pump worker. A plain dealer-scoped record — NOT a login `User`: no email,
 * no password, no chat thread, never appears in role guards. Owner/manager add
 * these; points are awarded to them.
 */
export interface Employee {
  id: string;
  dealerId: string;
  name: string;
  phone?: string;
  /** Free-text role/designation typed by the owner (e.g. "Attendant"). Single field, not bilingual. */
  designation?: string;
  avatarKey?: string | null;
  status: EmployeeStatus;
  /** The owner/manager User who added this employee. */
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** Employee plus derived point totals, returned by list endpoints for the leaderboard. */
export interface EmployeeWithPoints extends Employee {
  /** Points in the currently-requested window (default: today). */
  pointsInWindow: number;
  /** Lifetime points. */
  totalPoints: number;
  /**
   * Days this worker was marked on leave (छुट्टी) within the requested window.
   * Lets the leaderboard read a 0-point day as "on leave", not "did no work".
   */
  leaveDaysInWindow: number;
  /** Whether this worker is marked on leave for TODAY (IST), independent of the window. */
  onLeaveToday: boolean;
}

/**
 * A day a worker was on leave (छुट्टी). A plain dealer-scoped record: one per
 * (employee, calendar day). Its whole purpose is to explain a 0-point day — a
 * worker on leave did no work because they were off, not because they slacked.
 * Leave never adds or removes points; it is a status flag the leaderboard reads.
 */
export interface EmployeeLeave {
  id: string;
  dealerId: string;
  employeeId: string;
  /** The calendar day off (YYYY-MM-DD, IST). */
  date: string;
  /** Optional reason (e.g. "sick", "wedding"). */
  note?: string;
  createdByUserId: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

/* ───────────────────────────── Point award ledger (immutable-ish) ────────────────────────── */

/**
 * One ledger row: employee X earned N points for work W on date D. Points are
 * COMPUTED server-side from the catalog item's distribution — never trusted
 * from the client. A multi-employee award action writes one row per employee,
 * sharing a `batchId`.
 */
export interface StaffPointAward {
  id: string;
  dealerId: string;
  employeeId: string;

  /* Snapshotted work definition (denormalised so history is stable) */
  workItemCode: string;
  workItemSrNo: number;
  workLabelEn: string;
  workLabelHi: string;
  distribution: StaffPointDistribution;

  /* Point math */
  /** Catalog base (per-unit value for PER_UNIT). */
  basePoints: number;
  /** PER_UNIT quantity (default 1, fractional allowed); absent otherwise. */
  quantity?: number;
  /**
   * Raw rupee amount denormalised for `rupee-1000` unit works, when the award
   * was entered as an amount (`quantity = amountRupees / 1000`). Nullable; kept
   * for hardcopy reconciliation/display. Absent for other works.
   */
  amountRupees?: number;
  /** SPLIT divisor — how many workers shared the job; absent otherwise. */
  splitAmong?: number;
  /** The points THIS employee earned (after split/unit math), rounded to 2 dp. */
  points: number;

  /** The calendar day the work was done (YYYY-MM-DD, IST). Defaults to today. */
  workDate: string;
  note?: string;
  /** Groups rows created by one multi-employee award action. */
  batchId?: string;

  awardedByUserId: string;
  awardedByName?: string;
  createdAt: string;
  updatedAt: string;
}

/* ─────────────────────────────────────── Summary ─────────────────────────────────────────── */

export interface StaffPointsSummaryRow {
  employeeId: string;
  employeeName: string;
  status: EmployeeStatus;
  totalPoints: number;
  awardCount: number;
}

/** Leaderboard for a date window. `targetPoints` is the sheet's per-worker baseline. */
export interface StaffPointsSummary {
  /** Inclusive window bounds (YYYY-MM-DD). */
  from: string;
  to: string;
  targetPoints: number;
  rows: StaffPointsSummaryRow[];
}

/* ──────────────────────────────────── API I/O shapes ─────────────────────────────────────── */

export interface CreateEmployeeInput {
  name: string;
  phone?: string;
  designation?: string;
}

/** One work selected within an award action: a catalog work + optional PER_UNIT quantity. */
export interface AwardStaffWorkSelection {
  workItemCode: string;
  /** PER_UNIT quantity (defaults to 1). Fractional allowed. Ignored for other distributions. */
  quantity?: number;
  /**
   * Raw rupee amount for a `rupee-1000` unit work (e.g. HSD / MS sales). When
   * present the server computes `quantity = amountRupees / 1000` (fractional
   * allowed) and IGNORES any client `quantity`. Persisted denormalised on the
   * award for hardcopy reconciliation. Ignored for non-`rupee-1000` works.
   */
  amountRupees?: number;
  /**
   * What was done. REQUIRED for the catch-all works
   * (`DESCRIPTION_REQUIRED_WORK_CODES`), optional for the rest.
   */
  note?: string;
}

export interface UpdateEmployeeInput {
  name?: string;
  phone?: string;
  designation?: string;
  status?: EmployeeStatus;
}

/** Body for marking a worker on leave. `date` defaults to today (IST) when omitted. */
export interface SetEmployeeLeaveInput {
  /** YYYY-MM-DD; defaults to today (IST). */
  date?: string;
  note?: string;
}

/**
 * Award points for one OR MORE works done by the same set of workers. The server
 * looks up each `items[].workItemCode`, applies its distribution to the selected
 * employees, and writes one StaffPointAward per (employee × work) — all sharing
 * one `batchId`, so a single Undo reverses the whole action.
 *  - SPLIT    : each of the N employees gets basePoints / N.
 *  - EACH/FLAT: each employee gets basePoints.
 *  - PER_UNIT : each employee gets basePoints × quantity.
 */
export interface AwardStaffPointsInput {
  employeeIds: string[];
  /** One or more works the selected workers did in this action. */
  items: AwardStaffWorkSelection[];
  /** YYYY-MM-DD; defaults to today (IST) if omitted. Applies to every work in this action. */
  workDate?: string;
  note?: string;
}

/** Result of an award action: the rows written + a friendly per-employee breakdown. */
export interface AwardStaffPointsResult {
  batchId: string;
  awards: StaffPointAward[];
}

export interface StaffPointsQuery {
  employeeId?: string;
  /** Inclusive window (YYYY-MM-DD). */
  from?: string;
  to?: string;
}

/* ─────────────────────── Draft → Finalize (server-synced) ─────────────────────────────────── */

/**
 * One line of a server-synced draft: a worker did a work, optionally with a
 * PER_UNIT quantity or a raw rupee amount. Points are NOT stored on the entry —
 * they are always recomputed server-side against the dealer's EFFECTIVE work list.
 */
export interface StaffPointDraftEntry {
  employeeId: string;
  workItemCode: string;
  /** PER_UNIT quantity (fractional allowed). Ignored for other distributions. */
  quantity?: number;
  /** Raw rupees for `rupee-1000` works; `quantity = amountRupees / 1000` server-side. */
  amountRupees?: number;
  /**
   * What was actually done. REQUIRED for the catch-all works
   * (`DESCRIPTION_REQUIRED_WORK_CODES`), optional for the rest. Per-entry, not
   * per-batch: a submission can hold several "Other …" works and each needs to
   * say what it was.
   */
  note?: string;
}

/**
 * The single active, server-synced draft for a dealer (at most one — unique on
 * dealerId). The owner/manager builds it up over a shift (autosaved), then
 * finalises it with a hardcopy photo, which writes the immutable award ledger.
 */
export interface StaffPointDraft {
  id: string;
  dealerId: string;
  entries: StaffPointDraftEntry[];
  /** Calendar day the work was done (YYYY-MM-DD, IST). Defaults to today. */
  workDate: string;
  note?: string;
  updatedByUserId: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A draft entry resolved against the dealer's effective work list: the raw entry
 * plus the snapshotted work definition and the server-computed points. `source`
 * says whether the work came from the global default catalog or a dealer custom.
 */
export interface StaffPointDraftLineItem {
  employeeId: string;
  employeeName: string;
  workItemCode: string;
  workLabelEn: string;
  workLabelHi: string;
  distribution: StaffPointDistribution;
  unit?: StaffWorkUnit;
  /** Catalog base (per-unit value for PER_UNIT). */
  basePoints: number;
  /** Effective PER_UNIT quantity (from `quantity` or `amountRupees / 1000`). */
  quantity?: number;
  /** Raw rupees, echoed back for `rupee-1000` works entered as an amount. */
  amountRupees?: number;
  /** SPLIT divisor (# distinct workers sharing this work in the draft). */
  splitAmong?: number;
  /** What was done — always set for the catch-all works, which require it. */
  note?: string;
  /** Server-computed points this line awards, rounded to 2 dp. */
  points: number;
  source: 'default' | 'custom';
}

/** A draft plus its resolved line items and running total — what GET /draft returns. */
export interface StaffPointDraftView {
  /** Draft document id, or null when no draft exists yet. */
  id: string | null;
  dealerId: string;
  entries: StaffPointDraftEntry[];
  /** Each entry resolved against the effective work list, with computed points. */
  lineItems: StaffPointDraftLineItem[];
  workDate: string;
  note?: string;
  totalPoints: number;
  updatedByUserId?: string;
  updatedByName?: string;
  updatedAt?: string;
}

/**
 * A FINALIZED submission: created only on `POST /draft/finalize`. Groups the
 * award rows it wrote (shared `batchId`) and pins the mandatory hardcopy photo
 * for reconciliation. `hardCopyImageUrl` is signed on read.
 */
export interface StaffPointBatch {
  id: string;
  dealerId: string;
  /** The shared batchId stamped onto every StaffPointAward row this batch wrote. */
  batchId: string;
  workDate: string;
  note?: string;
  hardCopyImageKey: string;
  /** Signed download URL for the hardcopy photo; present on read when signable. */
  hardCopyImageUrl?: string;
  totalPoints: number;
  /** Number of award rows written (one per employee × work entry). */
  entryCount: number;
  /** Distinct employees in the batch. */
  employeeCount: number;
  awardedByUserId: string;
  awardedByName?: string;
  createdAt: string;
  updatedAt: string;
}

/* ───────────────── Per-dealer customizable work list + effective list ─────────────────────── */

/**
 * A dealer-authored custom work item overlaid on the global catalog. Awardable
 * exactly like a default item; its label/points are snapshotted onto award rows.
 */
export interface DealerCustomWorkItem {
  /** Dealer-unique code (server-generated, e.g. `custom-<slug>-<short>`). */
  code: string;
  labelEn: string;
  labelHi: string;
  /** Derived from the factors for labour works; a typed policy value for incentive works. */
  points: number;
  distribution: StaffPointDistribution;
  pricingMode: StaffPricingMode;
  timeMin?: number;
  skill?: number;
  effort?: number;
  responsibility?: number;
  unit?: StaffWorkUnit;
  unitLabelEn?: string;
  unitLabelHi?: string;
  domain: StaffWorkDomain;
  active: boolean;
}

/**
 * A dealer's overlay on the global catalog: which default codes are hidden and
 * which custom items are added. One per dealer (unique dealerId).
 */
export interface DealerWorkList {
  id: string;
  dealerId: string;
  /** Global catalog codes hidden for this dealer. */
  hiddenCodes: string[];
  customItems: DealerCustomWorkItem[];
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The unified item a client renders for a dealer: the global active catalog
 * (current version) minus hidden codes, plus active custom items. Same
 * render-projection as a StaffWorkItem, tagged with its `source`.
 */
export interface EffectiveWorkItem {
  code: string;
  /** Sort order. Defaults keep their catalog srNo; customs are ordered after. */
  srNo: number;
  labelEn: string;
  labelHi: string;
  points: number;
  distribution: StaffPointDistribution;
  pricingMode: StaffPricingMode;
  timeMin?: number;
  skill?: number;
  effort?: number;
  responsibility?: number;
  unit?: StaffWorkUnit;
  unitLabelEn?: string;
  unitLabelHi?: string;
  domain: StaffWorkDomain;
  requiresApproval: boolean;
  notesEn?: string;
  notesHi?: string;
  active: boolean;
  source: 'default' | 'custom';
}
