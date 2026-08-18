/**
 * Water Ingress Testing — the per-day compliance record.
 *
 * The `water-ingress-testing` service marks ONE slot per run, twelve times a
 * day, and each run's own output says only what that run did. This is the shape
 * that answers the question anyone actually asks — "did this outlet comply
 * yesterday, and if not which windows were missed?" — without reading twelve
 * run records and reconstructing the day from them.
 *
 * A slot's window can only be recorded while the clock is inside it, so a missed
 * window is missed for good. That makes the gaps the interesting part of this
 * record, not an omission from it.
 */

/** What a single run did about the window it fired for. */
export const WATER_INGRESS_OUTCOMES = [
  /** Ticked Checked=Y / Water Ingress Found=N and the portal confirmed it. */
  'MARKED',
  /** The window was already filled in — by an earlier run, or by the dealer. */
  'ALREADY_RECORDED',
  /** The clock was in a gap between the outlet's trading windows. */
  'OUTSIDE_OPERATING_HOURS',
  /** The window closed, or was too near closing to save inside it safely. */
  'WINDOW_TOO_LATE',
  /** A rehearsal: everything resolved and verified, nothing clicked. */
  'DRY_RUN',
  /** The run could not complete; see `lastFailure`. */
  'FAILED',
] as const;
export type WaterIngressOutcome = (typeof WATER_INGRESS_OUTCOMES)[number];

/** One observation window of the outlet's day. */
export interface WaterIngressSlotRecord {
  /** The portal's own label, verbatim: "12:00 AM - 02:00 AM". */
  label: string;
  /** Minutes past IST midnight. `endMinutes` may be 1440 (midnight). */
  startMinutes: number;
  endMinutes: number;
  /** Whether the portal shows this window as recorded, however it came to be. */
  recorded: boolean;
  /** The portal's "Updated On" text, verbatim. */
  updatedOn?: string | null;
  /**
   * Set only when THIS service wrote the row. Distinguishes our marks from the
   * ones the dealer's staff entered by hand, which the service never overwrites.
   */
  markedByServiceAt?: string | null;
  /** The run that wrote it. */
  runId?: string | null;
}

/** One dealer's Water Ingress Testing day. */
export interface WaterIngressDayLog {
  id: string;
  dealerId: string;
  dealerCode?: string | null;
  /** IST calendar day, `YYYY-MM-DD`. */
  businessDate: string;
  /** The outlet's trading hours as the portal states them. */
  operating?: { from: string; to: string } | null;
  /** Windows the portal listed for this outlet — twelve for a 24-hour RO. */
  totalSlots: number;
  /** Of those, how many are recorded. */
  recordedSlots: number;
  /** `recordedSlots / totalSlots`, rounded — the portal's own COMPLIANCE figure. */
  compliancePercent: number;
  slots: WaterIngressSlotRecord[];
  lastRunAt: string;
  lastOutcome: WaterIngressOutcome;
  lastFailure?: {
    at: string;
    reason: string;
    code: string;
    runId?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}
