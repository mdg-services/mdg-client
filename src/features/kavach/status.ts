import {
  FileCheck2,
  FileText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import type { MessageKey } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import {
  KAVACH_PENDING_STATUSES,
  type KavachItem,
  type KavachItemStatus,
} from '@dk/shared/types';

/**
 * Dealer-facing presentation of a Kavach task.
 *
 * The old version of this file sorted tasks by how late they were, because the
 * dealer was the one who closed them. Since ADR 0011 they close nothing, so the
 * only question a card has to answer is WHO THIS IS WAITING ON — them, or us.
 * Two tasks that are equally overdue can sit on opposite sides of that line and
 * mean opposite things, and a list that colours both red tells the dealer they
 * are failing at work that is sitting in our own queue.
 *
 * Raw enums (VALID/EXPIRED) and dates-as-jargon still never reach the screen:
 * labels are catalog keys resolved through `t()` (ADR 0008).
 */

/** Whose side a task is sitting on right now. The one axis this screen sorts by. */
export type KavachWaitingOn =
  /** MDG asked for a photo (or sent one back). Their turn. */
  | 'YOU'
  /** They sent something; nobody has ruled on it. Ours, and visibly so. */
  | 'SENT'
  /** Ours: an admin or an automation owes this a check. */
  | 'MDG'
  /** Ours, and broken: the automation that proves it could not run. */
  | 'OURS';

export function waitingOn(item: KavachItem): KavachWaitingOn {
  if (item.status === 'HELD') return 'OURS';
  // An item serialised by an older API has no request block at all, and this
  // function runs for every row on the dealer's only compliance screen.
  const state = item.request?.state ?? 'NONE';
  if (state === 'ASKED' || state === 'REJECTED') return 'YOU';
  if (state === 'SUBMITTED') return 'SENT';
  return 'MDG';
}

/** MDG is waiting on a photo or a note from this dealer. Their only real action. */
export function needsDealerEvidence(item: KavachItem): boolean {
  return !item.paused && waitingOn(item) === 'YOU';
}

/** The dealer has sent something and nobody at MDG has ruled on it yet. */
export function isAwaitingReview(item: KavachItem): boolean {
  return !item.paused && waitingOn(item) === 'SENT';
}

const PENDING = new Set<KavachItemStatus>(KAVACH_PENDING_STATUSES);

/**
 * Outstanding work. Read from the shared list so the dealer's "still pending"
 * and the admin queue can never disagree about what is outstanding.
 */
export function isPending(item: KavachItem): boolean {
  return !item.paused && PENDING.has(item.status);
}

/**
 * HELD is a COMPLIANT status and deliberately absent from the pending list: a
 * collection that could not run is our failure and must not cost the dealer a
 * point. It is still listed on this screen, last and phrased as ours, because
 * the alternative is a task that silently disappears for weeks and is next seen
 * on an inspector's notice.
 */
export function isHeld(item: KavachItem): boolean {
  return !item.paused && item.status === 'HELD';
}

/**
 * Event-driven tasks with nothing wrong: one muted collapsed explainer, never a
 * daily chore. A flagged one is a live non-compliance and belongs in the
 * pending list instead — `KAVACH_PENDING_STATUSES` already carries it there.
 */
export function isSos(item: KavachItem): boolean {
  return item.trigger === 'SOS' && !item.paused && item.status !== 'SOS_FLAGGED';
}

/** Soft semantic pill + icon tile for one task. */
export interface FriendlyStatus {
  /** i18n catalog key for the pill label. */
  labelKey: MessageKey;
  pill: string;
  tile: string;
}

// Colour follows WHO it waits on, not how late it is. Amber is the only tone
// that asks the dealer for anything; everything sitting in our own queue is
// deliberately quiet, because a red badge on our backlog reads as their failure.
const TONE: Record<KavachWaitingOn, Omit<FriendlyStatus, 'labelKey'>> = {
  YOU: { pill: 'bg-warning-soft text-warning', tile: 'bg-warning-soft text-warning' },
  SENT: { pill: 'bg-info-soft text-info', tile: 'bg-info-soft text-info' },
  MDG: { pill: 'bg-surface-2 text-text-muted', tile: 'bg-surface-2 text-text-muted' },
  OURS: { pill: 'bg-surface-2 text-text-muted', tile: 'bg-surface-2 text-text-muted' },
};

function labelKeyFor(item: KavachItem, wait: KavachWaitingOn): MessageKey {
  if (wait === 'OURS') return 'kavach.statusOnUs';
  if (wait === 'SENT') return 'kavach.statusSent';
  if (wait === 'YOU') return 'kavach.statusYourTurn';
  switch (item.status) {
    case 'NOT_YET_VERIFIED':
      return 'kavach.statusNotChecked';
    case 'SOS_FLAGGED':
      return 'kavach.statusFlagged';
    case 'EXPIRED':
      return 'kavach.statusOverdue';
    case 'EXPIRING_SOON':
      return 'kavach.statusDueSoon';
    default:
      return 'kavach.statusReady';
  }
}

export function friendlyStatus(item: KavachItem): FriendlyStatus {
  const wait = waitingOn(item);
  return { ...TONE[wait], labelKey: labelKeyFor(item, wait) };
}

const WAIT_RANK: Record<KavachWaitingOn, number> = {
  YOU: 0,
  SENT: 1,
  MDG: 2,
  OURS: 3,
};

const STATUS_RANK: Partial<Record<KavachItemStatus, number>> = {
  SOS_FLAGGED: 0,
  EXPIRED: 1,
  EXPIRING_SOON: 2,
  NOT_YET_VERIFIED: 3,
  HELD: 4,
};

/** Their turn first, then ours; within each, the most overdue, then the heaviest. */
export function byUrgency(a: KavachItem, b: KavachItem): number {
  const w = WAIT_RANK[waitingOn(a)] - WAIT_RANK[waitingOn(b)];
  if (w !== 0) return w;
  const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (s !== 0) return s;
  return b.points - a.points;
}

function verifiedMs(item: KavachItem): number {
  const t = item.lastVerifiedAt ? Date.parse(item.lastVerifiedAt) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Tasks somebody at MDG has actually checked, newest first.
 *
 * The dealer payload carries no `history` (it is capped at 50 rows per task and
 * would drag a year of photos across a 2G link), so this reads `lastVerifiedAt`
 * — the one provenance field that survives the dealer serialiser.
 */
export function recentlyChecked(items: KavachItem[]): KavachItem[] {
  return items
    .filter((it) => !it.paused && verifiedMs(it) > 0)
    .sort((a, b) => verifiedMs(b) - verifiedMs(a));
}

/** "24 अगस्त" / "24 Aug", in IST — the clock every figure in this product uses. */
export function checkedDateLabel(lang: Lang, iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(t)) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(t));
  } catch {
    return '';
  }
}

export function taskIcon(domain: KavachItem['domain']): LucideIcon {
  if (domain === 'safety') return ShieldCheck;
  if (domain === 'statutory-license' || domain === 'documentation-display') {
    return FileText;
  }
  return FileCheck2;
}
