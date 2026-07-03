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

/** Operational grouping used to make the 66-item work picker navigable. */
export const STAFF_WORK_DOMAINS = [
  'cleaning',
  'du',
  'equipment',
  'automation',
  'tanker',
  'sales',
  'office',
  'customer',
  'misc',
] as const;
export type StaffWorkDomain = (typeof STAFF_WORK_DOMAINS)[number];

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
  /** Base points from the sheet. For PER_UNIT this is the per-unit value. May be fractional (e.g. 0.5). */
  points: number;
  distribution: StaffPointDistribution;
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
  points: number;
  distribution: StaffPointDistribution;
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
  /** PER_UNIT quantity (default 1); absent otherwise. */
  quantity?: number;
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
  /** PER_UNIT quantity (defaults to 1). Ignored for other distributions. */
  quantity?: number;
}

export interface UpdateEmployeeInput {
  name?: string;
  phone?: string;
  designation?: string;
  status?: EmployeeStatus;
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
