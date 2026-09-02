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
 * The portal's own label for each report. Lives here rather than only in the
 * collector's registry because a dataset built entirely by hand — a delivery the
 * portal never sent, on a day it returned no receipt rows at all — has to be
 * labelled the same way as a collected one, and two spellings of "Receipt (REC)"
 * would show up as two different reports in the Vault.
 */
export const IRAS_REPORT_LABELS: Record<IrasReportCode, string> = {
  TOT: 'Shift Totalizer Record (TOT)',
  STK: 'Stock (STK)',
  REC: 'Receipt (REC)',
};

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

/**
 * Who put a day's figures there.
 *
 * `PORTAL` — collected from IndianOil's IRAS site, the normal path.
 * `MANUAL` — typed in by an admin, because this outlet's portal automation does
 * not exist. 16E is the case: onboarded with no IRAS account, keeping its DSR in
 * a macro workbook, and needing the same report as everyone else.
 *
 * Recorded rather than inferred, because four separate behaviours turn on it and
 * every one of them is wrong by default. A hand day holds no portal rows, so
 * without this marker it is indistinguishable from a day a failed collection
 * emptied — and the report would tell the dealer "IRAS reported 0 L" about a
 * portal nobody ever asked.
 */
export const IRAS_SNAPSHOT_SOURCES = ['PORTAL', 'MANUAL'] as const;
export type IrasSnapshotSource = (typeof IRAS_SNAPSHOT_SOURCES)[number];
export type IrasSnapshotStatus = (typeof IRAS_SNAPSHOT_STATUSES)[number];

/**
 * One dealer's curated FCC data for one business date — the unit other services
 * consume. Unique per `(dealerId, businessDate)`; a re-run upserts in place.
 */
export interface IrasDataSnapshot {
  id: string;
  dealerId: string;
  /** Denormalised for the cross-dealer Vault list. */
  dealerCode?: string | null;
  /** RO code as reported by IRAS (from the data itself, not config). */
  roCode?: string | null;
  dealerServiceId?: string | null;
  runId?: string | null;
  /** IST calendar date the shift belongs to, `YYYY-MM-DD`. */
  businessDate: string;
  capturedAt: string;
  status: IrasSnapshotStatus;
  /**
   * Where the figures came from; see {@link IRAS_SNAPSHOT_SOURCES}. Absent on
   * documents written before hand entry existed — read a missing value as
   * `PORTAL`, which is what they all were.
   */
  source?: IrasSnapshotSource;
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

/* ───────────────────────────── hand corrections ─────────────────────────────
 *
 * The portal is the source of this data, and the portal is sometimes wrong: a
 * tanker decants but nobody enters it at the outlet, a totaliser is keyed in
 * transposed, a dip is written against the wrong tank. Those figures are what
 * the Daily Sales Report judges a dealer's stock variation on, so an admin has
 * to be able to state the real number.
 *
 * Corrections are an OVERLAY, never a write into the snapshot. `saveSnapshot`
 * upserts by `(dealerId, businessDate)` and replaces `datasets` wholesale, so
 * anything written into the snapshot is destroyed by the next collection of that
 * day — the operator's work would vanish and a dealer's report would silently
 * revert. Keeping the correction beside the snapshot also keeps the answer to
 * "what did the portal actually say?" available forever, which is the whole
 * basis for trusting a corrected report.
 */

export const IRAS_CORRECTION_KINDS = ['FIELD', 'ADDED_ROW', 'EXCLUDED_ROW'] as const;
export type IrasCorrectionKind = (typeof IRAS_CORRECTION_KINDS)[number];

/**
 * The `field` value on a row-level correction (an added or excluded row).
 *
 * A sentinel rather than an empty string so the uniqueness key
 * `(dealer, date, code, rowKey, field)` still admits one row-level correction
 * ALONGSIDE the row's per-field ones, and so a row-level document is obvious in
 * the database rather than looking like a field correction that lost its name.
 */
export const IRAS_ROW_LEVEL_FIELD = '*';

/**
 * How a correction's row is identified, which decides how cautious the apply
 * step has to be when the portal re-sends the day. See `irasRowKeys`.
 */
export const IRAS_ROW_KEY_STRENGTHS = ['txn', 'natural', 'ordinal', 'index'] as const;
export type IrasRowKeyStrength = (typeof IRAS_ROW_KEY_STRENGTHS)[number];

/** One hand correction to one dealer-day's collected data. */
export interface IrasDataCorrection {
  id: string;
  dealerId: string;
  businessDate: string;
  code: IrasReportCode;
  /** Stable row identity — see `irasRowKeys`. `add:<id>` for a hand-added row. */
  rowKey: string;
  /** How `rowKey` was derived, recorded so apply-time can be strict about weak keys. */
  keyStrength: IrasRowKeyStrength;
  /** Human row identity for the orphan list, e.g. `Nozzle 5`, `Tank 2`. */
  rowLabel: string;
  kind: IrasCorrectionKind;
  /** The IRAS field key, or {@link IRAS_ROW_LEVEL_FIELD} for a row-level change. */
  field: string;
  /** What the portal said for this cell when the correction was made. */
  portalValue: string | null;
  /** What it should be. Null for a row-level correction. */
  value: string | null;
  /** The whole hand-entered row — `ADDED_ROW` only. */
  row?: IrasRow | null;
  /** Rows the dataset held when the correction was made; guards weak row keys. */
  rowCountAtEdit: number;
  /** Why, in one line. Required at commit time and stamped on every correction in it. */
  reason: string;
  by: string;
  byName?: string | null;
  at: string;
  updatedBy?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
  /** Set when the portal re-sent the day and no longer matches `portalValue`. */
  portalValueNow?: string | null;
  /** Set when the row this correction was made on is not in the latest collection. */
  orphanedAt?: string | null;
}

/** One requested change, as the editor sends it. `value: null` reverts the cell. */
export interface IrasCellEditInput {
  code: IrasReportCode;
  rowKey: string;
  field: string;
  value: string | null;
}

/** A hand-added row. The server mints its `rowKey`. */
export interface IrasAddedRowInput {
  code: IrasReportCode;
  row: IrasRow;
}

/** What one commit actually changed, for the response and the audit entry. */
export interface IrasCorrectionChange {
  code: IrasReportCode;
  rowKey: string;
  rowLabel: string;
  field: string;
  kind: IrasCorrectionKind;
  /** The value in force before the change. */
  from: string | null;
  /** The value in force after it. */
  to: string | null;
  action: 'set' | 'reverted';
  /** Whether this change can move a figure on the report. */
  usedByReport: boolean;
}

/** `PUT …/days/:businessDate/corrections` — one commit, all or nothing. */
export interface IrasCorrectionCommitInput {
  /** Optimistic-concurrency token from the day payload. */
  revision: string;
  reason: string;
  edits?: IrasCellEditInput[];
  addedRows?: IrasAddedRowInput[];
  /**
   * Nozzles the operator has stated did not run today, so a meter reading equal
   * to yesterday's is deliberate rather than a figure nobody updated.
   *
   * On the commit body only, never inside a correction and never inside the
   * preview's pending changes. A hand-added row is sanitised against the shared
   * field policy table, which would reject a column the portal does not send —
   * and teaching that table a field the engine never reads is exactly what
   * `dsr-report/fields.test.ts` exists to prevent. So the acknowledgement is
   * written into the commit's AuditLog entry instead, where the nightly
   * "unconfirmed unchanged meter" query can read it, and nowhere else.
   */
  acknowledgedUnchangedNozzles?: string[];
  /** Rows to exclude, and rows to stop excluding (`restore`). */
  excludeRowKeys?: Array<{ code: IrasReportCode; rowKey: string }>;
  restoreRowKeys?: Array<{ code: IrasReportCode; rowKey: string }>;
  /** Hand-added rows to delete outright. */
  deleteAddedRowKeys?: Array<{ code: IrasReportCode; rowKey: string }>;
  /** Drop every correction on these rows. */
  revertRowKeys?: Array<{ code: IrasReportCode; rowKey: string }>;
  /** Drop every correction on the whole day. */
  revertDay?: boolean;
}

export interface IrasCorrectionCommitResult {
  corrections: IrasDataCorrection[];
  orphaned: IrasDataCorrection[];
  changes: IrasCorrectionChange[];
  /** Business dates whose generated report this invalidated, oldest first. */
  staleDates: string[];
  revision: string;
  /**
   * Things worth saying about what was just saved, which are not reasons to
   * refuse it.
   *
   * A meter reading equal to the previous day's is the case this exists for. It
   * is checked on the screen and blocked there, but a refusal here would lock an
   * operator out of saving correct work on the one morning the figures are least
   * checkable — the day after a business date nobody typed, when there is no
   * previous reading to argue with. So the server states it and lets the day
   * through.
   */
  warnings?: string[];
}

/** One product's variation, before and after the pending changes. */
export interface IrasCorrectionPreviewProduct {
  productKey: string;
  productLabel: string;
  /** Null when the day cannot be computed at all (no prior ledger, say). */
  before: DsrVariationPreview | null;
  after: DsrVariationPreview | null;
}

/** The slice of a variation summary the preview needs — kept flat on purpose. */
export interface DsrVariationPreview {
  variation: number;
  permissibleVariation: number;
  variationNotWithinLimit: number;
  receipt: number;
  openingStock: number;
  sales: number | null;
  /**
   * Litres the tanks gained that the day's receipts do not account for —
   * `impliedReceipt − closingReceipt`, straight off what the engine already
   * computed at the close.
   *
   * This is the one figure that answers "do the tanks and the pumps agree?", and
   * the editor cannot work it out for itself: the arithmetic behind it is the
   * engine's, and a second implementation of an engine rule is this area's
   * founding fault. Null when the day cannot be closed at all — no prior ledger
   * row, or a nozzle with no reading.
   */
  unexplainedLitres: number | null;
  /**
   * What the book says the tanks should hold — `openingStock − unexplained`.
   *
   * Per GRADE, never per tank: `openingStock` is the sum of a product's tanks,
   * so a per-tank book figure does not exist in the engine and inventing one
   * would be a second implementation of the arithmetic. Null on the same days
   * {@link unexplainedLitres} is.
   */
  bookStock: number | null;
}

export interface IrasCorrectionPreview {
  products: IrasCorrectionPreviewProduct[];
  warnings: string[];
}

/**
 * Everything the editor needs for one dealer-day, in one request, so the screen
 * never renders half-known state.
 */
export interface IrasDayEditorView {
  dealer: {
    id: string;
    /** The dealer's code — how the editor's header identifies the outlet. */
    code: string;
    /**
     * RO code as the portal reports it. Admin-only: it is the oil company's SAP
     * outlet number, so it must not reach anything the dealer receives.
     */
    roCode: string | null;
    archived: boolean;
    /**
     * Whether this dealer's portal collection can run at all.
     *
     * `NONE` — the IRAS Shift Data service is not attached. `PAUSED` — attached
     * but stopped, which is how an outlet with no portal account is set up.
     * Either way the editor must not offer "Collect this day": for such a dealer
     * that button is a guaranteed dead end, and typing the day is the only way in.
     */
    portalCollection: 'ACTIVE' | 'PAUSED' | 'NONE';
  };
  businessDate: string;
  /** The portal's own data, verbatim. Null when the day was never collected. */
  snapshot: IrasDataSnapshot | null;
  corrections: IrasDataCorrection[];
  orphaned: IrasDataCorrection[];
  /**
   * Hand-added rows the portal may since have caught up with — a delivery entered
   * by hand and then, a day later, entered at the outlet too. Counting both would
   * swing the variation by a whole tanker, so this is the loudest thing on the
   * screen when it is non-empty.
   */
  duplicateRisk: Array<{ correction: IrasDataCorrection; portalRows: IrasRow[] }>;
  /** Applied corrections whose portal value has changed since they were made. */
  portalChanged: IrasDataCorrection[];
  revision: string;
  /** Nozzle number → the previous day's meter reading, for the backwards-meter check. */
  previousTotReadings: Record<string, string>;
  /**
   * Tank number → the previous day's stock row, read the same way
   * {@link previousTotReadings} is: off the EFFECTIVE previous day, so a figure
   * corrected yesterday is the one the engine will actually measure against, and
   * so a day that was itself typed by hand still answers.
   *
   * Three jobs. The water dip is carried forward from it, because it is the one
   * measurement the engine never calculates with. The stock and the product dip
   * are printed beside their empty boxes as something to check against, never
   * into them. And the stock is what the "this tank did not move while its pumps
   * sold" warning compares against — no existing guard catches that: the
   * engine's own "no stock reading" warning fires only when the row is ABSENT,
   * so a present row carrying a stale but plausible figure passes everything.
   */
  previousStkRows: Record<string, { productDip: string; waterDip: string; netQty: string }>;
  /**
   * Whether reading a slip is switched on and usable for this day.
   *
   * The screen has to be told, rather than assuming: the feature is off by
   * default and it also needs a configured second reader, so a panel drawn on
   * the strength of the day being hand-typed offers a camera that cannot work.
   * Worse than useless — the photograph is compressed and uploaded before the
   * refusal comes back, so an operator watches a 4 MB upload finish over a
   * forecourt connection and only then reads that the feature is off, every
   * morning, leaving an object behind each time.
   */
  slipRead: boolean;
  dsr: {
    attached: boolean;
    /** Why receipts cannot be attributed to a product, rendered inline and calmly. */
    configError: string | null;
    products: Array<{
      key: string;
      labelEn: string;
      tankLabel: string;
      tankNos: number[];
      nozzleNos: number[];
      /**
       * The code IRAS calls this grade, e.g. `HS`. Carried so the editor can
       * stamp it on a hand-added row: on a day nobody collected it is the only
       * thing that tells the report which grade a tank holds.
       */
      prodCodes: string[];
      /**
       * Nozzle number → the factor its totaliser reading is multiplied by before
       * the engine uses it.
       *
       * Carried because the editor prints litres sold per nozzle, and without it
       * that figure is simply wrong for the nozzles that need it: 14E's nozzles
       * 6 and 9 report at 0.1, so a readout built without the scale shows ten
       * times what the report will say. Absent for a dealer with no override,
       * which is every nozzle at most outlets.
       */
      meterScale?: Record<string, number>;
    }>;
    /**
     * Which column this dealer's receipts are counted from — the litres the tank
     * dip measured going in, or the litres the tanker was invoiced for.
     *
     * On screen so a delivery card can say which of its two quantity fields
     * actually decides the report. Today the field hint says "the dealer's
     * configured basis decides" without ever saying which, and 5E's corrections
     * were typed into the other column and silently discarded. Null when the
     * dealer has no readable Daily Sales Report configuration.
     */
    receiptBasis: 'DECANTED' | 'INVOICE' | null;
    /** This dealer's generated report dates, so the footer can count the impact locally. */
    reportDates: string[];
    /** Of those, the ones already shared into the dealer's chat. */
    sharedDates: string[];
  };
}

/**
 * Vault list row — a snapshot without its (potentially large) row payloads, so
 * the cross-dealer list stays small. Row data is fetched on drill-in.
 */
export interface IrasDataSnapshotSummary {
  id: string;
  dealerId: string;
  dealerCode?: string | null;
  roCode?: string | null;
  businessDate: string;
  capturedAt: string;
  status: IrasSnapshotStatus;
  /** See {@link IrasDataSnapshot.source}; a missing value means `PORTAL`. */
  source?: IrasSnapshotSource;
  selectedShiftTime: string;
  failureReason?: string | null;
  /**
   * Per-report row counts, e.g. `{ TOT: 13, STK: 5, REC: 1 }`.
   *
   * Counted off the PORTAL's own rows, so a day typed by hand reports zeros —
   * its figures live in the correction overlay, not in the snapshot. A list must
   * read {@link source} before it prints these, or it will say a full day is
   * empty.
   */
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
  dealerCode?: string | null;
  roCode?: string | null;
  /** Whether the dealer has the pipeline attached and ACTIVE. */
  enabled: boolean;
  /** The dealer's configured shift time, `HH:mm:ss`. */
  configuredShiftTime?: string | null;
  /** Latest snapshot for the requested business date, if any. */
  latest?: IrasDataSnapshotSummary | null;
}

/* ──────────────────────────── the day's state ────────────────────────────
 *
 * A capture list built from snapshots can only ever show the days a capture
 * happened, and that is the wrong shape for the question an admin actually
 * asks: "is this dealer's data all there?" The days that matter most are the
 * ones with NO snapshot, and those have nothing to list. So the calendar is the
 * spine — every date in the window gets a row — and the snapshot, when there is
 * one, hangs off it.
 */

/**
 * What state one dealer-day is in, worst first.
 *
 * One value, decided server-side, so the Vault, the day editor and anything
 * later all say the same thing about the same day. Deriving it per screen is
 * how two surfaces end up disagreeing about whether a day is fine.
 *
 * `MISSING`     — no snapshot at all. Nothing was collected and nothing typed.
 * `FAILED`      — the collection failed and left no usable figures.
 * `PARTIAL`     — some of the day's reports arrived and some did not.
 * `MISMATCH`    — the figures are all there and they do not add up: the tanks
 *                 moved by more than the nozzles sold and the day's tankers
 *                 explain, by more than the permissible band. Nobody has
 *                 accounted for it.
 * `MISMATCH_OK` — the same gap, accepted by a named admin with a reason.
 * `OPEN`        — the figures are there but the day is not closed yet, so
 *                 whether it adds up is not yet knowable. Today is always this.
 * `OK`          — the figures are there and the day adds up.
 */
export const IRAS_DAY_STATES = [
  'MISSING',
  'FAILED',
  'PARTIAL',
  'MISMATCH',
  'MISMATCH_OK',
  'OPEN',
  'OK',
] as const;
export type IrasDayState = (typeof IRAS_DAY_STATES)[number];

/**
 * The floor under which a gap between the book and the dips is not worth
 * naming, in litres.
 *
 * The median unexplained figure across 101 closed dealer-days is 28 L — the
 * ordinary noise of dipping a tank and reading a meter. Calling that a problem
 * every morning is how an operator learns to stop reading the line. The
 * effective threshold is this OR the day's own permissible band, whichever is
 * larger, so the list is never louder than the engine that judges the dealer.
 */
export const IRAS_RECONCILE_MIN_LITRES = 1_000;

/** One grade's reconciliation on one day. */
export interface IrasDayGradeGap {
  productKey: string;
  productLabel: string;
  /**
   * Litres the tanks hold that the day's sales and receipts do not explain.
   * Positive is OVER (more fuel than accounted for), negative is SHORT.
   */
  unexplainedLitres: number;
  /** What this grade's gap had to exceed to count; see {@link IRAS_RECONCILE_MIN_LITRES}. */
  threshold: number;
  /** `|unexplainedLitres| > threshold` — this is the one that makes a day a MISMATCH. */
  loud: boolean;
}

/**
 * A named admin's statement that a day's gap is accounted for.
 *
 * Kept beside the day rather than on the snapshot, for the same reason
 * corrections are: `saveSnapshot` replaces a day's datasets wholesale, so
 * anything written into the snapshot is destroyed the next time that day is
 * collected — and a verification silently vanishing is worse than one that was
 * never made.
 */
export interface IrasDayVerification {
  by: string;
  byName?: string | null;
  at: string;
  /** Why the gap is acceptable. Required — a verification with no reason is a click. */
  note: string;
  /**
   * The gap each grade had when it was accepted.
   *
   * This is what makes the acceptance mean something. Without it a day verified
   * at 1,200 L over would still read "checked" after a correction moved it to
   * 40,000 L over — the admin would have vouched for a figure they never saw.
   * When the figures move, {@link stale} goes true and the day is a MISMATCH
   * again until somebody looks at the new number.
   */
  acceptedGaps: Array<{ productKey: string; unexplainedLitres: number }>;
  /** The day's figures have moved since it was accepted; the acceptance no longer covers them. */
  stale: boolean;
}

/** One calendar day on a dealer's capture history. */
export interface IrasDayStateRow {
  /** IST calendar date, `YYYY-MM-DD`. Always present — this is the spine. */
  businessDate: string;
  state: IrasDayState;
  /** The snapshot for this day, when one exists. `null` on a `MISSING` day. */
  snapshotId?: string | null;
  /** Who put the figures there; see {@link IRAS_SNAPSHOT_SOURCES}. */
  source?: IrasSnapshotSource;
  status?: IrasSnapshotStatus;
  selectedShiftTime?: string | null;
  capturedAt?: string | null;
  /**
   * How many figure rows this day actually holds, corrections included.
   *
   * NOT {@link IrasDataSnapshotSummary.rowCounts}, which counts the portal's own
   * rows and therefore reports zero for every hand-typed day. A list that prints
   * that number tells an admin their fully entered day is empty.
   */
  rowCount: number;
  /** How many hand corrections stand on this day. */
  correctionCount: number;
  /**
   * The day holds good figures but its most recent collection attempt failed.
   *
   * A retry never deletes data already collected, so the day keeps its state and
   * carries this instead — otherwise a failed retry on a healthy day would read
   * as the day itself having failed.
   */
  retryFailed: boolean;
  failureReason?: string | null;
  /**
   * Per-grade reconciliation, or `null` when the day is not closed yet and the
   * question cannot be answered. Never `[]` for "we did not check" — an empty
   * list would read as "checked, nothing wrong".
   */
  gaps: IrasDayGradeGap[] | null;
  verification?: IrasDayVerification | null;
}

/** `GET /iras-data/dealers/:dealerId/day-states` — the calendar, newest first. */
export interface IrasDayStatesPage {
  dealerId: string;
  from: string;
  to: string;
  days: IrasDayStateRow[];
}

/** `PUT …/days/:businessDate/verification` — accept the day's gap. */
export interface IrasDayVerifyInput {
  /** Why the gap is accounted for. Trimmed; must not be empty. */
  note: string;
}
