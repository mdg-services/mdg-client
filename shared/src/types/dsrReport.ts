/**
 * Daily Sales Report (DSR) — the contract for the report the `dsr-report`
 * service generates from a dealer's IRAS Data Vault snapshot.
 *
 * The DSR is what a fuel dealer historically produced by hand: paste the day's
 * shift readings into a macro workbook and let it compute sales, testing, stock
 * and the stock-vs-sales variation. This service replaces that workbook. It
 * reads the curated IRAS snapshot (TOT / STK / REC) for a business date, closes
 * yesterday's sales, and renders the two-panel report the dealer receives:
 *
 *   • the STOCK VARIATION summary  (per product: variation, permissible band,
 *     the amount outside that band, and receipts/testing since last inspection)
 *   • the SALES LEDGER window       (per product: yesterday + today rows with
 *     dip, opening stock, receipt, pump meter readings, testing, sales, cum.)
 *
 * Everything downstream — the persisted ledger, the Vault UI, the Excel/HTML
 * export — speaks this shape, so a change to how the report is stored or shown
 * stays contained.
 */

/**
 * Where a day's `receipt` figure came from.
 *
 * `iras` — summed from the portal's REC (decantation) rows, the normal path.
 * `manual` — entered by an admin, which REPLACES whatever the portal reported.
 * The portal's own decantation entries are made by the dealer and are routinely
 * late, missing or wrong, so a hand-entered figure has to be able to win.
 */
export type DsrReceiptSource = 'iras' | 'manual';

/** One pump nozzle's cumulative totaliser reading at the shift instant. */
export interface DsrPumpReading {
  /** IRAS nozzle number, e.g. 8. */
  nozzleNo: number;
  /** Cumulative totaliser (litres) as reported by IRAS. */
  reading: number;
}

/**
 * One product's row for one business date — the ledger unit.
 *
 * `sales` / `cumulativeSales` are `null` on the CURRENT day: a day's sales can
 * only be known once the NEXT day's opening reading arrives, so today's row is
 * "open" and gets closed on tomorrow's run. This mirrors the source workbook,
 * where the latest row shows readings but a blank sales cell.
 */
export interface DsrDayRow {
  /** IST calendar date this row belongs to, `YYYY-MM-DD`. */
  businessDate: string;
  /** Product dip in cm (IRAS reports mm; divided by 10). */
  dip: number;
  /** Water dip, as IRAS reports it (not rescaled). */
  waterDip: number;
  /** Net product quantity per dip (litres) — the row's "opening stock". */
  openingStock: number;
  /**
   * Litres decanted into this product's tank on this date (0 when no receipt) —
   * the EFFECTIVE figure, i.e. the manual entry when there is one.
   */
  receipt: number;
  /**
   * Where {@link receipt} came from. Absent on rows written before manual entry
   * existed; read a missing value as `iras`.
   */
  receiptSource?: DsrReceiptSource;
  /**
   * What the portal itself reported for this day, kept alongside a `manual`
   * receipt so the correction stays auditable (and so "revert to IRAS" has
   * something to revert to). `null` when the day has no snapshot to compare with.
   */
  irasReceipt?: number | null;
  /** `openingStock + receipt`. */
  totalStock: number;
  /** Ordered pump readings, one per nozzle feeding this product. */
  pumps: DsrPumpReading[];
  /** Testing litres for the day (per active pump), see `DsrConfig.testingPerActivePumpLitres`. */
  testing: number;
  /** Day's sales (litres) once closed by the next day; `null` while open. */
  sales: number | null;
  /** Running total of `sales` since the ledger began; `null` while open. */
  cumulativeSales: number | null;
  /** Free-text remark (kept for parity with the workbook's REMARKS column). */
  remarks?: string | null;
  /** True once `sales`/`cumulativeSales` have been computed. */
  closed: boolean;
}

/** What the variation says the dealer should do about it. */
export type DsrAdvisoryKind =
  /** Variation is inside the permissible band — nothing to do. */
  | 'WITHIN_LIMIT'
  /** Physical stock is SHORT beyond the band — top the tank up from the DU. */
  | 'LOW'
  /** Physical stock is OVER beyond the band — show testing / draw off before decant. */
  | 'HIGH';

export interface DsrAdvisory {
  kind: DsrAdvisoryKind;
  /** Hindi guidance shown to the dealer (matches the workbook copy). */
  messageHi: string;
  /** English mirror of the guidance. */
  messageEn: string;
}

/**
 * Per-product stock-vs-sales reconciliation, cumulative since the last physical
 * inspection. This is the top panel of the report.
 */
export interface DsrVariationSummary {
  productKey: string;
  /** Display label, e.g. `HIGH SPEED DIESEL`. */
  productLabel: string;
  /** The report's business date, `YYYY-MM-DD`. */
  currentDate: string;
  /** The dealer's shift time, `HH:mm` or `HH:mm:ss`. */
  shiftTime: string;
  /** Meter-measured sales minus dip-measured sales (litres). Negative ⇒ short. */
  variation: number;
  /** Allowed band: leakage allowance (+4% of stock when short). */
  permissibleVariation: number;
  /** How far the variation falls outside the band; 0 when within limit. */
  variationNotWithinLimit: number;
  /** Receipts since the last inspection (litres). */
  totalReceiptSinceInspection: number;
  /** Testing since the last inspection (litres). */
  totalTestSinceInspection: number;
  /** The inspection the reconciliation is measured from, `YYYY-MM-DD`. */
  sinceDate: string;
  advisory: DsrAdvisory;
  /**
   * The intermediate figures behind `variation`, surfaced for transparency and
   * audit (the Vault shows these under a "how this was computed" disclosure).
   */
  breakdown: {
    /** Σ(today meter − inspection meter) over the product's nozzles. */
    meterSalesSinceInspection: number;
    /** `meterSalesSinceInspection − totalTestSinceInspection`. */
    afterTesting: number;
    /** `inspectionOpeningStock + totalReceiptSinceInspection`. */
    totalStockSinceInspection: number;
    /** Today's net dip stock (litres). */
    actualDipStock: number;
    /** `totalStockSinceInspection − actualDipStock`. */
    dipSales: number;
    /** Leakage allowance = afterTesting × leakage%. */
    leakage: number;
    /** Base band = actualDipStock × permissible%. */
    permissible: number;
  };
}

/** One product's full section of the report: the ledger window + its variation. */
export interface DsrProductReport {
  productKey: string;
  productLabelEn: string;
  productLabelHi: string;
  /** e.g. `TANK -1`; how the ledger labels this product's tank column. */
  tankLabel: string;
  /** The ledger window shown, oldest first — typically [yesterday, today]. */
  rows: DsrDayRow[];
  /**
   * The FULL per-day ledger for this product, oldest first — the complete "DSR
   * sheet" every day since the ledger began, matching the dealer's macro
   * workbook's DSR tab. `rows` stays the compact yesterday+today window; this is
   * the whole history for the sheet view and the Excel export.
   */
  ledger?: DsrDayRow[];
  variation: DsrVariationSummary;
}

/**
 * The generated report for one dealer for one business date — the service's
 * deliverable and the shape the Vault renders and the exporters consume.
 */
export interface DsrReportDigest {
  /**
   * The dealer's code, e.g. `15E` — used in the report titles. Derived from the
   * dealer record, not configured per attachment, so it cannot drift from the
   * code the dealer is known by everywhere else.
   */
  outletCode: string;
  dealerId: string;
  /**
   * RO code as the IRAS portal reports it (numeric, e.g. `198889`) — the oil
   * company's outlet number, kept for admin troubleshooting only. It is a SAP
   * identifier and must never be rendered into anything the dealer receives.
   */
  roCode?: string | null;
  /** The report's business date, `YYYY-MM-DD`. */
  businessDate: string;
  /** The shift time the snapshot was anchored on, `HH:mm:ss`. */
  shiftTime: string;
  /** When the report was generated, ISO-8601. */
  generatedAt: string;
  products: DsrProductReport[];
  /**
   * Non-fatal data-quality notes (e.g. "no snapshot for yesterday, sales could
   * not be closed"), shown to the admin so a partial report is never mistaken
   * for a clean one.
   */
  warnings: string[];
}

// ------------------------------------------------------------------ config

/** One product's layout + policy within a dealer's DSR config. */
export interface DsrProductConfig {
  /** Stable key, e.g. `HSD`, `MS`. */
  key: string;
  labelEn: string;
  labelHi: string;
  tankLabel: string;
  /** IRAS product code(s) this product maps to, e.g. `["HS"]`. */
  prodCodes: string[];
  /** Tank number(s) holding this product (for dip / stock / receipts). */
  tankNos: number[];
  /** Nozzles feeding this product, in the order the report columns show them. */
  nozzleNos: number[];
  /**
   * Per-nozzle multiplier applied to the portal's totaliser reading, keyed by
   * nozzle number. Absent or 1 for almost every pump.
   *
   * Not a unit conversion anyone chose — some dispensing units report their
   * totaliser in a different decimal scale from the rest of the forecourt, and
   * the portal passes that through. 14E's nozzles 6 and 9 read ten times their
   * true litres, and the dealer's own macro carries a hand-added `/10` on those
   * two columns alone (`DATA!M39`, `DATA!M40`, under a header they labelled
   * "Formula Adjust"). Uncorrected, one such nozzle turned a 2,500 L day into a
   * 21,500 L one.
   *
   * Applied to the reading, so everything downstream — the printed meter, the
   * day's sales, and the since-inspection meter total — is in litres. Inspection
   * baselines are therefore stored in LITRES too, already scaled.
   */
  meterScale?: Record<string, number>;
  /** Evaporation/leakage allowance as a percent of throughput, e.g. 0.25. */
  leakagePct: number;
  /** Permissible band as a percent of current stock, e.g. 4. */
  permissiblePct: number;
  /** Baselines fixed at the last physical inspection. */
  inspection: {
    /** Product stock at inspection (litres). */
    openingStock: number;
    /** Nozzle totaliser readings at inspection, keyed by nozzle number. */
    meterByNozzle: Record<string, number>;
    /** Cumulative receipts from inspection up to the ledger's start (litres). */
    seedReceipts: number;
    /** Cumulative testing from inspection up to the ledger's start (litres). */
    seedTesting: number;
  };
}

/**
 * Which figure a tanker delivery contributes to the stock reconciliation.
 *
 * The portal reports both: `NET_QTY_DECANTED`, the litres the tank actually
 * gained measured from the dip before and after decanting, and
 * `INVOICE_QUANTITY`, the litres the tanker was billed at. They differ by a
 * percent or two in either direction — 5E was invoiced 9,000 L for a delivery
 * that dipped in at 8,695.61, and 14E received 87.89 L MORE than it was billed
 * for.
 *
 * `DECANTED` is the default and the more defensible basis: the stock this is
 * reconciled against is itself dip-measured, so measuring the receipts the same
 * way keeps the comparison internally consistent and leaves a short delivery
 * visible as a short delivery rather than folded into the variation.
 *
 * `INVOICE` exists because every dealer's own hand-kept book uses the invoiced
 * figure, and a dealer who cannot reconcile our report against their book will
 * not trust either. It is a per-dealer choice, not a global one.
 */
export type DsrReceiptBasis = 'DECANTED' | 'INVOICE';

/** Per-dealer DSR configuration (stored on the DealerService `config`). */
export interface DsrConfig {
  /** Which delivery figure feeds the reconciliation; see {@link DsrReceiptBasis}. */
  receiptBasis?: DsrReceiptBasis;
  /** Last physical inspection date the variation is measured from, `YYYY-MM-DD`. */
  sinceDate: string;
  /** Litres of testing recorded per pump that moved during the day. */
  testingPerActivePumpLitres: number;
  /** Minimum daily throughput (litres) for a pump to count as active. */
  testingMinDeltaLitres: number;
  products: DsrProductConfig[];
}

// ------------------------------------------------------------ staleness

/**
 * Why a generated report no longer matches its inputs.
 *
 * Set when a collected IRAS figure for `businessDate` is corrected by hand: that
 * day's own report is wrong, and so is EVERY later one, because the stock-vs-sales
 * variation accumulates receipts and testing since the last inspection.
 *
 * WHAT is wrong depends on which figure moved, and both cases are real now that
 * every collected field is correctable — the note that used to live here (only a
 * receipt could change, so only the variation panel could be wrong) stopped being
 * true when meter readings became editable:
 *
 *   • a receipt or a tank dip moves the stock and the variation;
 *   • a METER READING also moves sales and the running cumulative, because a
 *     day's sales are the difference between its reading and the next day's.
 *
 * A regeneration of a corrected meter day therefore has to rebuild the ledger
 * rows around it, not just recompute the variation.
 */
export interface DsrReportStale {
  /** When the report was marked stale, ISO-8601. */
  at: string;
  /** One sentence for the banner. */
  reason: string;
  /** The business date whose receipt changed — where a regeneration must start. */
  businessDate: string;
  /** The product whose receipt changed, when it was a single one. */
  productKey?: string | null;
  /** Admin id that made the change. */
  by?: string | null;
}
