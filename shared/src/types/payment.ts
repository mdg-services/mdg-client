/**
 * Payments — what a dealer owes MDG and how it was paid, through Razorpay
 * (ADR 0022).
 *
 * ONE ROW PER THING TO PAY, NOT PER ATTEMPT. A payment is raised (by an admin,
 * or later by the product itself) for an amount and a reason. The dealer may
 * try three times — a UPI app that timed out, a card the bank declined, then a
 * UPI payment that went through — and it is still one payment, `paid`, with
 * the two failures listed under it. Razorpay's own words (order, payment,
 * payment link, refund) stay on the Razorpay side: our row is the bill.
 *
 * MONEY IS WHOLE PAISE, always an integer. ₹4,999 is `499900`. Nothing here
 * is ever a float of rupees, and nothing the browser sends ever sets an amount:
 * the server reads the amount off the row when it asks Razorpay for an order.
 *
 * Shared because the server, the dealer app and the admin app all label the
 * same statuses and format the same amounts, and two copies of a status table
 * is how a refunded payment ends up shown as paid.
 */

/**
 * `due` — waiting to be paid. Failed attempts leave it here.
 * `processing` — Razorpay has the money authorised or the UPI app has not
 *   answered yet; it settles to `paid` or back to `due` by itself.
 * `paid` — captured, in full.
 * `cancelled` — withdrawn by an admin before anything was paid.
 * `partially_refunded` / `refunded` — paid, then part or all of it given back.
 */
export const PAYMENT_STATUSES = [
  'due',
  'processing',
  'paid',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Statuses in which the dealer can still pay. */
export const PAYABLE_STATUSES: readonly PaymentStatus[] = ['due', 'processing'];

/** Statuses that mean money reached us (whatever happened to it afterwards). */
export const SETTLED_STATUSES: readonly PaymentStatus[] = [
  'paid',
  'partially_refunded',
  'refunded',
];

/** What the payment is for. Picked by the admin when raising it. */
export const PAYMENT_PURPOSES = ['subscription', 'setup', 'service', 'other'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/**
 * How the dealer paid. `checkout` is Razorpay's pop-up in the web app, opened
 * in a browser; `link` is a Razorpay payment link that reached the dealer by
 * SMS, email or WhatsApp. Never from inside the Android app: Google Play's
 * Payments policy forbids a pay button or a link to one in an app that sells
 * software (ADR 0022 §4).
 */
export const PAYMENT_CHANNELS = ['checkout', 'link'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const REFUND_STATUSES = ['pending', 'processed', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Razorpay's floor: ₹1. */
export const PAYMENT_MIN_PAISE = 100;
/** Our ceiling per payment: ₹5,00,000. A typo guard, not a Razorpay limit. */
export const PAYMENT_MAX_PAISE = 5_00_000_00;

/** One try at paying that did not become the payment (or that did). */
export interface PaymentAttempt {
  razorpayPaymentId: string;
  status: 'failed' | 'authorized' | 'captured';
  /** `upi`, `card`, `netbanking`, `wallet`, … as Razorpay names it. */
  method: string | null;
  /** Razorpay's plain reason for a failure, e.g. "Payment was cancelled by the customer". */
  reason: string | null;
  at: string;
}

export interface PaymentRefund {
  razorpayRefundId: string;
  amountPaise: number;
  status: RefundStatus;
  reason: string;
  byName: string;
  createdAt: string;
  processedAt: string | null;
}

/**
 * A second capture on a payment that was already paid (the dealer paid by the
 * link AND in the pop-up) or that had been cancelled. It is refunded in full
 * automatically, and raises a `payment_problem` alert so a person checks.
 */
export interface PaymentExtraCapture {
  razorpayPaymentId: string;
  amountPaise: number;
  razorpayRefundId: string | null;
  at: string;
}

/** What a dealer sees of a payment. */
export interface DealerPayment {
  id: string;
  /** Our receipt number, e.g. `MDG-2026-00012`. Also Razorpay's `receipt`. */
  number: string;
  title: string;
  purpose: PaymentPurpose;
  note: string | null;
  amountPaise: number;
  currency: 'INR';
  status: PaymentStatus;
  /** `YYYY-MM-DD`, or null when no date was set. */
  dueDate: string | null;
  createdAt: string;
  paidAt: string | null;
  /** How it was paid, once paid: `upi`, `card`, … */
  method: string | null;
  /** Razorpay's payment id — the reference a bank or Razorpay support asks for. */
  razorpayPaymentId: string | null;
  refundedPaise: number;
  /** The most recent failed try, while the payment is still due. */
  lastFailure: { reason: string; at: string } | null;
}

/** What an admin sees of a payment. */
export interface AdminPayment extends DealerPayment {
  dealerId: string;
  dealerCode: string;
  createdByName: string;
  razorpayOrderId: string | null;
  razorpayLinkId: string | null;
  linkUrl: string | null;
  paidVia: PaymentChannel | null;
  /** Razorpay's fee and the GST on it, in paise, once paid. */
  feePaise: number | null;
  taxPaise: number | null;
  attempts: PaymentAttempt[];
  refunds: PaymentRefund[];
  extraCaptures: PaymentExtraCapture[];
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  /** Where Razorpay sent the payment link by SMS / email, if it did. */
  linkSentTo: { phone: string | null; email: string | null } | null;
  /**
   * Something a person must look at (rules 5 and the wrong-amount row of the
   * table in ADR 0022 §5). Raises the `payment_problem` alert, which clears when
   * an admin marks it checked.
   */
  problem: { reason: string; at: string; checkedAt: string | null; checkedByName: string | null } | null;
  updatedAt: string;
}

/** Whether the server can take payments, and in which Razorpay mode. */
export interface PaymentsConfig {
  /** Key id and secret are both set. Without them every payment route answers 503. */
  configured: boolean;
  /** From the key id's prefix: `rzp_test_…` or `rzp_live_…`. */
  mode: 'test' | 'live' | null;
  /** The webhook secret is set, so Razorpay's own reports are being read. */
  webhookConfigured: boolean;
}

/** Everything the browser needs to open Razorpay's pop-up for one payment. */
export interface PaymentCheckout {
  /** Public key id. The secret never leaves the server. */
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  /** Shown at the top of the pop-up. */
  name: string;
  description: string;
  number: string;
  prefill: { name: string | null; contact: string | null; email: string | null };
}

/** A Razorpay payment link for one payment, to open in the phone's browser. */
export interface PaymentLink {
  url: string;
  expiresAt: string | null;
}

export interface DealerPaymentsList {
  items: DealerPayment[];
}

export interface AdminPaymentsList {
  items: AdminPayment[];
  total: number;
  page: number;
  limit: number;
  /** Over everything the filter matches, not just this page. */
  totals: { duePaise: number; paidPaise: number; refundedPaise: number };
}

/** The admin's words for each status. The dealer app carries its own, in Hindi and English. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  due: 'Due',
  processing: 'Being confirmed',
  paid: 'Paid',
  cancelled: 'Cancelled',
  partially_refunded: 'Part refunded',
  refunded: 'Refunded',
};

export const PAYMENT_PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  subscription: 'Subscription',
  setup: 'Setup fee',
  service: 'A service',
  other: 'Other',
};
