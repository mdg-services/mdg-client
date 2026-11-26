/**
 * New Pump Guide (ADR 0058): a paid rule-book chat for a person who is planning
 * to open a petrol pump and does not run one yet.
 *
 * A planner is an ordinary `Dealer` with `status: 'PLANNING'` and an owner login,
 * so bills, autopay, invoices, chat and the language setting all work as they do
 * for an outlet. These are the few words that are the planner's own.
 */

/**
 * The oil company the person has in mind. `other` and `undecided` exist because a
 * person at this stage often has not chosen, and a guess would steer the answers wrong.
 */
export const PLANNER_OIL_COMPANIES = ['iocl', 'bpcl', 'hpcl', 'other', 'undecided'] as const;
export type PlannerOilCompany = (typeof PLANNER_OIL_COMPANIES)[number];

/** Where they said they were at sign-up. Read by the answers so a builder is not told how to apply. */
export const PLANNER_STAGES = ['exploring', 'applied', 'selected', 'building'] as const;
export type PlannerStage = (typeof PLANNER_STAGES)[number];

/** What the app reads: GET /v1/me/planner */
export interface PlannerView {
  /** Paid through today or later. */
  active: boolean;
  /** `YYYY-MM-DD`, India time. Null until the first payment. */
  paidThrough: string | null;
  /**
   * `closed`: a bill went unpaid for 7 days and was closed (ADR 0058 §13.3); the one button
   * asks for fresh payment details, which come on WhatsApp and SMS.
   */
  bill: { state: 'none' | 'sent' | 'paid' | 'stopped' | 'closed'; amountPaise: number; autopay: boolean };
  /**
   * Whether the phone apps may show the button that sends the payment details again
   * (`BILL_RESEND_IN_APP`, ADR 0022 §1). An ordinary browser shows it either way.
   */
  resendInApp: boolean;
  /** 19900: ₹199 before GST. */
  priceBeforeGstPaise: number;
  /** 23482: ₹199 plus 18% GST. */
  priceTotalPaise: number;
  /** GST state code, e.g. "06". */
  stateCode: string;
  district: string | null;
  oilCompany: PlannerOilCompany;
  stage: PlannerStage;
  questionsToday: number;
  /** ISO; set once the pump switched to Dealer Kavach. */
  convertedAt: string | null;
}
