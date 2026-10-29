/**
 * Autopay: the monthly bill taken by itself, through a Razorpay subscription
 * (ADR 0022 §13).
 *
 * The dealer approves ONCE, with their UPI PIN (or a card), on Razorpay's own
 * page opened from an SMS/WhatsApp link — never from inside the Android app
 * (Google Play, ADR 0022 §1). After that Razorpay takes the monthly price on the
 * day each paid month runs out, and every debit lands on the outlet's bill for
 * that month through the same single paid step as any other payment: the GST
 * invoice, the receipt and the paid-through day follow as they always do.
 *
 * STOPPING IS EASY ON PURPOSE. India's dark-patterns rules (CCPA, 2023) forbid a
 * hidden, long or unclear cancel, and the dealer can switch autopay off in their
 * UPI app anyway — where we would hear no reason and get no chance to call. So
 * the app's stop is one screen and one confirm, a reason is optional, and the
 * effort to keep the dealer goes into a phone call (`autopay_stopped`), not into
 * the screen. Stopping autopay does NOT end the service: the paid month runs
 * out, and the next month's bill comes as a link, as it did before autopay.
 */

/** Razorpay's own words for a subscription's state. */
export const AUTOPAY_STATUSES = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'expired',
  'paused',
] as const;
export type AutopayStatus = (typeof AUTOPAY_STATUSES)[number];

/** States in which the mandate is in place and Razorpay will (try to) take the money. */
export const AUTOPAY_MANDATE_STATUSES: readonly AutopayStatus[] = [
  'authenticated',
  'active',
  'pending',
];

/**
 * What the screens say, in four words:
 *  - `setting_up`  the approval link went out and the dealer has not approved yet
 *  - `on`          approved: the next month is taken by itself
 *  - `failing`     the last debit failed and Razorpay is trying again
 *  - `off`         stopped (by the dealer, their UPI app, an admin, or failed for good)
 */
export const AUTOPAY_VIEW_STATES = ['setting_up', 'on', 'failing', 'off'] as const;
export type AutopayViewState = (typeof AUTOPAY_VIEW_STATES)[number];

/** Why the dealer stopped it. Optional, never required to stop. */
export const AUTOPAY_STOP_REASONS = [
  'pay_myself',
  'too_expensive',
  'not_useful',
  'closing',
  'other',
] as const;
export type AutopayStopReason = (typeof AUTOPAY_STOP_REASONS)[number];

/** The admin's words for each reason. The dealer app carries its own, in Hindi and English. */
export const AUTOPAY_STOP_REASON_LABELS: Record<AutopayStopReason, string> = {
  pay_myself: 'Wants to pay each month himself',
  too_expensive: 'Price is too much',
  not_useful: 'Not useful enough, or something is broken',
  closing: 'Closing or selling the pump',
  other: 'Something else',
};

/** What ended an autopay. */
export const AUTOPAY_ENDED_BY = [
  /** The owner pressed "Stop autopay" in the app. */
  'dealer',
  /** An admin stopped it, on the owner's word. */
  'admin',
  /** Razorpay reported it cancelled and we had not asked: the owner switched it off in their UPI app or bank. */
  'upi_app',
  /** Razorpay gave up after its retries; we cancelled it and the bill went out as a link. */
  'halted',
  /** The approval link ran out before the dealer approved. */
  'expired',
  /** Every planned month was taken. */
  'completed',
] as const;
export type AutopayEndedBy = (typeof AUTOPAY_ENDED_BY)[number];

export const AUTOPAY_ENDED_BY_LABELS: Record<AutopayEndedBy, string> = {
  dealer: 'Stopped by the owner in the app',
  admin: 'Stopped by MDG',
  upi_app: 'Stopped from the UPI app or bank',
  halted: 'Stopped after the debits kept failing',
  expired: 'Approval link ran out',
  completed: 'Every month taken',
};

/** What the owner's app shows (`GET /payments/me/autopay`). */
export interface DealerAutopay {
  state: AutopayViewState;
  /** The outlet's code, e.g. `15E`, so an owner with several pumps stops the right one. */
  outletCode: string;
  /** What is taken each month, GST included. */
  amountPaise: number;
  /** `YYYY-MM-DD`: the next day money will be taken. Null when off, or not known yet. */
  nextDebitOn: string | null;
  /** `YYYY-MM-DD`: the last day the services are paid for. */
  paidThrough: string | null;
  /** A debit is being taken or retried right now; stopping will not undo it. */
  debitInProgress: boolean;
  /** When it was stopped; null unless off. */
  stoppedAt: string | null;
  /** The outlet is still inside its first paid month, which is refunded in full on request. */
  firstMonthRefundable: boolean;
  /** When the owner stopped it and asked for the first month back; the refund follows a call. Null otherwise. */
  refundAskedAt: string | null;
}

export interface DealerAutopayStatus {
  /** Null when there is nothing to show: never set up, or stopped and the paid month is over. */
  autopay: DealerAutopay | null;
}

/** One autopay as an admin sees it. */
export interface AdminAutopay {
  id: string;
  dealerId: string;
  dealerCode: string;
  status: AutopayStatus;
  state: AutopayViewState;
  amountPaise: number;
  mode: 'test' | 'live';
  razorpaySubscriptionId: string;
  /** Razorpay's approval page. Only worth sending while `setting_up`. */
  approvalUrl: string | null;
  /** Where Razorpay was asked to send the approval link. */
  sentTo: { phone: string | null; email: string | null } | null;
  /** `YYYY-MM-DD`: the first planned debit; null when the first debit is taken at approval. */
  firstDebitOn: string | null;
  nextDebitOn: string | null;
  /** Months taken so far. */
  chargedCount: number;
  lastChargedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  createdByName: string;
  /**
   * The outlet's first bill, when autopay was set up to take it: the owner's
   * approval takes the first month and pays it. Null for an autopay that starts
   * after a paid month.
   */
  firstBillId: string | null;
  endedAt: string | null;
  endedBy: AutopayEndedBy | null;
  endedByName: string | null;
  stopReason: AutopayStopReason | null;
  stopNote: string | null;
  /** The call after a stop: who made it and what they heard. */
  followUp: { doneAt: string; byName: string; note: string } | null;
  /** When the approval link stops working (ISO); null once approved or when not known. */
  approvalExpiresAt: string | null;
  /** The owner stopped it and asked for the first month back (ISO); null otherwise. */
  refundAskedAt: string | null;
}

/** An outlet's autopay on the admin's outlet page (`GET /admin/autopay/dealers/:dealerId`). */
export interface AdminAutopayOverview {
  /** The one not ended, if any. */
  current: AdminAutopay | null;
  /** Ended ones, newest first. */
  history: AdminAutopay[];
  /** Whether "Set up autopay" can be pressed now, and if not, why in plain words. */
  canStart: boolean;
  cannotStartReason: string | null;
  /** What a new autopay would take each month (the current monthly price), GST included. */
  monthlyPricePaise: number;
  paidThrough: string | null;
  /** The outlet's first bill and whether its first-month money-back can be given now. Null before it is sent. */
  firstMonth: AutopayFirstMonth | null;
  /**
   * "Send a pay link instead" can be pressed: a first-month approval is out and
   * nobody has approved it. False otherwise.
   */
  canPayLinkInstead: boolean;
  /**
   * While an approval waits: the WhatsApp words with its link, in the outlet's
   * language, and a wa.me link that opens WhatsApp with them — for a person to
   * send or send again at any time. Null when no approval is waiting.
   */
  approvalWords: { text: string; waLink: string | null } | null;
}

/**
 * The first month, for the money-back promise: refunded in full on request while
 * that month runs, once. The money-back stops autopay first, then refunds the
 * first bill, which issues its credit note.
 */
export interface AutopayFirstMonth {
  paymentId: string;
  /** Our bill number, e.g. `MDG-2026-00012`. */
  number: string;
  amountPaise: number;
  /** Paid, refunded, still due… the bill's own status. */
  status: 'due' | 'processing' | 'paid' | 'cancelled' | 'partially_refunded' | 'refunded';
  /** `YYYY-MM-DD`, once paid. */
  paidOn: string | null;
  /** `YYYY-MM-DD`: the last day of the first month, once paid. */
  refundableUntil: string | null;
  canMoneyBack: boolean;
  /** Why the money-back cannot be given now, in plain words; null when it can. */
  moneyBackReason: string | null;
  /**
   * The first month came by hand (bank, UPI, cash, cheque): the money-back then
   * records the refund given back by hand — how and on which day — instead of
   * asking Razorpay. What came is `paidPaise` (less than the bill when tax was deducted).
   */
  paidByHand: boolean;
  paidPaise: number;
}

/** What "Set up autopay" answers: the autopay, and the words for a person to send on WhatsApp. */
export interface StartAutopayResult {
  autopay: AdminAutopay;
  /** The message with the approval link, in the outlet's language, for a person to send. */
  whatsappText: string;
  /** A wa.me link that opens WhatsApp with `whatsappText` ready, or null with no number. */
  waLink: string | null;
}
