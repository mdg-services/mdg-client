import type { StaffWorkDomain, StaffWorkItem } from '@dk/shared/types';

import type { MessageKey } from '@/lib/i18n';

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
 * Points a single selected worker earns — mirrors the server's distribution
 * rules (ADR 0007 §Decision 3). Client input never overrides the server; this is
 * only for the live preview and the optimistic leaderboard bump.
 */
export function perEmployeePoints(
  item: StaffWorkItem,
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
  item: StaffWorkItem,
  count: number,
  quantity?: number,
): number {
  return round2(perEmployeePoints(item, count, quantity) * count);
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
