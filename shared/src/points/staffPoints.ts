/**
 * Staff work-point derivation — the single source of truth for turning a labour
 * work's four factors into its base points. Used by the seeder, the super-admin
 * catalog write endpoints, the dealer work-list write endpoint, and the admin
 * form live-previews, so every surface produces byte-identical numbers.
 *
 *   basePoints = round( timeMin × Skill × Effort × Responsibility ÷ K )
 *
 * The three quality factors are entered 0–100 and scaled to a multiplier:
 *   Skill          S = 1 + 1.2 × (skill/100)          → 1.0 … 2.2
 *   Effort         E = 1 + 0.5 × (effort/100)         → 1.0 … 1.5
 *   Responsibility R = 1 + 0.8 × (responsibility/100) → 1.0 … 1.8
 *
 * `timeMin` is real minutes: whole-job time for FLAT/SPLIT/EACH, per-unit time
 * for PER_UNIT (mirrors how `computeAwardPoints` later applies distribution).
 *
 * IMPORTANT: `STAFF_POINTS_K` is a FROZEN calibration constant. It must NEVER be
 * recomputed from the live catalog — if it were, editing one work's factors would
 * silently re-price every other work. It was fixed once so the catalog total is
 * preserved (daily target ~100) at ≈5.37 minutes of ordinary work per point.
 */

/** Frozen calibration constant. ~5.37 min of ordinary (unskilled, light, low-stakes) work = 1 point. */
export const STAFF_POINTS_K = 5.3735;

/** Smallest points an active awardable work can be worth (keeps tiny per-unit works from rounding to 0). */
export const STAFF_MIN_POINTS = 0.5;

/**
 * The catalog codes priced by business policy, NOT the labour formula. Their
 * `points` are typed (sales / customer-acquisition incentives) and left as-is.
 * Single source of truth — referenced by the seeder and any pricing-mode default.
 */
export const INCENTIVE_WORK_CODES = new Set<string>([
  'sell-hsd-xtragreen-per-1000',
  'sell-ms-xp95-per-1000',
  'add-customer-extra-reward',
  'sell-servo-mobil-item',
  'add-new-customer',
]);

/** Factor → multiplier maps (0–100 input). Exported for form previews / labels. */
export const skillMultiplier = (skill: number): number => 1 + 1.2 * (clamp100(skill) / 100);
export const effortMultiplier = (effort: number): number => 1 + 0.5 * (clamp100(effort) / 100);
export const responsibilityMultiplier = (r: number): number => 1 + 0.8 * (clamp100(r) / 100);

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * Catalog-friendly rounding: 0.5 steps below 10, whole numbers to 50, nearest 5
 * above. Keeps the point list clean while preserving the fractional per-unit works.
 */
export function roundStaffPoints(value: number): number {
  if (value < 10) return Math.round(value * 2) / 2;
  if (value < 50) return Math.round(value);
  return Math.round(value / 5) * 5;
}

export interface DeriveBasePointsArgs {
  timeMin: number;
  skill: number;
  effort: number;
  responsibility: number;
}

/**
 * Derive a labour work's base points from its factors. Result is floored at
 * STAFF_MIN_POINTS so an active work is always worth awarding. Do NOT call this
 * for incentive works — their points are a typed policy value.
 */
export function deriveBasePoints({
  timeMin,
  skill,
  effort,
  responsibility,
}: DeriveBasePointsArgs): number {
  const t = Number.isFinite(timeMin) && timeMin > 0 ? timeMin : 0;
  const raw =
    (t *
      skillMultiplier(skill) *
      effortMultiplier(effort) *
      responsibilityMultiplier(responsibility)) /
    STAFF_POINTS_K;
  return Math.max(STAFF_MIN_POINTS, roundStaffPoints(raw));
}

/**
 * Resolve the authoritative base points for a work at write time: derive from
 * factors for labour works, use the typed value for incentive works. This is the
 * function every write endpoint should call so a stored `points` can never drift
 * from the factors.
 */
export function resolveBasePoints(item: {
  pricingMode: 'labour' | 'incentive';
  points?: number;
  timeMin?: number;
  skill?: number;
  effort?: number;
  responsibility?: number;
}): number {
  if (item.pricingMode === 'incentive') {
    return Number.isFinite(item.points) ? (item.points as number) : 0;
  }
  return deriveBasePoints({
    timeMin: item.timeMin ?? 0,
    skill: item.skill ?? 0,
    effort: item.effort ?? 0,
    responsibility: item.responsibility ?? 0,
  });
}
