import type { MessageKey } from '@/lib/i18n';
import type {
  EffectiveWorkItem,
  StaffPointDistribution,
  StaffPointDraftEntry,
  StaffPointDraftLineItem,
  StaffWorkDomain,
  StaffWorkUnit,
} from '@dk/shared/types';


/**
 * Client-side helpers for the Staff Points feature: IST calendar dates for the
 * leaderboard windows, the point maths mirrored from the server's distribution
 * rules (for a live preview + optimistic totals — the server stays authoritative),
 * and the domain → i18n label mapping used to group the 66-item work picker.
 */

/** YYYY-MM-DD for a date in IST (Asia/Kolkata) — the calendar day the pump runs on. */
export function istDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/** First day of the current IST month, YYYY-MM-DD. */
export function istMonthStart(d: Date = new Date()): string {
  return `${istDate(d).slice(0, 8)}01`;
}

/** Round to 2 decimal places (points may be fractional, e.g. a 40 ÷ 3 split). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Points as a clean string: integers plain, fractions trimmed (13.30 → 13.3). */
export function fmtPoints(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n
    .toFixed(2)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

/**
 * The minimal shape the point-maths needs. Both the global `StaffWorkItem` and a
 * dealer's `EffectiveWorkItem` satisfy it, so the same helpers drive the wizard
 * preview, the pending-submission panel, and (historically) the optimistic bump.
 */
export interface PointWork {
  points: number;
  distribution: StaffPointDistribution;
  unit?: StaffWorkUnit;
}

/** A `rupee-1000` work is entered as an actual ₹ amount, not a ± unit count. */
export function isRupeeWork(work: Pick<PointWork, 'unit'>): boolean {
  return work.unit === 'rupee-1000';
}

/**
 * Points a single selected worker earns — mirrors the server's distribution
 * rules (ADR 0007 §Decision 3). Client input never overrides the server; this is
 * only for the live preview and the pending-panel totals. For a `rupee-1000`
 * work pass `quantity = amountRupees / 1000`.
 */
export function perEmployeePoints(
  item: PointWork,
  count: number,
  quantity?: number,
): number {
  switch (item.distribution) {
    case 'SPLIT':
      return round2(item.points / Math.max(1, count));
    case 'PER_UNIT':
      return round2(item.points * (quantity && quantity > 0 ? quantity : 1));
    case 'EACH':
    case 'FLAT':
    default:
      return item.points;
  }
}

/**
 * Total points written by one award action, summed across every selected worker
 * — i.e. the ledger sum. For SPLIT this is base (each worker's share × count);
 * for EACH/PER_UNIT/FLAT it's each worker's points × count.
 */
export function totalAwardPoints(
  item: PointWork,
  count: number,
  quantity?: number,
): number {
  return round2(perEmployeePoints(item, count, quantity) * count);
}

/**
 * A chosen work plus its (optional) PER_UNIT quantity OR raw rupee amount (for
 * `rupee-1000` works). The wizard/pending panel work in this unit; the server
 * recomputes points from the effective work list, so this is preview-only.
 */
export interface WorkSelection {
  item: PointWork;
  quantity?: number;
  /** Raw ₹ amount for a `rupee-1000` work; `quantity = amountRupees / 1000`. */
  amountRupees?: number;
}

/**
 * The effective PER_UNIT quantity for a selection: an explicit `amountRupees`
 * for a `rupee-1000` work becomes `amountRupees / 1000`, otherwise the plain
 * `quantity`. Used everywhere the preview maths needs a single "how many".
 */
export function effectiveQuantity(sel: WorkSelection): number | undefined {
  if (isRupeeWork(sel.item)) {
    return sel.amountRupees != null ? sel.amountRupees / 1000 : undefined;
  }
  return sel.quantity;
}

/** Points a single worker earns across several works — preview + panel totals. */
export function perEmployeePointsForWorks(
  works: WorkSelection[],
  count: number,
): number {
  return round2(
    works.reduce(
      (sum, w) => sum + perEmployeePoints(w.item, count, effectiveQuantity(w)),
      0,
    ),
  );
}

/** Ledger sum across several works for the whole worker set — running total + confirm button. */
export function totalAwardPointsForWorks(
  works: WorkSelection[],
  count: number,
): number {
  return round2(
    works.reduce(
      (sum, w) => sum + totalAwardPoints(w.item, count, effectiveQuantity(w)),
      0,
    ),
  );
}

/* ─────────────────────────── Draft line resolution ──────────────────────────── */

/** A draft entry resolved for display: worker + work + computed points. */
export interface DraftLine {
  employeeId: string;
  employeeName: string;
  workItemCode: string;
  labelEn: string;
  labelHi: string;
  distribution: StaffPointDistribution;
  unit?: StaffWorkUnit;
  quantity?: number;
  amountRupees?: number;
  /** SPLIT divisor — distinct workers sharing this work across the whole draft. */
  splitAmong?: number;
  /** What was done — always present for the catch-all works, which require it. */
  note?: string;
  points: number;
}

/** Minimal roster shape the resolver needs (id → name). */
export interface NamedEmployee {
  id: string;
  name: string;
}

// Keyed by description too, so two differently-described "Other" jobs for the
// same worker resolve against their own server line instead of both matching the
// first one. Mirrors the server's merge key.
const lineKey = (employeeId: string, workItemCode: string, note?: string): string =>
  `${employeeId}::${workItemCode}::${note ?? ''}`;

/**
 * Resolve the persisted draft `entries` against the dealer's effective work list
 * and roster into display lines with client-computed points — instant and
 * offline-safe, mirroring the server's distribution maths. When a work item or
 * name can't be resolved locally (e.g. offline after a reload before the
 * catalog/roster refetch), the last server-resolved `fallback` lines fill in.
 * The server stays authoritative: these numbers are recomputed on finalize.
 */
export function buildDraftLines(
  entries: StaffPointDraftEntry[],
  workItems: EffectiveWorkItem[],
  employees: NamedEmployee[],
  fallback?: StaffPointDraftLineItem[],
): DraftLine[] {
  const workByCode = new Map(workItems.map((w) => [w.code, w]));
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const fallbackByKey = new Map(
    (fallback ?? []).map((l) => [lineKey(l.employeeId, l.workItemCode, l.note), l]),
  );

  // Distinct workers sharing each SPLIT work across the whole draft = the divisor.
  const splitWorkers = new Map<string, Set<string>>();
  for (const e of entries) {
    const w = workByCode.get(e.workItemCode);
    if (w?.distribution !== 'SPLIT') continue;
    const set = splitWorkers.get(e.workItemCode) ?? new Set<string>();
    set.add(e.employeeId);
    splitWorkers.set(e.workItemCode, set);
  }

  return entries.map((e) => {
    const w = workByCode.get(e.workItemCode);
    const fb = fallbackByKey.get(lineKey(e.employeeId, e.workItemCode, e.note));
    const employeeName = nameById.get(e.employeeId) ?? fb?.employeeName ?? '';

    if (!w) {
      // Fall back to the last server-resolved line, else a bare placeholder.
      return {
        employeeId: e.employeeId,
        employeeName,
        workItemCode: e.workItemCode,
        labelEn: fb?.workLabelEn ?? e.workItemCode,
        labelHi: fb?.workLabelHi ?? e.workItemCode,
        distribution: fb?.distribution ?? 'FLAT',
        unit: fb?.unit,
        quantity: e.quantity ?? fb?.quantity,
        amountRupees: e.amountRupees ?? fb?.amountRupees,
        splitAmong: fb?.splitAmong,
        note: e.note ?? fb?.note,
        points: fb?.points ?? 0,
      };
    }

    const isRupee = isRupeeWork(w);
    const effQty = isRupee
      ? (e.amountRupees ?? 0) / 1000
      : e.quantity ?? 1;
    let splitAmong: number | undefined;
    let points: number;
    switch (w.distribution) {
      case 'SPLIT':
        splitAmong = splitWorkers.get(e.workItemCode)?.size ?? 1;
        points = round2(w.points / Math.max(1, splitAmong));
        break;
      case 'PER_UNIT':
        points = round2(w.points * effQty);
        break;
      default:
        points = w.points;
    }

    return {
      employeeId: e.employeeId,
      employeeName,
      workItemCode: e.workItemCode,
      labelEn: w.labelEn,
      labelHi: w.labelHi,
      distribution: w.distribution,
      unit: w.unit,
      quantity: e.quantity,
      amountRupees: e.amountRupees,
      splitAmong,
      note: e.note,
      points,
    };
  });
}

/** Running total across all draft lines (client preview; server recomputes). */
export function draftLinesTotal(lines: DraftLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.points, 0));
}

/** i18n label key for each work domain (plain, bilingual group headers). */
export const DOMAIN_LABEL_KEY: Record<StaffWorkDomain, MessageKey> = {
  cleaning: 'staff.domain.cleaning',
  du: 'staff.domain.du',
  equipment: 'staff.domain.equipment',
  automation: 'staff.domain.automation',
  tanker: 'staff.domain.tanker',
  sales: 'staff.domain.sales',
  office: 'staff.domain.office',
  customer: 'staff.domain.customer',
  misc: 'staff.domain.misc',
};
