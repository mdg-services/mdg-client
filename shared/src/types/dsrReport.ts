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
  /** Litres decanted into this product's tank on this date (0 when no receipt). */
  receipt: number;
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
  variation: DsrVariationSummary;
}

/**
 * The generated report for one dealer for one business date — the service's
 * deliverable and the shape the Vault renders and the exporters consume.
 */
export interface DsrReportDigest {
  /** Outlet code used in the report titles, e.g. `15E`. */
  outletCode: string;
  dealerId: string;
  dealerName?: string | null;
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

/** Per-dealer DSR configuration (stored on the DealerService `config`). */
export interface DsrConfig {
  outletCode: string;
  /** Last physical inspection date the variation is measured from, `YYYY-MM-DD`. */
  sinceDate: string;
  /** Litres of testing recorded per pump that moved during the day. */
  testingPerActivePumpLitres: number;
  /** Minimum daily throughput (litres) for a pump to count as active. */
  testingMinDeltaLitres: number;
  products: DsrProductConfig[];
}
