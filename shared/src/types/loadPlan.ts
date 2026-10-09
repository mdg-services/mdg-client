/**
 * Load Planner — when a dealer should take their next tanker, and what goes in it.
 *
 * WHAT A PLAN ANSWERS
 * -------------------
 * Almost every delivery is one full tanker (at 1E, 87 of 103 delivery days in
 * Feb–Aug 2026 were exactly 12,000 L). So "how much" is never the question. A
 * plan answers three:
 *
 *   1. WHEN to order — today, or the day it becomes necessary.
 *   2. WHICH FUEL goes in each of the tanker's chambers (4 KL each at 1E).
 *   3. WHICH TANK each chamber is unloaded into — the one with room for all of it.
 *
 * WHY POOLS AND NOT PRODUCTS
 * --------------------------
 * Tanks that sell through the same nozzles empty together, so they are planned
 * as ONE pool for "when" — but each tank is still checked on its own for "where",
 * because a chamber cannot be split between tanks. At 1E, tanks 4 and 6 share
 * nozzles 30-33 and are one pool; tank 8 holds the same diesel but sells through
 * its own nozzles 24/25 at a fraction of the rate, so it is a pool of its own.
 * The dealer's old sheet split tanks 4 and 6 fifty-fifty, and history shows on
 * 18 of 60 no-delivery days one tank gave more than 80% of the day's diesel.
 *
 * THE RULE, IN ONE SENTENCE PER STEP
 * ----------------------------------
 * - Spare = stock − the low-stock line (the pump cannot sell below the line).
 * - Daily sale = the average of the last `lookbackDays` NORMAL days. A day the
 *   pool opened at its line, or ran down to it, is left out: it sold little
 *   because there was nothing to sell, and counting it would make the next order
 *   later — a dry day breeding the next dry day.
 * - Order today if waiting one more day would leave less than `safetyDays` of
 *   spare when that later truck lands, assuming a BUSY spell (the
 *   `busyPercentile` day) while the truck is on its way.
 * - Each chamber goes to the pool that runs out first, into the tank with the
 *   most room, if a tank can take the whole chamber — and never to a pool that
 *   would then hold more than `maxCoverDays` (a slow tank is not topped up just
 *   to fill the truck).
 *
 * A PLAN IS A RECOMMENDATION. An admin approves it (and it is drawn as a card
 * and sent into the dealer's chat) or dismisses it with a reason. Every plan is
 * stored with the figures it used, and later scored against what happened, so a
 * dry day can be traced to "the plan was wrong" or "the plan was not followed".
 */

export const LOAD_PLAN_STATUSES = [
  /** Made by the daily run; nobody has looked at it yet. */
  'DRAFT',
  /** An admin approved it and it was sent to the dealer. */
  'APPROVED',
  /** An admin decided not to send it, with a reason. */
  'DISMISSED',
  /** A newer plan for the same dealer arrived before anyone acted on this one. */
  'SUPERSEDED',
] as const;
export type LoadPlanStatus = (typeof LOAD_PLAN_STATUSES)[number];

/**
 * How many days ahead a plan projects, starting with the day it is made.
 *
 * IndianOil takes a dealer's tanker projection for the next four days and no
 * further, so a plan sketches exactly that window: every tanker it lists is
 * ordered within it, and {@link LoadPlan.projection} always has one row per day
 * — a day with nothing to order is a row saying so, not a missing row.
 */
export const LOAD_PLAN_PROJECTION_DAYS = 4;

/** The knobs a plan was made with. Stored on every plan so a past plan explains itself. */
export interface LoadPlanSettings {
  /**
   * Days from placing the order to the depot LOADING the tanker (its invoice
   * day), counted before depot closures are skipped. 1 = order today, loaded on
   * the next day the depot is open. The hours from loading to unloading are in
   * {@link LoadPlanLeadTime}, measured from the outlet's own trucks.
   */
  leadTimeDays: number;
  /** Days of spare stock a truck should still find when it lands. */
  safetyDays: number;
  /** Which recent day counts as "busy", as a fraction: 0.8 = the 80th-percentile day. */
  busyPercentile: number;
  /** How many recent closed days the daily sale is averaged over. */
  lookbackDays: number;
  /** A chamber never goes to a pool that would then hold more than this many days. */
  maxCoverDays: number;
  /** The tanker's chambers, in litres, e.g. `[4000, 4000, 4000]`. */
  chambers: number[];
  /** The depot the outlet loads from, e.g. `Barauni Terminal`. Shown, not computed with. */
  depotName?: string | null;
  /** Road distance from the depot to the outlet, in km. Shown beside the timing it explains. */
  distanceKm?: number | null;
}

/** One tank as the plan saw it on the morning it was made. */
export interface LoadPlanTank {
  tankNo: number;
  /** The most this tank may be filled to, in litres. */
  capacityLitres: number;
  /** Below this the pump cannot sell from the tank. */
  lowStockLitres: number;
  /** Litres at the morning reading; `null` when the day carried no reading. */
  stock: number | null;
  /** The day that stock figure was last stated by the portal or a person. */
  stockConfirmedOn: string | null;
  /** `capacityLitres − stock`, before anything is sold or delivered. */
  room: number | null;
  /** This tank's share of the pool's recent sale (0–1); `null` when unknown. */
  drawShare: number | null;
  /**
   * True when the size and low-stock line are estimates — taken from the most
   * the tank has ever held, rounded up to a standard 10/15/20 KL tank — rather
   * than read off the dealer's own sheet. Shown so somebody confirms them.
   */
  estimated?: boolean;
}

/** A group of tanks that sell through the same nozzles, planned as one. */
export interface LoadPlanPool {
  /** Stable key from the planner config, e.g. `HSD`. */
  key: string;
  /** What a person reads, e.g. `HSD (tanks 4 + 6)`. */
  label: string;
  /** The fuel, in the platform's product vocabulary (`HSD`, `MS`, `XP`). */
  product: string;
  tanks: LoadPlanTank[];
  /** Σ tank stock this morning. */
  stock: number;
  /** Σ the tanks' low-stock lines. */
  lowStock: number;
  /** `stock − lowStock`. Negative when the pool is already below its line. */
  spare: number;
  /** Litres invoiced to this pool and not yet unloaded. */
  onTheWay: number;
  /** Average litres sold on a normal day. `null` when there is too little history. */
  ratePerDay: number | null;
  /** The busy-day figure (see {@link LoadPlanSettings.busyPercentile}). */
  busyPerDay: number | null;
  /** How many days the average was built from. */
  rateDaysUsed: number;
  /**
   * Days left out of the average, with why — for the audit trail.
   * `OTHER_FUEL_DRY`: a bigger-selling fuel of the same kind (petrol for XP,
   * the main diesel tanks for a side diesel tank) was at its line that day, so
   * its customers bought this one instead and the day overstates it. At 1E on
   * 3–4 Oct 2026 XP sold 753 and 1,081 L against a usual ~60 because petrol
   * was dry.
   */
  daysSkipped: { date: string; why: 'NO_DATA' | 'AT_LINE' | 'OTHER_FUEL_DRY' }[];
  /** How many days back the average had to look to find enough normal days. */
  rateWindowDays: number;
  /** `(spare + onTheWay) ÷ ratePerDay`. `null` when the rate is unknown or zero. */
  daysLeft: number | null;
  /** The day the spare runs out at the normal rate. */
  runOutOn: string | null;
  /** True when the pool opened this morning at or below its low-stock line. */
  atLine: boolean;
  /** True when this pool on its own makes ordering today necessary. */
  needsOrderToday: boolean;
}

export interface LoadPlanChamber {
  litres: number;
  /** `null` = the chamber is left empty. */
  poolKey: string | null;
  tankNo: number | null;
  /** A short plain-English reason, shown to the admin. */
  why: string;
}

export interface LoadPlanTruck {
  /** The day to place the order. */
  orderOn: string;
  /**
   * The day the depot loads it (its invoice day) — the first day the depot is
   * open, {@link LoadPlanSettings.leadTimeDays} after the order. Absent on
   * plans made before depot days were known.
   */
  loadOn?: string;
  /** The business day the tanker is expected to be unloaded. */
  arriveOn: string;
  /** About when it is unloaded, `HH:mm` IST; absent on older plans. */
  arriveTime?: string | null;
  /**
   * The calendar date of {@link arriveTime}. Not always {@link arriveOn}: a
   * tanker unloaded at 05:50 before a 07:00 stock reading belongs to the
   * previous business day but arrives on the next calendar date (2E, 2026).
   */
  arriveDate?: string;
  chambers: LoadPlanChamber[];
  /** Litres actually allotted. */
  litres: number;
  /** True when every chamber carries fuel. */
  full: boolean;
  /** Days left per pool right after this truck is unloaded. */
  coverAfter: Record<string, number | null>;
  /** ₹ for this truck at the last price we saw per fuel; `null` if any price is unknown. */
  estimatedCost: number | null;
}

/** A fuel pool on one morning of the projection. */
export interface LoadPlanProjectionPool {
  key: string;
  /**
   * Litres expected in the pool that morning, counting tankers already on the
   * road (and those this plan orders) once they have landed. Never below the
   * pool's line: a dry day shows as `daysLeft` 0, not as negative stock.
   */
  stock: number;
  /** Days of spare at the normal daily sale; `null` when the sale is unknown. */
  daysLeft: number | null;
}

/** One day of the four-day projection. */
export interface LoadPlanProjectionDay {
  /** The order day, `YYYY-MM-DD`. The first row is the day the plan was made. */
  date: string;
  /** True when the depot loads nothing that day (a Sunday or a depot holiday). */
  depotClosed: boolean;
  /** Tankers to order that day; 0 = nothing to order. */
  tankers: number;
  /** Litres to order that day per fuel (`HSD`, `MS`, `XP`, `XG`), summed over its tankers. */
  litres: Record<string, number>;
  /** The day the depot loads that day's tankers; `null` when none are ordered. */
  loadOn: string | null;
  /** Each pool that morning, before anything ordered that day has landed. */
  pools: LoadPlanProjectionPool[];
}

/** A tanker invoiced to the dealer that has not been unloaded yet. */
export interface LoadPlanInTransit {
  invoiceNo: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  /** `HH:mm` as printed on the invoice, when we have it. */
  invoiceTime: string | null;
  product: string;
  /** The pool these litres were counted against; `null` when no pool sells this fuel. */
  poolKey: string | null;
  litres: number;
  vehicleNo: string | null;
  /**
   * True when the invoice itself has not been downloaded yet and the fuel and
   * litres were worked out from the rupees on the purchase ledger, at the last
   * price seen per fuel.
   */
  estimated?: boolean;
}

/** Whether the dealer's credit covers the recommended truck. */
export interface LoadPlanCredit {
  /** ₹ still available on the credit limit at the last reading. */
  available: number | null;
  /** When that reading was taken (ISO timestamp). */
  asOf: string | null;
  dueAmount: number | null;
  /** As SDMS prints it, `dd-mm-yyyy`. */
  dueDate: string | null;
  /**
   * ₹ for every tanker to be ordered on the next order day (all of today's when
   * {@link LoadPlan.orderToday}); `null` when a fuel's price is unknown.
   */
  truckCost: number | null;
  /** ₹ the dealer must deposit before ordering. `0` = covered; `null` = cannot tell. */
  shortBy: number | null;
  /** ₹ per litre used, per fuel, and the invoice day each came from. */
  prices: Record<string, { perLitre: number; on: string }>;
}

/** Invoice-to-unloading time, measured from matched invoice and decant records. */
export interface LoadPlanLeadTime {
  /** Median hours from the invoice being raised to the tanker starting to unload. */
  medianHours: number | null;
  /** How many matched trucks the median came from. */
  samples: number;
  /**
   * The hours the plan actually used from invoice to unloading: the measured
   * median once enough trucks are matched, else the configured figure (the
   * depot's travel time plus unloading).
   */
  usedHours?: number;
  usedFrom?: 'MEASURED' | 'SETTING';
  /** The time of day the depot usually raises the invoice, `HH:mm` IST. */
  loadTime?: string;
  loadTimeFrom?: 'MEASURED' | 'SETTING';
}

/** What actually happened after a plan, filled in by later runs. */
export interface LoadPlanOutcome {
  /** The last day this check covers. */
  checkedThrough: string;
  /** Deliveries seen in the window, per day and pool. */
  delivered: { on: string; poolKey: string; litres: number }[];
  /**
   * For a plan that said "order today": `ON_TIME` when fuel for the truck's
   * pools arrived on its `arriveOn`, `LATE` after it, `MISSING` when nothing
   * arrived by two days after it, `PENDING` while it is too early to tell.
   * `NOT_APPLICABLE` when the plan did not ask for an order that day.
   */
  truck: 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING' | 'NOT_APPLICABLE';
  /** Days late, when `truck` is `LATE`. */
  lateByDays: number | null;
  /** Mornings each pool opened at or below its low-stock line, in the window. */
  dryDays: Record<string, number>;
  /** Litres the plan expected each pool to sell vs what it sold, over the closed days. */
  forecast: Record<string, { planned: number; actual: number; days: number }>;
  /** Days of spare each pool had on the morning its next delivery landed. */
  coverAtArrival: Record<string, number | null>;
}

export interface LoadPlan {
  id: string;
  dealerId: string;
  dealerCode: string;
  /** The morning the stock was read, `YYYY-MM-DD`. Plans are one per dealer per day. */
  businessDate: string;
  generatedAt: string;
  runId: string | null;
  status: LoadPlanStatus;
  /** True when the plan was made after the fact from stored data and never shown to anyone. */
  backfilled: boolean;
  settings: LoadPlanSettings;
  pools: LoadPlanPool[];
  /** True when a truck should be ordered today. */
  orderToday: boolean;
  /** True when a pool is already at its line, or will be before a truck ordered now can land. */
  urgent: boolean;
  /** The next truck to order — today's when {@link orderToday}, otherwise the next one due. */
  truck: LoadPlanTruck | null;
  /** The trucks after that one, within the {@link LOAD_PLAN_PROJECTION_DAYS}-day projection. */
  nextTrucks: LoadPlanTruck[];
  /**
   * What to order on each of the next {@link LOAD_PLAN_PROJECTION_DAYS} days,
   * one row per day, today first — the projection the dealer gives IndianOil.
   * Absent on plans made before it existed.
   */
  projection?: LoadPlanProjectionDay[];
  inTransit: LoadPlanInTransit[];
  credit: LoadPlanCredit;
  leadTime: LoadPlanLeadTime;
  /**
   * Days the depot loads nothing within the plan's horizon — every Sunday plus
   * the depot holiday list. Absent on plans made before the list existed.
   */
  depotClosed?: string[];
  /** Plain-English problems with the inputs, shown to the admin before approving. */
  warnings: string[];
  /** The one line the card leads with. */
  headline: { en: string; hi: string };
  approvedAt: string | null;
  approvedBy: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
  dismissReason: string | null;
  /** Set once the card is in the dealer's chat. */
  shared: { at: string; conversationId: string; messageId: string } | null;
  outcome: LoadPlanOutcome | null;
}

/** How the planner has done over a window, from the plans' outcomes. */
export interface LoadPlanScorecard {
  from: string;
  to: string;
  plans: number;
  approved: number;
  dismissed: number;
  /** Plans that asked for an order that day. */
  ordersAsked: number;
  ordersOnTime: number;
  ordersLate: number;
  ordersMissing: number;
  /** Mornings at or below the line, per pool, across the window (each day counted once). */
  dryDays: Record<string, number>;
  /** Mean absolute miss of the sale forecast, per pool, as a percent of actual. */
  forecastMissPct: Record<string, number | null>;
  /** Mean days of spare when a delivery landed, per pool. */
  coverAtArrival: Record<string, number | null>;
}

/** One row of the plan history list. */
export interface LoadPlanSummary {
  id: string;
  businessDate: string;
  status: LoadPlanStatus;
  backfilled: boolean;
  orderToday: boolean;
  urgent: boolean;
  /** e.g. `HSD 8,000 · MS 4,000`; empty when no truck. */
  truckLine: string;
  outcome: LoadPlanOutcome | null;
}

/** Everything the admin's Load Planner pane needs in one response. */
export interface LoadPlannerOverview {
  /** True when the Load Planner service is attached to this dealer. */
  attached: boolean;
  dealerServiceId: string | null;
  latest: LoadPlan | null;
  history: LoadPlanSummary[];
  scorecard: LoadPlanScorecard;
}
