import type { KavachItem, KavachItemStatus } from '@dk/shared/types';

/**
 * Dealer-facing status presentation. We NEVER show raw enums (VALID/EXPIRED) or
 * dates-as-jargon — only warm, bilingual pills (spec §4 / uxDesign §1.4).
 */
export interface FriendlyStatus {
  labelEn: string;
  labelHi: string;
  /** Tailwind classes for a soft semantic pill. */
  pill: string;
  /** Tailwind classes for the icon tile. */
  tile: string;
}

export const STATUS_READY: FriendlyStatus = {
  labelEn: 'Ready',
  labelHi: 'तैयार',
  pill: 'bg-success-soft text-success',
  tile: 'bg-success-soft text-success',
};

export const STATUS_DUE_SOON: FriendlyStatus = {
  labelEn: 'Due soon',
  labelHi: 'जल्द',
  pill: 'bg-warning-soft text-warning',
  tile: 'bg-warning-soft text-warning',
};

export const STATUS_OVERDUE: FriendlyStatus = {
  labelEn: 'Overdue',
  labelHi: 'बाकी है',
  pill: 'bg-danger-soft text-danger',
  tile: 'bg-danger-soft text-danger',
};

export function friendlyStatus(status: KavachItemStatus): FriendlyStatus {
  switch (status) {
    case 'EXPIRED':
      return STATUS_OVERDUE;
    case 'EXPIRING_SOON':
      return STATUS_DUE_SOON;
    default:
      return STATUS_READY;
  }
}

/** Items that need the dealer's attention today: expiring soon or overdue. */
export function isDueToday(item: KavachItem): boolean {
  if (item.paused) return false;
  if (item.trigger === 'SOS') return false;
  return item.status === 'EXPIRING_SOON' || item.status === 'EXPIRED';
}

/** SOS items — event-driven, shown as a muted explainer, never a daily chore. */
export function isSos(item: KavachItem): boolean {
  return item.trigger === 'SOS' && !item.paused;
}

/** Overdue first, then due soon; within each, highest-points first. */
export function byUrgency(a: KavachItem, b: KavachItem): number {
  const rank = (s: KavachItemStatus) => (s === 'EXPIRED' ? 0 : 1);
  const r = rank(a.status) - rank(b.status);
  if (r !== 0) return r;
  return b.points - a.points;
}
