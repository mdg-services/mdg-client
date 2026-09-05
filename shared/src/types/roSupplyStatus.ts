/**
 * RO Supply Status — the shared contract for the SDMS "RO Supply Status" capture.
 *
 * IndianOil's e-Mitra home offers six tiles; one of them, "RO Supply Status",
 * answers the only question a dealer really cares about on a bad morning: is my
 * outlet allowed to be supplied right now. The screen says so in one sentence —
 * "RO Supply is Unblocked in SAP." — and then lists, under "Current Compliance
 * Status in RDB/SDMS", the handful of conditions that can block it, each drawn as
 * a tick or a cross.
 *
 * TWO THINGS ARE MODELLED SEPARATELY ON PURPOSE
 * ---------------------------------------------
 * The sentence and the table are different facts from different systems (SAP and
 * RDB/SDMS), and they can disagree — a compliance row can go bad well before SAP
 * blocks supply, which is precisely the early warning this capture exists to
 * give. So `blocked` comes only from the sentence, `rows` only from the table,
 * and nothing derives one from the other.
 *
 * WHY SO MUCH OF THIS IS NULLABLE
 * -------------------------------
 * Both the sentence and the tick glyphs are free-form output from somebody
 * else's portal, and this one changed shape under us before (the 2026-08-11
 * e-Mitra redesign, LIMITATIONS.md). A boolean with no null state would read a
 * re-worded sentence as "unblocked" and a re-styled icon as "not compliant", and
 * both of those are lies told confidently. `null` / `UNKNOWN` is how this
 * contract says "the portal showed us something we do not recognise" — which an
 * operator can act on, unlike a wrong answer.
 *
 * Rows are kept generically (description verbatim + the mark as drawn + the raw
 * evidence the mark was read from), the same philosophy as the IRAS Vault and
 * Inspection Reports: the portal's own wording passes through untouched, so a
 * renamed condition arrives as a new row rather than silently disappearing.
 */

/** Snapshot health, so the Vault can show a state without parsing failures. */
export const RO_SUPPLY_SNAPSHOT_STATUSES = ['COMPLETE', 'PARTIAL', 'FAILED'] as const;
export type RoSupplySnapshotStatus = (typeof RO_SUPPLY_SNAPSHOT_STATUSES)[number];

/**
 * The mark in the "Compliance Status" column, as the portal DREW it — not as we
 * would like to interpret it.
 *
 * `YES` is a tick, `NO` is a cross, `UNKNOWN` is anything else. Kept at this
 * level rather than as a boolean because the reader is allowed to fail: a cell
 * whose icon we do not recognise must arrive as `UNKNOWN` and be shown as such,
 * never guessed into a cross. A false red on a compliance screen sends someone
 * to the depot for nothing; a blank sends them to look at the portal.
 */
export const RO_COMPLIANCE_MARKS = ['YES', 'NO', 'UNKNOWN'] as const;
export type RoComplianceMark = (typeof RO_COMPLIANCE_MARKS)[number];

/**
 * One row of "Current Compliance Status in RDB/SDMS".
 *
 * A note on how to READ the mark, because the row labels are phrased as problems
 * ("Pending OTP", "Blocked in SDMS-DAR") and a tick beside a problem is
 * ambiguous on its face. The attested capture shows all seven rows ticked while
 * the headline reads "Unblocked", so a TICK means the condition is CLEAR — the
 * problem named is not present. That reading is recorded here rather than baked
 * into a renamed field, so that if a live run ever contradicts it the fix is one
 * comment and one helper rather than a migration.
 */
export interface RoComplianceRow {
  /** Column 1, verbatim, e.g. `Automation data not received`. */
  description: string;
  /** Column 2, decided from the icon / glyph / alt text. */
  mark: RoComplianceMark;
  /**
   * What the mark was decided FROM — the cell's text, class tokens or image alt.
   * Kept so a wrong read is diagnosable from the stored row alone, without
   * re-running the capture against a portal that may have changed again.
   */
  rawMark?: string | null;
}

/** One dealer's captured RO Supply Status, as stored and served. */
export interface RoSupplyStatusSnapshot {
  id: string;
  dealerId: string;
  /** Denormalised for list views — a dealer IS its code. */
  dealerCode?: string | null;
  /** The oil company's numeric outlet number, e.g. `258672`. Never compared to `dealerCode`. */
  roCode?: string | null;
  /** The outlet name as the portal's own header line shows it. */
  roName?: string | null;
  dealerServiceId?: string | null;
  runId?: string | null;
  capturedAt: string;
  status: RoSupplySnapshotStatus;
  /** The headline sentence, verbatim: `RO Supply is Unblocked in SAP.` */
  headline: string | null;
  /**
   * Parsed from {@link headline}. `true` = blocked, `false` = unblocked,
   * `null` = the sentence was not one we recognise. Never derived from the table.
   */
  blocked: boolean | null;
  rows: RoComplianceRow[];
  /** How many rows carry a cross. Cheap for a rail chip and a list column. */
  failingCount: number;
  /** How many rows we could not read at all. A non-zero value is a selector bug. */
  unknownCount: number;
  failureReason?: string | null;
  failureCode?: string | null;
  lastFailure?: {
    at: string;
    reason: string;
    code: string;
    runId?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What the Vault pane renders. Always answerable: a dealer never captured comes
 * back as an empty-but-valid summary rather than a 404, so the pane draws a
 * clean empty state instead of an error.
 */
export interface RoSupplyStatusSummary {
  dealerId: string;
  status: RoSupplySnapshotStatus;
  capturedAt?: string | null;
  roCode?: string | null;
  roName?: string | null;
  headline: string | null;
  blocked: boolean | null;
  rows: RoComplianceRow[];
  failingCount: number;
  unknownCount: number;
  failureReason?: string | null;
  failureCode?: string | null;
}

/** Per-dealer configuration stored on the `ro-supply-status` attachment. */
export interface RoSupplyStatusConfig {
  /** Write a screenshot at each phase. Off by default — it costs S3 on every run. */
  debugScreenshots?: boolean;
}

/**
 * Is this row's condition CLEAR?
 *
 * The one place the tick-means-clear reading lives, so the pane, any future
 * dealer-facing surface and any scoring that grows on top of this all answer it
 * identically. Returns `null` for an unreadable mark rather than assuming.
 */
export function isRoComplianceClear(row: RoComplianceRow): boolean | null {
  if (row.mark === 'YES') return true;
  if (row.mark === 'NO') return false;
  return null;
}

/**
 * One line an operator can read without opening the table.
 *
 * Deliberately refuses to be cheerful when it does not know: an unreadable
 * headline says so, rather than falling back to the table and implying the
 * portal confirmed something it did not.
 */
export function roSupplyHeadlineLabel(summary: {
  blocked: boolean | null;
  headline: string | null;
}): string {
  if (summary.blocked === true) return 'Supply is BLOCKED in SAP';
  if (summary.blocked === false) return 'Supply is unblocked in SAP';
  return summary.headline
    ? `The portal said: “${summary.headline}”`
    : 'The portal did not show a supply status';
}
