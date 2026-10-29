/**
 * What "Send bill" answers and what its form starts from (onboarding v2, the
 * billing workstream; docs/specs/onboarding-v2.md phase 3, ADR 0022).
 *
 * The bill is a Payment row (`types/payment.ts`); this file only holds the shapes
 * that belong to sending it OUTSIDE the app. The dealer's app never sees any of
 * this: Google Play forbids asking for money inside it (ADR 0022 §1), so the
 * amount and due date travel on WhatsApp and Razorpay's SMS, and the app shows
 * them read-only.
 */

import type { OutletSetupAdmin, SetupMessageLang } from './outletSetup';

/**
 * How the bill's WhatsApp message went. With an approved utility template
 * (`WHATSAPP_PAYMENT_TEMPLATE`) the server sends it. Without one — or when it
 * could not go — the team gets the words and a wa.me link that opens WhatsApp
 * with them ready, and sends it by hand, as Approve does for the welcome.
 */
export type SetupBillWhatsApp =
  | { sent: true }
  | {
      sent: false;
      /** Why not, in plain words ("The WhatsApp template is not approved yet"). */
      reason: string;
      /** The message, in the language chosen for it (one language, never both), for a person to send by hand. */
      text: string;
      /** A wa.me link that opens WhatsApp with `text` ready to send. */
      waLink: string;
    };

/** The Razorpay link made for the bill, and where Razorpay sent it by SMS or email. */
export interface SetupBillLink {
  url: string;
  sentTo: { phone: string | null; email: string | null };
  /**
   * True when the link is an autopay approval (ADR 0022 §13.1): approving it pays
   * this bill and takes the monthly price every month after. Absent or false: a
   * one-time payment link.
   */
  autopay?: boolean;
}

/** What `POST /dealers/:id/setup/bill` answers: the outlet's fresh setup, and how the bill went out. */
export interface SendSetupBillResult {
  setup: OutletSetupAdmin;
  whatsapp: SetupBillWhatsApp;
  /** The language the bill's WhatsApp is in: what the admin chose, else the outlet's default. */
  messageLang: SetupMessageLang;
  /** Null when payments are not switched on, or Razorpay could not make the link (see `linkError`). */
  link: SetupBillLink | null;
  linkError: string | null;
  /** The Payment row the bill is, so the admin can open it on the Payments page. */
  payment: { id: string; number: string };
  /**
   * False when an open bill of the same amount and due day was already there:
   * nothing new was raised, only the message and the link went out again.
   */
  created: boolean;
}

/** What the "Send bill" form starts from (`GET /admin/onboarding/config`). */
export interface OnboardingConfig {
  /** The flat monthly price, GST included, in paise. */
  monthlyPricePaise: number;
  /** Days from a bill to its due date. */
  dueDays: number;
  /** The Razorpay keys are in: a bill then gets a payment link, and Razorpay texts it. */
  paymentsConfigured: boolean;
  /** An approved WhatsApp bill template is set: the server then sends the bill message itself. */
  whatsappBillTemplate: boolean;
  /**
   * Send bill sends a first bill at the monthly price as the autopay approval
   * (`FIRST_BILL_AUTOPAY`, on unless switched off on the server).
   */
  firstBillAutopay: boolean;
  /**
   * A first bill BELOW the monthly price also goes as the autopay approval: the
   * approval takes that amount now (Razorpay's "upfront amount") and the monthly
   * price from a month after Send bill (`FIRST_MONTH_UPFRONT`, OFF until a live test
   * has proven it). Off: such a bill goes as a one-time payment link.
   */
  firstMonthUpfront: boolean;
  /**
   * Outlet codes it is on for while it is not on for all
   * (`FIRST_MONTH_UPFRONT_OUTLETS`): how the live test runs on one outlet. On for an
   * outlet = `firstMonthUpfront || firstMonthUpfrontOutlets.includes(code)`.
   */
  firstMonthUpfrontOutlets: string[];
  /**
   * Every change to the monthly price, newest first. A bill keeps the price it
   * was raised at; a change applies to bills raised after it.
   */
  priceHistory: Array<{ monthlyPricePaise: number; at: string; byName: string }>;
}
