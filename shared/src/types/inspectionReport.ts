/**
 * Inspection Reports — the shared contract for the SDMS "Inspection Reports"
 * aggregation pipeline.
 *
 * IndianOil's e-Mitra portal lists the inspection reports raised against a
 * dealer's retail outlet (routine inspection, SBA, safety, DSO safety). The
 * pipeline logs in as the dealer, opens Inspection Reports ▸ Inspection, and
 * captures the LATEST few reports plus the TOTAL number on the portal — enough
 * for an admin to see "here are the three most recent, and there are N more"
 * without the platform having to mirror the entire inspection history.
 *
 * Like the IRAS Vault, rows are stored generically (`columns` + `cells`) so the
 * portal's own table headers pass through untouched and a column rename on the
 * portal never silently drops data.
 */

/**
 * The rows the portal's "Inspection Reports" navbar dropdown offers. The
 * pipeline ingests one kind per run (`INSPECTION` by default — the first row);
 * the others are modelled so a second kind can be added without a migration.
 */
export const INSPECTION_REPORT_KINDS = ['INSPECTION', 'SBA', 'SAFETY', 'DSO_SAFETY'] as const;
export type InspectionReportKind = (typeof INSPECTION_REPORT_KINDS)[number];

/** Human labels for each kind, matching the portal dropdown wording. */
export const INSPECTION_REPORT_KIND_LABELS: Record<InspectionReportKind, string> = {
  INSPECTION: 'Inspection',
  SBA: 'SBA Inspection',
  SAFETY: 'Safety Inspection',
  DSO_SAFETY: 'DSO Safety Inspection',
};

/**
 * Column metadata as the portal reports it, carried through untouched so the
 * Vault renders the portal's own headers rather than a hardcoded mapping.
 */
export interface InspectionColumn {
  /** Portal field key. Matches the keys in `InspectionReportItem.cells`. */
  field: string;
  /** Human header as shown on the portal, e.g. `Inspection Date`. */
  headerName: string;
}

/** One report row's cells. Values arrive as strings and are kept verbatim. */
export type InspectionRow = Record<string, string>;

/**
 * One section of a captured inspection report — a labelled block of rows.
 *
 * The report (IndianOil Form SL.5(R)) is a stack of tables; each becomes a
 * section. Rows are kept generically (cell strings) so the exact fields survive
 * even as the form changes, and the data stays usable (addressable cells) rather
 * than a flat blob.
 */
export interface InspectionReportSection {
  /** Section heading if the report exposed one, e.g. "Sales Performance". */
  title?: string | null;
  /** Header row, when the section is a table with a header. */
  columns?: string[] | null;
  /** The section's rows, each an array of cell strings. */
  rows: string[][];
}

/**
 * The full report behind a list row's VIEW link — captured and parsed so the
 * data is usable, with the raw HTML retained for audit and an exact download.
 */
export interface InspectionReportDetail {
  /** The report's own reference/serial, matching the row's `ref`. */
  ref?: string | null;
  /** ISO-8601 of when the report was captured. */
  capturedAt?: string | null;
  /** S3 key of the raw report HTML (audit + exact download). */
  htmlKey?: string | null;
  /** Signed URL for the raw report HTML — populated by the API, never stored. */
  htmlUrl?: string | null;
  /** The report parsed into ordered sections, for rendering and data use. */
  sections: InspectionReportSection[];
}

/**
 * One inspection report captured from the portal list.
 *
 * The portal's columns vary, so the identifying fields are best-effort: `ref`
 * and the date are pulled out for sorting and display when recognisable, and the
 * full row is always kept in `cells` so nothing the portal showed is lost.
 */
export interface InspectionReportItem {
  /** Portal reference/serial for the report, when the table exposes one. */
  ref?: string | null;
  /** The report's date exactly as the portal renders it (e.g. `12-08-2026`). */
  dateLabel?: string | null;
  /** Parsed ISO-8601 date if `dateLabel` was recognisable, for sorting. */
  date?: string | null;
  /** The full row, keyed by column field — the source of truth for rendering. */
  cells: InspectionRow;
  /**
   * The full report behind this row's VIEW link, when captured. Absent for rows
   * whose report could not be opened (the row still stands on its own).
   */
  report?: InspectionReportDetail | null;
}

/** Snapshot health, so the Vault can show a status without parsing errors. */
export const INSPECTION_SNAPSHOT_STATUSES = ['COMPLETE', 'PARTIAL', 'FAILED'] as const;
export type InspectionSnapshotStatus = (typeof INSPECTION_SNAPSHOT_STATUSES)[number];

/**
 * One dealer's captured inspection data for one kind — the stored unit.
 *
 * Unlike IRAS (one row per business date), inspection reports are occasional, so
 * there is ONE authoritative snapshot per `(dealerId, kind)` and a re-run
 * upserts it in place with the freshest capture.
 */
export interface InspectionReportSnapshot {
  id: string;
  dealerId: string;
  /** Denormalised for the cross-dealer / list views. */
  dealerCode?: string | null;
  /** RO code as reported by the portal, when available. */
  roCode?: string | null;
  dealerServiceId?: string | null;
  runId?: string | null;
  /** Which dropdown row this snapshot came from (`INSPECTION` today). */
  kind: InspectionReportKind;
  capturedAt: string;
  status: InspectionSnapshotStatus;
  /** Total inspection reports the portal listed for this dealer + kind. */
  total: number;
  /** Column metadata for the captured rows, in portal order. */
  columns: InspectionColumn[];
  /** The most recent reports kept (up to `keepLatest`, default 3), newest first. */
  latest: InspectionReportItem[];
  /** Present when `status !== 'COMPLETE'`; plain language, no stack traces. */
  failureReason?: string | null;
  /** Machine-readable failure category, for dashboards and alerting. */
  failureCode?: string | null;
  /**
   * The most recent failed attempt, retained even on a COMPLETE snapshot — a
   * retry that fails must never delete data already captured.
   */
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
 * What the Vault's Inspection Reports section renders: the latest reports and how
 * many more the portal holds beyond them ("N more inspection reports").
 */
export interface InspectionReportSummary {
  dealerId: string;
  kind: InspectionReportKind;
  status: InspectionSnapshotStatus;
  /** ISO-8601 of the last successful (or attempted) capture, if any. */
  capturedAt?: string | null;
  /** Total inspection reports on the portal for this dealer + kind. */
  total: number;
  /** Column metadata for `latest`, in portal order. */
  columns: InspectionColumn[];
  /** The latest reports kept, newest first (up to 3). */
  latest: InspectionReportItem[];
  /**
   * Reports beyond the ones in `latest` — `max(0, total - latest.length)`.
   * This is the number surfaced as "N more inspection reports".
   */
  moreCount: number;
  /** Present when the latest capture failed; drives the Vault's failure banner. */
  failureReason?: string | null;
}

/**
 * Config stored on `DealerService.config` for the `inspection-reports` plugin.
 * Both fields are optional; the plugin applies the documented defaults.
 */
export interface InspectionReportConfig {
  /** Which dropdown row to ingest. Defaults to `INSPECTION`. */
  kind?: InspectionReportKind;
  /** How many of the latest reports to keep. Defaults to 3. */
  keepLatest?: number;
}
