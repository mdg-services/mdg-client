import type { FestivalKey } from './festival';

/**
 * The snapshot a report message carries (ADR 0056): `Message.report.data`.
 *
 * One interface per report kind, all `{ kind, v: 1, ... }`, joined in the
 * discriminated union {@link ReportData}. The app draws the report from this and
 * from nothing else, so it opens with no network and even when Today no longer
 * lists the message.
 *
 * RULES THAT HOLD FOR EVERY SNAPSHOT
 * ----------------------------------
 *  - Numbers, codes, ISO dates (`YYYY-MM-DD`, IST), ISO times and storage keys only.
 *    NO sentence and no language: the app writes every word in the reader's
 *    language (hi, hl, en). The only text that is stored is text somebody else
 *    wrote and must be shown as written: IndianOil's own words (portal status,
 *    refusal reasons, scenario label, slot labels), the admin's announcement, and
 *    the dealer's own typed titles.
 *  - A snapshot is FROZEN at the moment of sending. `capturedAt` (or the kind's own
 *    "as of" clock) is the stamp the overlay prints; nothing is re-derived from
 *    live data except where a kind says so.
 *  - Plain JSON: no Dates, no ObjectIds, no `undefined` inside arrays. A held
 *    message stores the whole post as JSON, so a snapshot survives a hold.
 *  - Litres and rupees are the same numbers the old picture printed.
 *  - Money that only an owner may read lives on owner-only kinds (`credit_dod`,
 *    `ledger_watch`, `calibration_claim`) or in an optional `credit` block that the
 *    server strips for a manager (`reportDataForViewer`).
 *  - Large ledgers (`DsrProductReport.ledger`) are never copied.
 */

/** `YYYY-MM-DD`, an IST calendar day. */
export type IsoDay = string;
/** An ISO 8601 instant, e.g. `2026-11-24T13:35:00.000Z`. */
export type IsoInstant = string;
/** `HH:mm`, IST wall clock. */
export type ClockTime = string;
/** `HSD` | `MS` | `XP` | `XG` or whatever the portal printed for another product. */
export type FuelKey = string;
/** Text somebody else wrote in two languages (a rule's name, a Kavach task label). Hinglish reads `en`. */
export interface TwoLangText {
  en: string;
  hi: string;
}

/** The current snapshot version. A reader that meets another `v` shows the message's words only. */
export const REPORT_DATA_VERSION = 1 as const;

// ── DSR (sales and variation) ───────────────────────────────────────────────

export type DsrSnapReceiptSource = 'iras' | 'manual' | 'inferred';

/** One tank's line on one DSR day (per-tank fuels only). */
export interface DsrLedgerTank {
  tankNo: number;
  dip: number | null;
  waterDip: number | null;
  stockL: number | null;
  stockSource?: 'reported' | 'converted' | 'carried';
  /** A carried tank stock (HPCL/BPCL) shows the day it was read. */
  stockAsOf?: IsoDay;
}

/** One day of the dealer's DSR book for one fuel. */
export interface DsrLedgerRow {
  day: IsoDay;
  /** True for the day still running: its sales are not worked out yet. */
  open: boolean;
  dip: number;
  waterDip: number;
  openingStockL: number;
  receiptL: number;
  receiptSource: DsrSnapReceiptSource;
  totalStockL: number;
  tanks?: DsrLedgerTank[];
  pumps: Array<{ nozzleNo: number; reading: number | null }>;
  testingL: number;
  soldL: number | null;
  monthToDateL: number | null;
  /** The cumulative restarts on this row. */
  newMonth: boolean;
  /** The remark as typed. */
  remarks: string | null;
}

/** The sales half of one fuel. Present only when the sales sheet was shared. */
export interface DsrSalesBlock {
  /** `pending`: yesterday's sales are not worked out yet (never draw 0). */
  state: 'closed' | 'pending';
  closedDay: IsoDay | null;
  soldL: number | null;
  receiptL: number | null;
  receiptSource: DsrSnapReceiptSource | null;
  testingL: number | null;
  monthToDateL: number | null;
  /** Today's opening stock: "stock this morning", never "stock now". */
  stockNowL: number | null;
  sameWeekdayLastWeek: { day: IsoDay; soldL: number } | null;
  /** The last 14 closed days, oldest first. */
  trend: Array<{ day: IsoDay; soldL: number }>;
  rows: DsrLedgerRow[];
}

/** The stock-variation half of one fuel. Present only when the variation sheet was shared. */
export interface DsrVariationBlock {
  tone: 'ok' | 'low' | 'high';
  /** Signed litres: negative = short. */
  variationL: number;
  permissibleL: number;
  /** Signed litres outside the permitted band, 0 inside. */
  offL: number;
  /** <= 0 */
  lowEdgeL: number;
  /** >= 0 */
  highEdgeL: number;
  band: {
    stockPct: number | null;
    stockL: number;
    leakPct: number | null;
    leakL: number;
    leakApplies: boolean;
    tiers?: {
      firstPct: number;
      restPct: number;
      tier1L: number;
      tier2L: number;
      thresholdL: number;
      days: number;
    };
  };
  sinceDate: IsoDay;
  receiptSinceL: number;
  testSinceL: number;
  how?: {
    meterSalesL: number;
    afterTestingL: number;
    totalStockL: number;
    dipStockL: number;
    dipSalesL: number;
  };
}

/** A figure the report changed after it was first shared. */
export interface DsrRevision {
  changed: Array<{
    productKey: FuelKey;
    fromL: number;
    toL: number;
    wasWithin: boolean;
    isWithin: boolean;
  }>;
}

interface DsrProductBase {
  key: FuelKey;
  tankNos: number[];
  retiredNozzles?: number[];
}

/**
 * The daily sales sheet alone. It carries NO variation field and no verdict: a
 * message sent to a chat the variation must not reach holds nothing about it.
 */
export interface DsrSalesData {
  kind: 'dsr_sales';
  v: 1;
  capturedAt: IsoInstant;
  outletCode: string;
  businessDate: IsoDay;
  shiftTime: ClockTime | null;
  /** A regenerated report posted again after an earlier copy. */
  revised: boolean;
  revision?: DsrRevision;
  products: Array<DsrProductBase & { sales: DsrSalesBlock }>;
}

/**
 * The stock-variation sheet. A message that carries both sheets is tagged
 * `dsr_variation` (the variation leads) and lists `'sales'` in `sheets`; its
 * products then also carry `sales`.
 */
export interface DsrVariationData {
  kind: 'dsr_variation';
  v: 1;
  capturedAt: IsoInstant;
  outletCode: string;
  businessDate: IsoDay;
  shiftTime: ClockTime | null;
  sheets: Array<'variation' | 'sales'>;
  revised: boolean;
  /** A day before the first inspection: the figures are for information, not a verdict. */
  beforeInspection?: boolean;
  revision?: DsrRevision;
  products: Array<DsrProductBase & { variation: DsrVariationBlock; sales?: DsrSalesBlock }>;
}

// ── tanks and tankers ───────────────────────────────────────────────────────

export interface StockTankReading {
  tankNo: number;
  litres: number | null;
  waterL: number | null;
  /** When the gauge read it. */
  at: IsoInstant;
  gaugeOk: boolean;
  /** Copied from the newest load plan (made within 2 days); absent = draw the tank without a fill. */
  capacityL?: number | null;
  lowLineL?: number | null;
  capacityEstimated?: boolean;
}

export interface StockCheckData {
  kind: 'stock_check';
  v: 1;
  /** Equal to `readingAt` when there is one, so a re-send is identical. */
  capturedAt: IsoInstant;
  outletCode: string;
  readingAt: IsoInstant | null;
  stale: boolean;
  /** Petrol, XP, diesel, XG, then the rest; tanks by number. */
  fuels: Array<{
    fuelKey: FuelKey;
    prodCode: string;
    totalL: number;
    tanksRead: number;
    tanksNoReading: number;
    tanks: StockTankReading[];
  }>;
  cover?: {
    planDay: IsoDay;
    fuels: Array<{ fuelKey: FuelKey; daysLeft: number | null; runOutOn: IsoDay | null }>;
  } | null;
}

export type LoadPlanVerdictCode =
  | 'ORDER_NOW_RUNNING_OUT'
  | 'ORDER_NOW_DEPOT_CLOSED'
  | 'ORDER_TODAY'
  | 'NEXT_ORDER'
  | 'NONE_IN_WINDOW';

export interface LoadPlanSnapPool {
  key: string;
  product: FuelKey;
  tankNos: number[];
  stockL: number;
  lowLineL: number;
  /** >= 0, one decimal. */
  daysLeft: number | null;
  runOutOn: IsoDay | null;
  atLine: boolean;
  tanks: Array<{
    tankNo: number;
    stockL: number | null;
    capacityL: number;
    lowLineL: number;
    estimated: boolean;
  }>;
}

export interface LoadPlanSnapTruck {
  full: boolean;
  chambers: Array<{
    litres: number;
    product: FuelKey | null;
    poolKey: string | null;
    tankNo: number | null;
  }>;
}

export interface LoadPlanData {
  kind: 'load_plan';
  v: 1;
  capturedAt: IsoInstant;
  outletCode: string;
  planDay: IsoDay;
  severity: 'urgent' | 'order_today' | 'calm';
  verdict: {
    code: LoadPlanVerdictCode;
    tankers: number;
    products: FuelKey[];
    closedDays: IsoDay[];
    nextOrderOn: IsoDay | null;
    horizonDays: number;
  };
  pools: LoadPlanSnapPool[];
  order: {
    orderOn: IsoDay;
    loadOn: IsoDay | null;
    arriveOn: IsoDay;
    arriveDate: IsoDay | null;
    arriveTime: ClockTime | null;
    trucks: LoadPlanSnapTruck[];
  } | null;
  /** Always four days. */
  projection: Array<{
    date: IsoDay;
    depotClosed: boolean;
    tankers: number;
    litresByProduct: Record<string, number>;
    cover: Array<{ poolKey: string; stockL: number; daysLeft: number | null }>;
  }>;
  depotClosed: IsoDay[];
  inTransit: Array<{
    product: FuelKey;
    litres: number;
    invoiceDate: IsoDay;
    vehicleNo: string | null;
    estimated: boolean;
  }>;
  /** Owner-only money. The server strips it for a manager viewer. */
  credit?: { availableRs: number | null; shortByRs: number | null } | null;
}

export interface TankerDensityData {
  kind: 'tanker_density';
  v: 1;
  capturedAt: IsoInstant;
  outletCode: string;
  /** The same number appears on the paired `tt_ack`: it pairs a tanker's density with its receipt. */
  invoiceNo: string;
  /** As printed on the invoice. */
  vehicleNo: string | null;
  /** Upper-case, no spaces, dots or dashes. */
  vehicleKey: string | null;
  invoiceDate: IsoDay;
  invoiceTime: ClockTime | null;
  /** Diesel first, at most 6. The digits are copied by hand: `density15Raw` is never reformatted. */
  lines: Array<{
    family: 'DIESEL' | 'PETROL' | 'UNKNOWN';
    productKey: FuelKey;
    density15Raw: string;
    quantity: number | null;
    unit: string | null;
    tankNo: string | null;
  }>;
  droppedLines: number;
}

export interface TtAckRow {
  invoiceNo: string;
  invoiceDate: IsoDay;
  /** Resolved once at share time: parsed shortages, else stored totals, else unknown. */
  short: 'none' | 'short' | 'unknown';
  totalShortL: number | null;
  claimShortL: number | null;
  products: Array<{ code: string; totalShortL: number; claimShortL: number }>;
}

export interface TtAckData {
  kind: 'tt_ack';
  v: 1;
  capturedAt: IsoInstant;
  outletCode: string;
  vehicleNo: string | null;
  vehicleKey: string | null;
  ackedAt: IsoInstant;
  /** The condition word the receipt was entered with (always `Excellent` today). */
  condition: string;
  /** At most 6. */
  rows: TtAckRow[];
  /** The same value as the tag's `attention`. */
  anyShort: boolean;
}

export type FuelOrderEvent =
  | 'placed'
  | 'refused'
  | 'unclear'
  | 'not_placed'
  | 'tanker_assigned'
  | 'cancelled'
  | 'not_executed_reason'
  | 'no_tanker_by_afternoon'
  | 'lapsed_not_executed'
  | 'closed_on_portal'
  | 'tanker_changed'
  | 'tanker_details_added'
  | 'possible_duplicate'
  | 'delayed'
  | 'check_result'
  | 'tracking_stopped';

export type FuelOrderSnapStage =
  | 'being_placed'
  | 'waiting'
  | 'tanker_assigned'
  | 'invoiced'
  | 'closed'
  | 'refused'
  | 'cancelled'
  | 'never_sent';

export interface FuelOrderData {
  kind: 'fuel_order';
  v: 1;
  event: FuelOrderEvent;
  /** The order's id here; stays the same through a tanker change (it is the tag's `key`). */
  indentId: string;
  /** IndianOil's SAP number, shown on the face. */
  orderNo: string | null;
  source: 'chat' | 'portal';
  /** The stage at posting time. A live read gives the newest. */
  stage: FuelOrderSnapStage;
  asOf: IsoInstant;
  deliveryDay: IsoDay | null;
  lines: Array<{ product: 'HSD' | 'MS' | 'XP' | 'XG' | null; material: string; kl: number | null }>;
  totalKl: number | null;
  ttNo: string | null;
  prevTtNo?: string | null;
  /** `YYYY-MM-DD[ HH:mm[:ss]]`. */
  shipmentAt: string | null;
  loadAt?: string | null;
  seenLate?: boolean;
  /** IndianOil's word, verbatim. */
  portalStatus?: string | null;
  /** IndianOil's sentence, verbatim (not-executed reason or refusal). */
  portalReason?: string | null;
  /** `shortage_of_funds`, `min_tt_capacity`, `expired`, `login_refused`, `new_order_on_portal`, `settled_by_list`... */
  reasonCode?: string | null;
  shortByRs?: number | null;
  suggestKl?: number | null;
  /** Refusal figures. Owner-only money: stripped for a manager viewer. */
  credit?: {
    capturedAt: IsoInstant;
    availableLimit: number | null;
    dueAmount: number | null;
    dueDate: string | null;
    overdueAmount: number | null;
    side: 'due' | 'advance' | 'clear';
    advanceAmount: number | null;
    cashAndCarry: boolean;
    reviewLapsed: boolean;
  };
  duplicateOf?: string | null;
  delayWhy?: 'captcha' | 'cooldown' | 'busy' | 'unreachable';
  retryUntil?: ClockTime;
  trackingBreak?: 'paused' | 'login';
  cancelState?: 'confirmed' | 'cancelling' | 'cancelled' | 'refused' | 'unclear' | 'not_pressed' | 'expired';
  /** `check_result`: at most 6. */
  orders?: Array<{ orderNo: string | null; stage: FuelOrderSnapStage; deliveryDay: IsoDay | null; ttNo: string | null }>;
  nextCheckAt?: IsoInstant;
}

// ── money (owner-only) ──────────────────────────────────────────────────────

export type CreditVerdict =
  | 'overdue'
  | 'overdue_lag'
  | 'due_today'
  | 'due_soon'
  | 'due'
  | 'advance'
  | 'settled';

export interface CreditDodData {
  kind: 'credit_dod';
  v: 1;
  outletCode: string;
  asOf: IsoDay;
  capturedAt: IsoInstant;
  /** A back-dated card must say so and never replace today's. */
  backdated: boolean;
  /** The greeting that used to exist only inside the picture. */
  festivalKey: FestivalKey | null;
  verdict: CreditVerdict;
  money: {
    /** Overdue amount when overdue, due amount when due, the advance when in advance, 0 when settled. Rupees with paise, not rounded. */
    amount: number;
    /** The oldest lot; differs from `amount` when overdue. */
    dueAmount: number;
    /** The due date, or the earliest missed deadline when overdue. */
    date: IsoDay | null;
    /** Measured from `asOf`; negative = days overdue. The app counts again from `date` against today, so a card kept for days never prints a stale count; this is the count as sent. */
    daysLeft: number | null;
    dateIsApprox: boolean;
    daysIsMinimum: boolean;
    deadlines: number | null;
  };
  limit: {
    form: 'DOD' | 'CREDIT' | 'CASH & CARRY' | null;
    current: number;
    availed: number;
    available: number;
    /** Null when locked, or the limit or amount used is 0. */
    usedPct: number | null;
  };
  review: { on: IsoDay; daysUntil: number; lapsed: boolean } | null;
  /** Open deposits, at most 12. */
  lots?: Array<{ boughtOn: IsoDay; amount: number; deadline: IsoDay }>;
}

export type LedgerClass = 'FEE' | 'INTEREST' | 'COMMISSION' | 'RECOVERY' | 'REVERSAL' | 'UNCLASSIFIED';
export type LedgerSnapFlagKind =
  | 'OTHER_MOVEMENT'
  | 'UNKNOWN_ENTRY'
  | 'WRONG_SIDE'
  | 'AMOUNT_OUTLIER'
  | 'PEER_OUTLIER'
  | 'DUPLICATE';
export type LedgerSeverity = 'INFO' | 'NOTICE' | 'ALERT';

export interface LedgerWatchData {
  kind: 'ledger_watch';
  v: 1;
  outletCode: string;
  generatedAt: IsoInstant;
  window: { from: IsoDay; to: IsoDay } | null;
  /** In scope; >= shown. */
  totalMovements: number;
  totalsScope: 'shown' | 'window';
  charged: number;
  received: number;
  topSeverity: LedgerSeverity;
  /** Newest first; at most 4 for the rolling view, 30 for a window. */
  movements: Array<{
    date: IsoDay;
    /** Positive. */
    amount: number;
    direction: 'CHARGED' | 'RECEIVED';
    class: LedgerClass;
    flagKind: LedgerSnapFlagKind;
    severity: LedgerSeverity;
    title: TwoLangText;
  }>;
}

export interface CalibrationClaimData {
  kind: 'calibration_claim';
  v: 1;
  financialYear: string;
  nozzleCount: number;
  nozzlesIncluded: number;
  totalAmount: number;
  amountPerNozzle: number;
  reference: string | null;
  filedAt: IsoInstant;
  /** At most 12. */
  units: Array<{ serial: string; make: string | null; nozzles: number; included: boolean }>;
}

// ── water and supply ────────────────────────────────────────────────────────

export interface WaterIngressData {
  kind: 'water_ingress';
  v: 1;
  outletCode: string;
  businessDate: IsoDay;
  /** Send time: the "as of" clock. */
  capturedAt: IsoInstant;
  lastCheckAt: IsoInstant;
  dayState: 'finished' | 'running';
  operating: { from: ClockTime; to: ClockTime; allDay: boolean } | null;
  totalSlots: number;
  recordedSlots: number;
  missedSlots: number;
  openSlots: number;
  compliancePercent: number;
  /** The last portal check failed. The raw reason is never kept. */
  lastCheckFailed: boolean;
  /** Portal order. */
  slots: Array<{
    /** The portal's own label, verbatim. */
    label: string;
    startMin: number;
    endMin: number;
    state: 'recorded' | 'missed' | 'open';
    byService: boolean;
    updatedOn: string | null;
  }>;
}

export type RoSupplyCond =
  | 'automation_data'
  | 'pending_otp'
  | 'sdms_dar_block'
  | 'du_tank_comm'
  | 'mock_drill'
  | 'electrical_audit'
  | 'ro_not_auto'
  | 'other';

export interface RoSupplyData {
  kind: 'ro_supply';
  v: 1;
  outletCode: string;
  capturedAt: IsoInstant;
  read: 'ok' | 'partial' | 'unclear';
  /** True = fuel lifting is stopped; null = unknown. */
  blocked: boolean | null;
  failingCount: number;
  unknownCount: number;
  /** A later failed read means this one is the last good one. */
  lastGoodIsOld: boolean;
  /** Failing first, then unknown, then clear; portal order inside each. */
  rows: Array<{
    cond: RoSupplyCond;
    mark: 'YES' | 'NO' | 'UNKNOWN';
    /** The portal's text verbatim: the only text for `other`. */
    portalText: string;
  }>;
}

export type DuOtpSnapReason = 'e_calibration' | 'Pulsar Repair' | 'Replacement' | 'Others';

export interface DuOtpEvent {
  otpId: string;
  duMake: string;
  duModel: string;
  duSerial: string;
  nozzleNo: string;
  transactionDate: IsoDay | null;
  /** The portal's date text, used only when the date did not read. */
  transactionDateText: string;
  /** Pending: IndianOil's word, verbatim. */
  portalStatus?: string;
  groupKey: string;
  /** Submitted only. */
  reasons?: DuOtpSnapReason[];
  papers?: { certificate: boolean; serviceReport: boolean; other: boolean };
  vcNumber?: string | null;
  calibrationDate?: IsoDay | null;
}

export interface DuOtpData {
  kind: 'du_otp';
  v: 1;
  outletCode: string | null;
  /** `pending` is an alert above the box; `submitted` is a receipt. */
  phase: 'pending' | 'submitted';
  /** Pending: red when true, amber when false, unknown when absent. */
  supplyBlocked?: boolean;
  readAt?: IsoInstant;
  submittedAt?: IsoInstant;
  /** At most 20. */
  events: DuOtpEvent[];
  moreCount: number;
  /** Row id, so a live look is possible. */
  ref?: string;
}

// ── filings (done for you) ──────────────────────────────────────────────────

export interface FiledPhoto {
  slot: 'outside' | 'inside';
  /** A storage key under the dealer's own folder; the server signs it per viewer. */
  key: string;
  mime: string;
  size: number;
  reused?: boolean;
}

export interface DeclarationFiledData {
  kind: 'declaration_filed';
  v: 1;
  /** `safety` is daily, `washroom` weekly. The tag's `key` is the same word. */
  declaration: 'safety' | 'washroom';
  how: 'submitted' | 'settled' | 'already_on_portal';
  /** The IST day it is for. */
  day: IsoDay;
  filedAt: IsoInstant;
  late: boolean;
  everyDays: number;
  nextDueDay: IsoDay | null;
  outletCode: string | null;
  /** Washroom: the portal's month. */
  month?: string | null;
  /** Safety: consecutive days filed, ending at `day`. */
  streak?: number;
  /** Safety: up to 14 most recent filed days including `day`. */
  recentDays?: IsoDay[];
  /** Washroom: the filing before this one. */
  previousDay?: IsoDay | null;
  /** Washroom: two photos, fewer when one is gone. */
  photos?: FiledPhoto[];
  /** The filing's row id. */
  ref: string;
}

export type MockDrillSnapFamily =
  | 'fire'
  | 'spill'
  | 'leak'
  | 'electric'
  | 'vehicle'
  | 'injury'
  | 'security'
  | 'natural'
  | 'explosion';

export interface MockDrillData {
  kind: 'mock_drill';
  v: 1;
  outletCode: string | null;
  stage: 'received' | 'filed';
  /** The tag's `key`. */
  submissionId: string;
  mode: 'same' | 'new';
  scenario: {
    id: string;
    family: MockDrillSnapFamily;
    /** IndianOil's English label, verbatim; a fallback only. */
    label: string;
  };
  drillDay: IsoDay | null;
  startTime: ClockTime | null;
  durationMinutes: number | null;
  /** `YYYY-MM-DD HH:mm`. */
  allClear?: string;
  level: '1' | '2' | '3';
  personsPresent?: number;
  headCountShort?: number;
  /** Index into the portal's nine rows: siren, cic, sic, fire, medical, security, mutual_aid, em, others. */
  response?: Array<{ step: number; expectedSec: number; actualSec: number }>;
  /** Two; signed per viewer, only under the dealer's own folder. */
  photos: Array<{ key: string; mime: string; size: number }>;
  receivedAt?: IsoInstant;
  filedAt?: IsoInstant;
  /** As known when it was sent; the overlay prefers the live value. */
  portalState: 'pending_approval' | 'returned' | 'none' | 'unknown';
}

export interface ElectricalAuditData {
  kind: 'electrical_audit';
  v: 1;
  outcome: 'submitted' | 'nothing_open' | 'partly' | 'failed' | 'login_rejected';
  audits: Array<{
    auditNo: string;
    /** The portal's date text. */
    auditDate: string;
    points: number;
    confirmed: boolean;
  }>;
  pointsTotal: number;
  filedAt: IsoInstant;
}

export interface PaperExpiryData {
  kind: 'paper_expiry';
  v: 1;
  scope: 'tanker' | 'outlet';
  allLapsed: boolean;
  /** At most 24, most urgent first. */
  items: Array<{
    vehicleReg?: string;
    /** The catalogue key; the app names it. */
    docType: string;
    /** The portal's text, a fallback. */
    docLabel: string;
    /** Measured at `sentOn`; negative = lapsed. The app counts again from `validUntil` when there is one. */
    daysLeft: number;
    validUntil?: IsoDay;
  }>;
  moreCount: number;
  /** Outlet paper: the open renewal ask, so the button jumps to the upload box (`doc:<id>`). */
  askId?: string | null;
  sentOn: IsoDay;
}

// ── MDG's own ───────────────────────────────────────────────────────────────

export interface KavachAsk {
  code: string;
  /** The Kavach item id; the chat's ask ref is `kv:<itemId>`. */
  itemId: string;
  label: TwoLangText;
  points: number;
  state: 'asked' | 'rejected';
}

export interface KavachData {
  kind: 'kavach';
  v: 1;
  outletCode: string;
  businessDate: IsoDay;
  computedAt: IsoInstant;
  scored: boolean;
  /** The same gate as the text line (`kavachScoreIsPublishable`). */
  scorePublishable: boolean;
  /** The three are absent unless `scored && scorePublishable`. */
  pct?: number;
  validPoints?: number;
  totalPoints?: number;
  unverifiedCount: number;
  /** Every task waiting on the dealer; not capped. */
  asks: KavachAsk[];
  /** Work with MDG, heaviest first, at most 5. */
  pending: Array<{
    code: string;
    label: TwoLangText;
    points: number;
    status: 'EXPIRED' | 'EXPIRING_SOON' | 'NOT_YET_VERIFIED' | 'SOS_FLAGGED';
  }>;
  pendingOverflow: number;
}

export interface AnnouncementData {
  kind: 'announcement';
  v: 1;
  /** The tag's `key`. */
  announcementId: string;
  /** As typed, at most 90. */
  title: string;
  tone: 'new' | 'notice' | 'important';
  /** As typed, at most 1800; `*bold*` marks kept. */
  body: string;
  serviceId?: string | null;
  /** The guide video that was sent with it. */
  videoId?: string | null;
  sentAt: IsoInstant;
  /** True for `important`: the dealer taps Got it. */
  ackable: boolean;
}

// ── the union ───────────────────────────────────────────────────────────────

export type ReportData =
  | DsrSalesData
  | DsrVariationData
  | StockCheckData
  | LoadPlanData
  | TankerDensityData
  | TtAckData
  | FuelOrderData
  | CreditDodData
  | LedgerWatchData
  | CalibrationClaimData
  | WaterIngressData
  | RoSupplyData
  | DuOtpData
  | DeclarationFiledData
  | MockDrillData
  | ElectricalAuditData
  | PaperExpiryData
  | KavachData
  | AnnouncementData;

/** The snapshot of one kind: `ReportDataOf<'credit_dod'>` is `CreditDodData`. */
export type ReportDataOf<K extends ReportData['kind']> = Extract<ReportData, { kind: K }>;
