import type { PlannerView } from '@dk/shared/types';

/**
 * The plan's state as the planner reads it, and the one thing they can do about it
 * from the app (ADR 0058 §5, §13.3). Never a pay button: the payment details go to
 * WhatsApp and SMS, and the app only asks for them to be sent.
 *
 *  - `active`: paid through today or later. Nothing to do.
 *  - `waiting`: a bill is out and not paid yet. "Send the payment details again" (never
 *    "link": the words show inside the phone apps, ADR 0058 §13.4).
 *  - `paused`: a bill went unpaid for 7 days and the server closed it. "Get the
 *    payment details again", which goes down the "Start again" road: a fresh bill
 *    on WhatsApp and SMS.
 *  - `stopped`: no bill is waiting, and the paid month (if any) is over: autopay was
 *    stopped, a renewal charge failed, or the first bill never went. "Start again",
 *    which sends a fresh approval.
 */
export type PlanState = 'active' | 'waiting' | 'paused' | 'stopped';
export type PlanAction = 'resend' | 'restart' | null;

export interface PlanSummary {
  state: PlanState;
  action: PlanAction;
  /** `YYYY-MM-DD` the plan is paid through, or null before the first payment. */
  paidThrough: string | null;
  /** Active, but autopay is off: the plan ends after `paidThrough`. */
  ending: boolean;
  /** Active and renewing by autopay. */
  autopay: boolean;
}

export function planSummary(view: PlannerView): PlanSummary {
  const paidThrough = view.paidThrough ?? null;
  if (view.active) {
    const ending = view.bill.state === 'stopped' || !view.bill.autopay;
    return { state: 'active', action: null, paidThrough, ending, autopay: !ending };
  }
  if (view.bill.state === 'sent') {
    return { state: 'waiting', action: 'resend', paidThrough, ending: false, autopay: false };
  }
  if (view.bill.state === 'closed') {
    return { state: 'paused', action: 'restart', paidThrough, ending: false, autopay: false };
  }
  return { state: 'stopped', action: 'restart', paidThrough, ending: false, autopay: false };
}

/**
 * Whether the plan's one button may show here (ADR 0022 §1, ADR 0058 §13.4). In an
 * ordinary browser, whenever the state has one. Inside the phone apps, only while the
 * server's `BILL_RESEND_IN_APP` switch allows it, exactly as the outlet bill strip
 * decides its "Send again" (`showSendAgain`). An older server that does not say is
 * read as "not allowed", the safe side.
 *
 * `payHere` is `canPayHere()`, passed in so this stays a plain function to test.
 */
export function planSendable(plan: PlanSummary, view: PlannerView, payHere: boolean): boolean {
  if (!plan.action) return false;
  return payHere || view.resendInApp === true;
}

/**
 * The plan card's body lines, as message keys with their values. Two sets of words:
 *
 *  - where the button shows, the lines say what it does and where the details go
 *    (WhatsApp and SMS);
 *  - inside the phone apps without the button, the state alone. A line there that
 *    says where the payment link is, or how to pay, is the kind of "messaging" that
 *    Google Play's payments rule forbids (ADR 0022 §1), so it is left out, just as the
 *    outlet bill strip says only "Bill · any time in 5 days".
 */
export type PlanLine =
  | { key: 'planner.activeUntil' | 'planner.activeEnds' | 'planner.endedBody' | 'planner.endedBodyApp'; date: string }
  | {
      key:
        | 'planner.activeAutopay'
        | 'planner.waitingBody'
        | 'planner.waitingBodyApp'
        | 'planner.pausedBody'
        | 'planner.pausedBodyApp'
        | 'planner.stoppedBody'
        | 'planner.stoppedBodyApp';
    };

export function planLines(plan: PlanSummary, date: string | null, sendable: boolean): PlanLine[] {
  const lines: PlanLine[] = [];
  if (plan.state === 'active') {
    if (date) lines.push({ key: 'planner.activeUntil', date });
    if (plan.ending && date) lines.push({ key: 'planner.activeEnds', date });
    else if (plan.autopay) lines.push({ key: 'planner.activeAutopay' });
  } else if (plan.state === 'waiting') {
    lines.push({ key: sendable ? 'planner.waitingBody' : 'planner.waitingBodyApp' });
  } else if (plan.state === 'paused') {
    lines.push({ key: sendable ? 'planner.pausedBody' : 'planner.pausedBodyApp' });
  } else if (date) {
    // A paid month that ran out (autopay stopped, a renewal that did not go through).
    lines.push({ key: sendable ? 'planner.endedBody' : 'planner.endedBodyApp', date });
  } else {
    lines.push({ key: sendable ? 'planner.stoppedBody' : 'planner.stoppedBodyApp' });
  }
  return lines;
}

/** The button's words for this state: "Send the payment details again", "Get the payment details again" or "Start again". The strip above the chat and the chat's own lines use the same words. */
export function planButtonKey(
  plan: PlanSummary,
): 'planner.resend' | 'planner.getDetailsAgain' | 'planner.restart' | null {
  if (plan.action === 'resend') return 'planner.resend';
  if (plan.state === 'paused') return 'planner.getDetailsAgain';
  if (plan.action === 'restart') return 'planner.restart';
  return null;
}

/**
 * Whether the plan's price may be printed on the card. In a browser, always. Inside the
 * phone apps only beside an active plan (what is being paid for, read-only); next to a
 * plan waiting for money the price reads as a call to pay (ADR 0022 §1).
 */
export function showPlanPrice(plan: PlanSummary, payHere: boolean): boolean {
  return payHere || plan.state === 'active';
}

/** Where a send went, in the reader's words: "WhatsApp and SMS". Empty when the answer named nowhere. */
export function sentPlaces(
  r: { whatsapp?: boolean; sms?: boolean; email?: boolean } | null | undefined,
  words: { and: string; email: string },
): string {
  if (!r) return '';
  const names = [r.whatsapp ? 'WhatsApp' : null, r.sms ? 'SMS' : null, r.email ? words.email : null].filter(
    (n): n is string => n !== null,
  );
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${words.and} ${names.at(-1)}`;
}
