/**
 * IRAS Data Vault — the shared contract for the per-dealer FCC data pipeline.
 *
 * The pipeline is deliberately NOT owned by any one service. It logs into the
 * IRAS portal once per dealer per day, pulls a set of FCC reports anchored on
 * that dealer's configured shift time, and stores the curated result as an
 * `IrasDataSnapshot`. Downstream services (sales reconciliation, stock/variance,
 * decantation checks, …) read snapshots instead of each re-scraping the portal.
 *
 * Datasets are keyed by report code and stored generically (`columns` + `rows`)
 * so a new IRAS report can be added to the pipeline without a schema migration
 * or a change to the Vault UI.
 */

/** IRAS FCC report codes the pipeline knows how to collect. */
export const IRAS_REPORT_CODES = ['TOT', 'STK', 'REC'] as const;
export type IrasReportCode = (typeof IRAS_REPORT_CODES)[number];

/**
 * Column metadata as IRAS itself reports it, carried through untouched so the
 * Vault renders the portal's own headers rather than a hardcoded mapping that
 * silently rots when IRAS renames a field.
 */
export interface IrasColumn {
  /** IRAS field key, e.g. `SHIFT_TIME`. Matches the keys in `IrasRow`. */
  field: string;
  /** Human header as shown in the portal, e.g. `Shift Time`. */
  headerName: string;
}

/** One report row. Values arrive from IRAS as strings; they are kept verbatim. */
export type IrasRow = Record<string, string>;

/**
 * One collected report inside a snapshot.
 *
 * `rows` holds the CURATED rows (after the pipeline's shift filter); `rawRowCount`
 * records how many the portal returned before filtering, so a curation bug shows
 * up as a suspicious ratio rather than silently missing data.
 */
export interface IrasDataset {
  code: IrasReportCode;
  /** Portal label, e.g. `Shift Totalizer Record(TOT)`. */
  label: string;
  /** The window sent to the portal, as ISO-8601 strings. */
  window: { from: string; to: string };
  columns: IrasColumn[];
  rows: IrasRow[];
  /** Rows returned by the portal before the pipeline's filter. */
  rawRowCount: number;
  /** Rows kept after the filter (== `rows.length`). */
  rowCount: number;
  /** Human-readable description of the filter applied, for the Vault UI. */
  filterDescription: string;
  /** Storage key of the raw, unfiltered portal response (audit trail). */
  rawStorageKey?: string;
  durationMs?: number;
}

/**
 * The shift the snapshot is anchored on — the single decision every dataset
 * hangs off, surfaced explicitly so an admin can see WHY these rows were kept.
 */
export interface IrasShiftAnchor {
  /** The dealer's configured shift time, `HH:mm:ss`. */
  configuredTime: string;
  /** `configuredTime` on the business date, ISO-8601. */
  anchorAt: string;
  /** `anchorAt` minus the lookback (default 30 min), ISO-8601. The search floor. */
  searchFrom: string;
  /** The chosen closing shift's date as IRAS reports it, `dd-MM-yyyy`. */
  selectedShiftDate: string;
  /** The chosen closing shift's time as IRAS reports it, `HH:mm:ss`. */
  selectedShiftTime: string;
  /** The chosen shift as a single ISO-8601 instant. */
  selectedShiftAt: string;
  /** Every closing-shift time the portal offered, for transparency/debugging. */
  candidateShiftTimes: string[];
}

/** Snapshot health, so the Vault can show a status without parsing errors. */
export const IRAS_SNAPSHOT_STATUSES = ['COMPLETE', 'PARTIAL', 'FAILED'] as const;
export type IrasSnapshotStatus = (typeof IRAS_SNAPSHOT_STATUSES)[number];

/**
 * One dealer's curated FCC data for one business date — the unit other services
 * consume. Unique per `(dealerId, businessDate)`; a re-run upserts in place.
 */
export interface IrasDataSnapshot {
  id: string;
  dealerId: string;
  /** Denormalised for the cross-dealer Vault list. */
  dealerName?: string | null;
  dealerCode?: string | null;
  /** RO code as reported by IRAS (from the data itself, not config). */
  roCode?: string | null;
  dealerServiceId?: string | null;
  runId?: string | null;
  /** IST calendar date the shift belongs to, `YYYY-MM-DD`. */
  businessDate: string;
  capturedAt: string;
  status: IrasSnapshotStatus;
  shift: IrasShiftAnchor;
  /** Keyed by report code so a consumer can ask for exactly what it needs. */
  datasets: Partial<Record<IrasReportCode, IrasDataset>>;
  /** Present when `status !== 'COMPLETE'`; plain language, no stack traces. */
  failureReason?: string | null;
  /** Machine-readable failure category, for dashboards and alerting. */
  failureCode?: string | null;
  /**
   * The most recent failed attempt, retained even on a COMPLETE day.
   *
   * A retry that fails must never delete data already collected, so instead of
   * downgrading the day to FAILED the attempt is recorded here — letting the
   * Vault say "the latest attempt failed" while still showing the real figures.
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
 * Vault list row — a snapshot without its (potentially large) row payloads, so
 * the cross-dealer list stays small. Row data is fetched on drill-in.
 */
export interface IrasDataSnapshotSummary {
  id: string;
  dealerId: string;
  dealerName?: string | null;
  dealerCode?: string | null;
  roCode?: string | null;
  businessDate: string;
  capturedAt: string;
  status: IrasSnapshotStatus;
  selectedShiftTime: string;
  failureReason?: string | null;
  /** Per-report row counts, e.g. `{ TOT: 13, STK: 5, REC: 1 }`. */
  rowCounts: Partial<Record<IrasReportCode, number>>;
}

/** GET /iras-data/overview — the Vault landing summary across all dealers. */
export interface IrasDataVaultOverview {
  /** Dealers with the pipeline attached. */
  dealersConfigured: number;
  /** Dealers with a COMPLETE snapshot for `businessDate`. */
  dealersCollected: number;
  /** Dealers whose most recent snapshot failed. */
  dealersFailed: number;
  /** Dealers configured but with no snapshot at all for `businessDate`. */
  dealersMissing: number;
  businessDate: string;
  /** Most recent capture across all dealers, ISO-8601. */
  lastCapturedAt?: string | null;
}

/** One dealer's line on the Vault landing page. */
export interface IrasDataVaultDealerRow {
  dealerId: string;
  dealerName?: string | null;
  dealerCode?: string | null;
  roCode?: string | null;
  /** Whether the dealer has the pipeline attached and ACTIVE. */
  enabled: boolean;
  /** The dealer's configured shift time, `HH:mm:ss`. */
  configuredShiftTime?: string | null;
  /** Latest snapshot for the requested business date, if any. */
  latest?: IrasDataSnapshotSummary | null;
}
