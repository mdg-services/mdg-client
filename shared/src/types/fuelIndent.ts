/**
 * Fuel orders ("indents") placed and tracked on IndianOil's SDMS portal
 * (ADR 0041). The shapes the server hands the admin's Data Vault pane and the
 * dealer-side agent.
 *
 * One record per draft or portal order. A draft is MDG's own: the owner builds
 * it in the chat, confirms it with a plain "yes", and the robot places it. A
 * portal order is what View/Cancel Indents lists — those placed through MDG and
 * those the dealer placed himself — tracked until a tanker is assigned.
 *
 * The portal's own words (an order's status, a refusal) are carried verbatim and
 * never mapped onto a vocabulary of ours: the full list of those words is not
 * known yet, and a mapping would hide a new one.
 */

export const FUEL_INDENT_SERVICE_ID = 'fuel-indent';

/** The fuels an order can carry, in the platform's product vocabulary. */
export const FUEL_PRODUCTS = ['HSD', 'MS', 'XP', 'XG'] as const;
export type FuelProduct = (typeof FUEL_PRODUCTS)[number];

/**
 * Where a record stands.
 *
 *  - `drafting` / `awaiting_confirm`: the owner is building it; the read-back has
 *    been posted once it is `awaiting_confirm`.
 *  - `confirmed`: the owner said yes; the next run places it (within 30 minutes).
 *  - `submitting`: Submit is being pressed (written down before the click).
 *  - `placed` / `refused` / `unclear`: the portal's answer.
 *  - `expired`: confirmed but not placed in time; `abandoned`: given up before a
 *    press (a newer draft, the kill switch, the form did not match).
 *  - `portal`: found on the portal, not drafted through MDG.
 */
export const FUEL_INDENT_STATES = [
  'drafting',
  'awaiting_confirm',
  'confirmed',
  'submitting',
  'placed',
  'refused',
  'unclear',
  'expired',
  'abandoned',
  'portal',
] as const;
export type FuelIndentState = (typeof FUEL_INDENT_STATES)[number];

export const FUEL_INDENT_SOURCES = ['chat', 'portal'] as const;
export type FuelIndentSource = (typeof FUEL_INDENT_SOURCES)[number];

/**
 * The messages a record can cause, one each at most (claim key
 * `fuel-indent:<order>:<event>`). The later ones carry a KEY (the reason, the TT
 * number, the date): the same event with a new key is news again and is sent
 * again; the same key never twice.
 *
 *  - `not_executed_reason`: IndianOil wrote (or changed) why an order is not
 *    executed yet. Never for its placeholder "Reason not available".
 *  - `no_tanker_by_afternoon`: delivery is today and the 15:00 look still shows
 *    no tanker.
 *  - `lapsed_not_executed`: the delivery date has passed and the order is still
 *    "not executed" (owners, with the cancel option).
 *  - `closed_on_portal`: cancelled or rejected on the portal, not by MDG.
 *  - `tanker_changed`: the TT number or shipment time differs from the one MDG
 *    announced.
 *  - `tanker_details_added`: the tanker message went out without the TT number
 *    or the shipment time, and the portal now shows it (news, not a change).
 *  - `possible_duplicate`: two open orders for the same fuel and date. Told,
 *    never cancelled by MDG.
 *  - `delayed`: the portal would not open after the owner's yes; MDG keeps
 *    trying until the yes is 30 minutes old.
 *  - `check_result`: the answer to an owner's "check now" (the run, not a row,
 *    carries it).
 *  - `tracking_stopped`: the portal cannot be checked (paused, or the login
 *    broke) while orders wait for a tanker.
 */
export const FUEL_INDENT_EVENTS = [
  'placed',
  'refused',
  'unclear',
  'not_placed',
  'tanker_assigned',
  'cancelled',
  'not_executed_reason',
  'no_tanker_by_afternoon',
  'lapsed_not_executed',
  'closed_on_portal',
  'tanker_changed',
  'tanker_details_added',
  'possible_duplicate',
  'delayed',
  'check_result',
  'tracking_stopped',
] as const;
export type FuelIndentEvent = (typeof FUEL_INDENT_EVENTS)[number];

/** What an order's cancel stands at. */
export const FUEL_CANCEL_STATES = [
  'confirmed',
  'cancelling',
  'cancelled',
  'refused',
  'unclear',
  'not_pressed',
  'expired',
] as const;
export type FuelCancelState = (typeof FUEL_CANCEL_STATES)[number];

/**
 * Set on every chat message that tells the dealer about a fuel order event. The
 * app draws nothing from it: it keeps the message out of the WhatsApp backup —
 * fuel-order news goes in the app with a push, at any hour, never on WhatsApp
 * (owner, 13 Nov 2026).
 */
export interface MessageFuelIndent {
  sapOrderNo: string | null;
  event: string;
  /** The order row the notice is about, so a notice whose claim outlived a crash is found, not sent twice. */
  indentId?: string | null;
}

export interface FuelOrderLineView {
  /** Our product key, when the portal's material could be recognised. */
  product: FuelProduct | null;
  /** The portal's material description, verbatim (or our product key for a draft). */
  material: string;
  kl: number | null;
}

/**
 * Where an order stands, in one code word the agent and the admin share:
 *  - `never_sent`: a chat order that never reached the portal (expired,
 *    abandoned, refused before a number);
 *  - `being_placed`: confirmed or being pressed, no SAP number yet;
 *  - `waiting`: on the portal, no tanker yet;
 *  - `tanker_assigned`, `invoiced`: IndianOil has put a tanker on it, or billed it;
 *  - `closed`: cancelled or rejected on the portal by somebody other than MDG;
 *  - `refused`: the portal refused MDG's press;
 *  - `cancelled`: cancelled through MDG.
 */
export const FUEL_ORDER_STAGES = [
  'never_sent',
  'being_placed',
  'waiting',
  'tanker_assigned',
  'invoiced',
  'closed',
  'refused',
  'cancelled',
] as const;
export type FuelOrderStage = (typeof FUEL_ORDER_STAGES)[number];

/** One order, as the agent and the admin read it. */
export interface FuelOrderView {
  id: string;
  sapOrderNo: string | null;
  source: FuelIndentSource;
  state: FuelIndentState;
  /** YYYY-MM-DD (IST). */
  orderDate: string | null;
  /** YYYY-MM-DD. The draft's date, or the portal's requested delivery date(s). */
  deliveryDates: string[];
  lines: FuelOrderLineView[];
  totalKl: number | null;
  /** The portal's "Order Execution Status", verbatim. */
  status: string | null;
  ttNo: string | null;
  /** 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DD' (IST), as the portal gave it. */
  shipmentAt: string | null;
  loadAt: string | null;
  invoiceNo: string | null;
  deliveryNo: string | null;
  deliveryAt: string | null;
  notExecutedReason: string | null;
  supplyLocation: string | null;
  /** On the portal, no tanker yet, not cancelled. */
  waitingForTanker: boolean;
  /**
   * The portal shows Cancel only for an order it has not executed. Also true
   * when an earlier cancel was refused and the order still is not executed.
   */
  cancellable: boolean;
  /** It has a SAP number and is not refused, cancelled or closed. */
  onPortal: boolean;
  stage: FuelOrderStage;
  /**
   * A code key for what happened to it when it did not go the usual way: the
   * not-placed reason (`expired`, `login_refused`, `new_order_on_portal`, …), the
   * refusal reason, or `settled_by_list`. Null when nothing unusual happened.
   */
  whatHappened: string | null;
  /** Still "ORDER NOT EXECUTED" and its delivery date passed (in the last two days). */
  overdueNotExecuted: boolean;
  /** Cancelled or rejected on the portal by somebody other than MDG. */
  closedOnPortal: boolean;
  /** Linked to its chat order on a loose match (same date and fuels, any KL); a person was told. */
  linkedLoosely: boolean;
  /** ISO. When MDG first saw a tanker on it. */
  tankerAssignedAt: string | null;
  /** The portal's answer to our Submit, when MDG placed it. */
  submit: {
    verdict: string | null;
    reason: string | null;
    portalText: string | null;
    shortBy: number | null;
    at: string | null;
  } | null;
  cancel: { state: FuelCancelState; portalText: string | null; at: string | null } | null;
  /** ISO. The last read of the portal that listed it. */
  lastSeenAt: string | null;
  /**
   * The owner's "yes" that sent it to the portal. Null for an order the dealer
   * placed himself. Optional because only the admin's Data Vault view fills it in
   * (it costs a lookup of the owner's name); the agent never needs it.
   */
  confirmed?: FuelConfirmView | null;
  /**
   * Whether the outlet's chats were told about the tanker. Null until there was a
   * tanker to tell about. Optional for the same reason as `confirmed`.
   */
  tankerMessage?: FuelNoticeView | null;
  /** Admin only: every message MDG owes or sent about it, and the trail of the yes. */
  trail?: FuelOrderTrailView;
}

/** What the admin's per-order timeline is drawn from. */
export interface FuelOrderTrailView {
  /** Every notice slot, by event. */
  notices: Partial<Record<FuelIndentEvent, FuelNoticeView & { key: string | null; messageIds: string[] }>>;
  /** The orders the owner was shown on the read-back as already there (`sap:<no>` / `id:<id>`). */
  acknowledgedKeys: string[];
  /** The owner's yes was the "ek aur" kind: another load on top of an order already there. */
  extraConfirmed: boolean;
  readBackMessageId: string | null;
  turnId: string | null;
  /** The last time the robot could not reach the portal for it. */
  lastAttempt: { code: string; at: string | null } | null;
  /** The owner asked to stop it when it was too late; the placed message offers the cancel. */
  cancelWanted: { at: string | null } | null;
  /** Who set each part of the draft, and when (ISO). */
  setBy: {
    deliveryDate: { userName: string | null; at: string | null } | null;
    lines: { product: FuelProduct; kl: number | null; userName: string | null; at: string | null }[];
    tanker: { userName: string | null; at: string | null } | null;
  } | null;
  /** The order this one replaces (cancel + new). */
  replacesOrderNo: string | null;
  /** The press's run, when there was one. */
  runId: string | null;
}

/** Who said yes to an order in the chat, in their own words, and when. */
export interface FuelConfirmView {
  /** The owner's name, looked up when the view is built; null when the user is gone. */
  byName: string | null;
  /** The message the owner confirmed with, verbatim. */
  text: string | null;
  /** ISO. */
  at: string | null;
}

/**
 * One message MDG owes the dealer about an order (`notices.<event>` on the
 * record): `claimed` = being posted now, or a post that died midway and will be
 * retried; `posted` = in the chat; `failed` = the post failed and the next run
 * retries it; `skipped` = deliberately not sent (the tanker was long gone when
 * the order was first seen).
 */
export interface FuelNoticeView {
  state: 'claimed' | 'posted' | 'failed' | 'skipped';
  /** ISO. */
  at: string | null;
}

/** Why placing is off for an outlet, when it is (`placingBlock`). */
export type FuelPlacingBlock =
  | 'switched_off'
  | 'outside_pilot'
  | 'not_attached'
  | 'paused'
  | 'no_login'
  | 'placing_paused';

/**
 * Placing paused by an admin, without a restart and without stopping the
 * tracking: everywhere (super-admin), or for one outlet.
 */
export interface FuelPlacingControlView {
  globalPlacingOn: boolean;
  globalReason: string | null;
  /** ISO. When the global pause lifts by itself; null = until switched back on. */
  globalUntil: string | null;
  dealerPlacingPaused: boolean;
  dealerReason: string | null;
  dealerUntil: string | null;
}

/** A draft the owner is building or has just confirmed. */
export interface FuelDraftView {
  id: string;
  state: FuelIndentState;
  conversationId: string | null;
  deliveryDate: string | null;
  tanker: 'own' | 'hired' | null;
  transporterTT: boolean;
  splitLoad: boolean;
  lines: { product: FuelProduct; smscd: string; kl: number }[];
  totalKl: number;
  fingerprint: string;
  /** ISO. */
  updatedAt: string | null;
  confirmedAt: string | null;
  /** The owner who started it, by name. Optional: only the admin's view fills it in. */
  startedByName?: string | null;
}

/** One fuel the outlet may order, as Create Indent lists it. */
export interface FuelCatalogProductView {
  smscd: string;
  matkl: string;
  product: FuelProduct | null;
  contract: string | null;
}

/** The admin's Data Vault pane: `GET /api/v1/fuel-indent/dealers/:dealerId`. */
export interface FuelIndentVaultView {
  dealerId: string;
  attachment: {
    status: string | null;
    /** ISO. */
    nextRunAt: string | null;
    lastRunAt: string | null;
  };
  /** Placing and cancelling are switched on for this outlet and its login works. */
  placingEnabled: boolean;
  /**
   * Why placing is off, when it is: switched off everywhere, outlet outside the
   * pilot list, service not attached or paused, or the SDMS login not working.
   * Optional so an older server's answer still reads.
   */
  placingBlock?: FuelPlacingBlock | null;
  /** The admin's pauses. Optional so an older server's answer still reads. */
  control?: FuelPlacingControlView;
  /** ISO. The last read of View/Cancel Indents that worked. */
  lastCheckedAt: string | null;
  catalog: {
    products: FuelCatalogProductView[];
    capturedAt: string | null;
    /** A total the plant refused as below its minimum tanker size; the minimum is above it. */
    minTotalKlRefused: number | null;
  } | null;
  orders: FuelOrderView[];
  drafts: FuelDraftView[];
}
