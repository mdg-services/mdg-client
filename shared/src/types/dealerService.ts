import type { Cadence, DealerServiceStatus } from './enums';

export interface DealerService {
  id: string;
  dealerId: string;
  /** Plugin slug, matches ServicePlugin.id. */
  serviceId: string;
  /** Config validated against the plugin's defaultConfigSchema. */
  config: Record<string, unknown>;
  cadence: Cadence;
  /** Derived cron expression. May be overridden by customCron. */
  schedule: string;
  customCron?: string;
  status: DealerServiceStatus;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachServiceInput {
  serviceId: string;
  config: Record<string, unknown>;
  /** Optional override of plugin's default cadence. */
  cadence?: Cadence;
  customCron?: string;
}

export interface UpdateDealerServiceInput {
  config?: Record<string, unknown>;
  cadence?: Cadence;
  customCron?: string;
  status?: DealerServiceStatus;
}

/**
 * Where one dealer stands on one service, reduced to the single fact a roster
 * can usefully show: has this period's work been produced, and has the dealer
 * actually been given it.
 *
 * Derived on the server rather than in each screen, so "sent" means the same
 * thing everywhere. The producing services keep their own record of the send —
 * the DSR report's `shared`, the Credit & DOD snapshot's `shared` — and those
 * two records disagree about field names but not about meaning; this collapses
 * both into one word.
 */
export type DealerServiceState =
  /** The service is not attached to this dealer at all. */
  | 'NOT_ATTACHED'
  /** Attached but switched off — nothing is running and nothing will. */
  | 'PAUSED'
  /** A run is in flight right now. */
  | 'RUNNING'
  /** The most recent run failed, and failed AFTER the last thing it produced. */
  | 'FAILED'
  /** Attached and running, but it has never produced anything yet. */
  | 'PENDING'
  /** Produced, and the dealer has NOT been sent it. */
  | 'GENERATED'
  /** Produced and sent; the dealer holds the current version. */
  | 'SENT'
  /** The dealer holds a version that is no longer the right one. */
  | 'RESEND'
  /** Ran successfully — for services that produce no dealer deliverable. */
  | 'DONE';

export interface DealerServiceSummaryEntry {
  /** Plugin slug, matches ServicePlugin.id. */
  serviceId: string;
  state: DealerServiceState;
  /** When this state began — generated at / sent at / ran at. */
  at?: string;
  /**
   * One short line of why, present only when the state alone is not enough:
   * the failure message, or what made a sent report out of date.
   */
  note?: string;
  /**
   * The period this state is ABOUT, when that is not simply "the latest" —
   * Water Ingress Testing's two-hour observation window, verbatim as the portal
   * labels it ("12:00 AM - 02:00 AM"). A service marks one window per run, so
   * "it ran" and "which window it marked" are different facts and the second is
   * the one an operator is checking.
   */
  covers?: string;
}

export interface DealerServiceSummary {
  dealerId: string;
  services: DealerServiceSummaryEntry[];
}

/**
 * The services the dealer roster carries a column for, in column order.
 *
 * Deliberately a fixed list rather than "every attached plugin": the roster is a
 * scanning screen, and a column set that changes shape as plugins are attached
 * cannot be scanned. `delivers` marks the ones that end in a human sending
 * something to the dealer — only those can ever read SENT or GENERATED; the
 * rest ran or they did not.
 */
export interface RosterServiceSpec {
  id: string;
  /** Column heading. */
  label: string;
  /** Shortened heading for narrow screens. */
  shortLabel: string;
  /** True when an admin has to send the output to the dealer. */
  delivers: boolean;
}

export const ROSTER_SERVICES: readonly RosterServiceSpec[] = [
  {
    id: 'dsr-report',
    label: 'DSR & variation',
    shortLabel: 'DSR',
    delivers: true,
  },
  {
    id: 'credit-dod-monitoring',
    label: 'Credit & DOD',
    shortLabel: 'Credit',
    delivers: true,
  },
  {
    id: 'inspection-reports',
    label: 'Inspection',
    shortLabel: 'Inspect',
    delivers: false,
  },
  {
    id: 'water-ingress-testing',
    label: 'Water ingress',
    shortLabel: 'Water',
    delivers: false,
  },
] as const;
