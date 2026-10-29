import { formatPaise } from './money';

/**
 * "What the dealer receives" — the preview every admin money window shows BEFORE
 * the press (ADR 0022 §13.2): what the dealer is charged, and every message that
 * goes to them, on which channel, in plain words. The admin renders it from the
 * facts on screen; the server's tests run each action for real against fakes and
 * compare what went out with what this said, so the two cannot drift apart.
 *
 * Pure: no I/O, no clock. Words are for the ADMIN (English), not the dealer.
 */

/** One money action, with the facts on screen that decide what it sends. */
export type MoneyAction =
  | {
      kind: 'send_bill';
      /** The bill goes as the autopay approval (at the monthly price, autopay switched on). */
      autopay: boolean;
      /** An open bill with the same figures, or an approval already out: only sent again. */
      resend: boolean;
      /** Razorpay keys are on. */
      paymentsOn: boolean;
      amountPaise: number;
      /** The very first bill for this outlet: the app's one "bill sent" chat line. */
      firstEver: boolean;
      /**
       * An autopay approval for this outlet is already out, so Razorpay does not text it
       * a second time (it texts an approval only once). Left out, it counts as `resend`:
       * pressing Send bill again on a bill whose approval went out.
       */
      approvalOut?: boolean;
    }
  | {
      kind: 'request_payment';
      /** "Send the link by SMS" is ticked. */
      sendLink: boolean;
      amountPaise: number;
      /** A "Subscription" payment with a due day on a new-onboarding outlet: the WhatsApp reminders apply. */
      remindersApply: boolean;
    }
  | {
      kind: 'send_sms';
      /** The link was texted before, so this is a second send. */
      again: boolean;
    }
  | { kind: 'copy_link' }
  | {
      kind: 'record_payment';
      /** The outlet's first bill: the quiet thank-you chat line, and the login box if logins are missing. */
      firstBill: boolean;
      loginsMissing: boolean;
      amountPaise: number;
    }
  | { kind: 'more_time'; tellDealer: boolean; dueOn: string }
  | { kind: 'hold_chasing'; until: string | null }
  | { kind: 'pay_link_instead'; amountPaise: number; paymentsOn: boolean }
  | {
      kind: 'set_up_autopay';
      /** The approval takes the first month now (no paid month yet). */
      firstMonth: boolean;
      amountPaise: number;
      /** `YYYY-MM-DD` of the first planned debit; null when taken at approval. */
      firstDebitOn: string | null;
    }
  | {
      kind: 'stop_autopay_admin';
      /** A bill is waiting that autopay was meant to take (or the first bill, when the approval is stopped). */
      billWaiting: boolean;
      /**
       * The owner had approved this autopay. When nobody approved it (a first-month
       * approval still waiting), the stop is silent: the owner is not told about autopay,
       * and the first bill goes out at once as a one-time payment link.
       */
      approved: boolean;
      /** The bill autopay was going to take is on hold, so no link goes now. */
      billHeld: boolean;
    }
  | {
      kind: 'money_back';
      amountPaise: number;
      byHand: boolean;
      /**
       * Autopay is running, so the money-back stops it first and the owner is told. Left
       * out, the preview says "if autopay is running" instead of guessing.
       */
      autopayRunning?: boolean;
    }
  | { kind: 'refund'; amountPaise: number; byHand: boolean }
  | { kind: 'cancel_payment'; renewal: boolean }
  | { kind: 'pause_services' }
  | { kind: 'resume_services' }
  | { kind: 'start_services' };

export type MoneyActionKind = MoneyAction['kind'];

/** Where a message reaches the dealer. */
export const DEALER_RECEIPT_CHANNELS = [
  /** A notification on their phone from the Dealer Kavach app. */
  'app_push',
  /** A line in the app's chat. */
  'app_chat',
  /** WhatsApp, sent by template when it can be, else words handed to the admin. */
  'whatsapp',
  /** WhatsApp words the admin sends by hand: nothing goes unless they do. */
  'whatsapp_by_hand',
  /** Razorpay's own SMS and email, in Razorpay's words. */
  'razorpay',
  /** Nothing is sent; something changes quietly on a screen in the app. */
  'app_screen',
] as const;
export type DealerReceiptChannel = (typeof DEALER_RECEIPT_CHANNELS)[number];

/** The small label the admin's box puts in front of each message. */
export const DEALER_RECEIPT_CHANNEL_LABEL: Record<DealerReceiptChannel, string> = {
  app_push: 'App notification',
  app_chat: 'App chat',
  whatsapp: 'WhatsApp',
  whatsapp_by_hand: 'WhatsApp \u2014 you send it',
  razorpay: 'Razorpay SMS and email',
  app_screen: 'In the app, quietly',
};

export interface DealerReceipt {
  channel: DealerReceiptChannel;
  /** One plain sentence for the admin: what arrives and what it says. */
  words: string;
}

export interface DealerReceivesPreview {
  /** What leaves the dealer's account because of this press, in words; null when nothing does. */
  charged: string | null;
  /** Every message, in the order they arrive. Empty: nothing at all is sent. */
  lines: DealerReceipt[];
  /** Things outside our control worth knowing (Razorpay's own reminders, the bank's 24-hour notice). */
  notes: string[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-28` as "28 Oct 2026". Anything that is not a day is shown as typed. */
function dayWords(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : day;
}

/** The same sentence for every action that makes Razorpay text the payment link. */
const RAZORPAY_LINK_TEXT =
  "Razorpay texts and emails the payment link, in Razorpay's own words, to the phone number and email on file.";
const RAZORPAY_REMINDERS =
  'Razorpay may send its own reminder before the payment link runs out.';
const UPI_NOTICE = 'Their UPI app tells them a day before every debit.';
/**
 * The bill on WhatsApp. Sent by the system (so only by template, and only when the
 * owner agreed to WhatsApp), or else the words are handed to the admin to send.
 */
const WHATSAPP_BILL_TEXT =
  'The bill on WhatsApp, with the payment link. It goes by template when the WhatsApp bill template is on and the owner agreed to WhatsApp; otherwise you get the words to send by hand.';
/** The same, for a message the system sends on its own: no words are handed over. */
const WHATSAPP_BILL_AUTO_TEXT =
  'The bill on WhatsApp, with that link. It goes by template when the WhatsApp bill template is on and the owner agreed to WhatsApp.';

/** A credit note needs the bill's GST invoice and a finished refund, so it is not promised as a message. */
const CREDIT_NOTE_NOTE =
  "Once the refund is finished, a GST credit note shows beside the bill in the app's payments list, if the bill had a GST invoice.";

/** What a payment becoming paid says in the app: the receipt notification to everyone on the app. */
function receiptLine(amountPaise: number): DealerReceipt {
  return {
    channel: 'app_push',
    words: `A "Payment received" notification to the owners and the manager: "We received ${formatPaise(amountPaise)} for the bill. Thank you."`,
  };
}

/**
 * The preview for one action: what is taken from the dealer and every message that
 * reaches them. Each branch is written from the code that really sends; the server's
 * parity test (`dealerReceives.parity.test.ts`) runs the real actions against fakes
 * and fails when a channel here is not what fired, or the other way round.
 *
 * Words for the dealer's app (`app_push`, `app_chat`, `app_screen`) never carry a
 * link or ask for money: Google Play forbids it (ADR 0022 §1).
 */
export function dealerReceives(action: MoneyAction): DealerReceivesPreview {
  const lines: DealerReceipt[] = [];
  const notes: string[] = [];
  let charged: string | null = null;

  switch (action.kind) {
    case 'send_bill': {
      const amount = formatPaise(action.amountPaise);
      const asAutopay = action.autopay && action.paymentsOn;
      if (asAutopay) {
        charged = `${amount} is taken the moment they approve the autopay, and ${amount} every month on the same day after that.`;
        // Razorpay texts an approval link only once.
        const textedBefore = action.approvalOut ?? action.resend;
        if (!textedBefore) {
          lines.push({
            channel: 'razorpay',
            words:
              "Razorpay texts and emails one autopay approval link, in Razorpay's own words.",
          });
        }
        lines.push({
          channel: 'whatsapp_by_hand',
          words: `WhatsApp words for you to send by hand. They say approving takes ${amount} now and every month. The usual bill template is not used, because it says "Pay here".`,
        });
        notes.push(UPI_NOTICE);
        notes.push('When they approve, the app sends "Autopay is on" and "Payment received".');
        if (textedBefore) {
          notes.push('Razorpay texts an approval only once, so it sends nothing again.');
        }
      } else if (action.paymentsOn) {
        charged = `Nothing is taken now. They pay ${amount} only if they use the link.`;
        lines.push({
          channel: 'razorpay',
          words: action.resend ? `${RAZORPAY_LINK_TEXT} This is a second send.` : RAZORPAY_LINK_TEXT,
        });
        lines.push({ channel: 'whatsapp', words: WHATSAPP_BILL_TEXT });
        notes.push(RAZORPAY_REMINDERS);
      } else {
        charged = `Nothing is taken. They pay ${amount} by UPI or bank, and you record it when it comes.`;
        lines.push({
          channel: 'whatsapp_by_hand',
          words:
            'WhatsApp words for you to send by hand, with no payment link. Add your UPI or bank details yourself.',
        });
      }
      if (action.firstEver) {
        lines.push({
          channel: 'app_chat',
          words: 'One quiet line in the app\'s chat: "Your bill has been sent." No notification.',
        });
      }
      if (!action.resend) {
        lines.push({
          channel: 'app_screen',
          words: `The bill shows in the app's payments list, read-only, with ${amount} and the due day.`,
        });
      }
      break;
    }

    case 'request_payment': {
      const amount = formatPaise(action.amountPaise);
      if (action.sendLink) {
        charged = `Nothing is taken now. They pay ${amount} only if they use the link.`;
        lines.push({ channel: 'razorpay', words: RAZORPAY_LINK_TEXT });
        notes.push(RAZORPAY_REMINDERS);
      } else {
        charged = 'Nothing is taken.';
        notes.push('No link is sent. Use "Send SMS and email" or "Copy link" on the payment later.');
      }
      lines.push({
        channel: 'app_screen',
        words: `A quiet row in the app's payments list, read-only, with ${amount} and the due day.`,
      });
      notes.push(
        action.remindersApply
          ? 'If it is still unpaid after the due day, WhatsApp reminders go on day 1, 3 and 7, when the WhatsApp bill template is on and the owner agreed to WhatsApp.'
          : 'No reminders are sent for this payment.',
      );
      break;
    }

    case 'send_sms':
      charged = 'Nothing is taken until they use the link.';
      lines.push({
        channel: 'razorpay',
        words: action.again ? `${RAZORPAY_LINK_TEXT} This is a second send.` : RAZORPAY_LINK_TEXT,
      });
      break;

    case 'copy_link':
      notes.push('Copying only gives you the link. Nothing reaches the dealer until you send it yourself.');
      break;

    case 'record_payment': {
      const amount = formatPaise(action.amountPaise);
      charged = `Nothing is taken from them. You are recording ${amount} that has already reached you.`;
      lines.push(receiptLine(action.amountPaise));
      if (action.firstBill) {
        lines.push({
          channel: 'app_chat',
          words:
            'A quiet thank-you line in the app\'s chat: "We have received your payment, thank you!" It sends no second notification.',
        });
        if (action.loginsMissing) {
          lines.push({
            channel: 'app_chat',
            words:
              "The login box in the app's chat, asking for the portal logins, with its own notification.",
          });
        }
      }
      notes.push("The GST invoice is made too, and shows beside the bill in the app once it is ready.");
      break;
    }

    case 'more_time': {
      if (action.tellDealer) {
        lines.push({
          channel: 'app_push',
          words: `A notification that the bill's due day is now ${dayWords(action.dueOn)}.`,
        });
      }
      notes.push(`The new due day, ${dayWords(action.dueOn)}, shows in the app's payments list.`);
      notes.push('Reminders and the overdue flag follow the new due day.');
      break;
    }

    case 'hold_chasing':
      notes.push(
        action.until
          ? `Reminders for this bill pause until ${dayWords(action.until)}. The dealer is not told.`
          : 'Reminders for this bill start again. The dealer is not told.',
      );
      notes.push('A link that was waiting to go out is sent when the hold ends.');
      break;

    case 'pay_link_instead': {
      const amount = formatPaise(action.amountPaise);
      if (action.paymentsOn) {
        charged = `Nothing is taken now. They pay ${amount} only if they use the link.`;
        lines.push({ channel: 'razorpay', words: RAZORPAY_LINK_TEXT });
        lines.push({ channel: 'whatsapp', words: WHATSAPP_BILL_TEXT });
        notes.push(RAZORPAY_REMINDERS);
      } else {
        charged = `Nothing is taken. They pay ${amount} by UPI or bank, and you record it when it comes.`;
        lines.push({
          channel: 'whatsapp_by_hand',
          words:
            'WhatsApp words for you to send by hand, with no payment link. Add your UPI or bank details yourself.',
        });
      }
      notes.push('The autopay approval they were sent stops working.');
      break;
    }

    case 'set_up_autopay': {
      const amount = formatPaise(action.amountPaise);
      if (action.firstDebitOn) {
        charged = `Nothing is taken now. ${amount} is taken on ${dayWords(action.firstDebitOn)}, and every month on the same day after that.`;
      } else if (action.firstMonth) {
        charged = `${amount} is taken the moment they approve. It pays the first bill, and ${amount} is taken every month on the same day after that.`;
      } else {
        charged = `${amount} is taken the moment they approve, and every month on the same day after that.`;
      }
      lines.push({
        channel: 'razorpay',
        words: "Razorpay texts and emails one autopay approval link, in Razorpay's own words.",
      });
      lines.push({
        channel: 'whatsapp_by_hand',
        words: `WhatsApp words for you to send by hand. They say ${amount} is taken every month, and how to stop it.`,
      });
      notes.push(UPI_NOTICE);
      notes.push('When they approve, the app sends "Autopay is on".');
      break;
    }

    case 'stop_autopay_admin':
      if (action.approved) {
        lines.push({
          channel: 'app_push',
          words:
            'An "Autopay stopped" notification: nothing more will be taken automatically, and Dealer Kavach works till the paid month ends.',
        });
        if (action.billWaiting && !action.billHeld) {
          lines.push({
            channel: 'razorpay',
            words: `${RAZORPAY_LINK_TEXT} It is for the bill autopay was going to take, due again in a few days.`,
          });
          lines.push({ channel: 'whatsapp', words: WHATSAPP_BILL_AUTO_TEXT });
          notes.push(RAZORPAY_REMINDERS);
        } else if (action.billWaiting && action.billHeld) {
          notes.push(
            'The bill autopay was going to take is on hold, so no payment link goes now. It goes on the first daily run after the hold ends.',
          );
        }
        notes.push('No more debits happen after this. The paid month still runs to its last day.');
      } else {
        // An approval nobody gave: it ends in silence, and the first bill goes as a one-time link.
        charged = 'Nothing is taken now. They pay the first bill only if they use the link.';
        lines.push({
          channel: 'razorpay',
          words: `${RAZORPAY_LINK_TEXT} It is the first bill, as a one-time payment, not autopay.`,
        });
        lines.push({ channel: 'whatsapp', words: WHATSAPP_BILL_AUTO_TEXT });
        notes.push(RAZORPAY_REMINDERS);
        notes.push(
          'Nobody approved this autopay, so the owner is told nothing about autopay: no "Autopay stopped" and no "Autopay has ended".',
        );
        notes.push('The approval they were sent stops working.');
      }
      break;

    case 'money_back': {
      const amount = formatPaise(action.amountPaise);
      if (action.autopayRunning) {
        lines.push({
          channel: 'app_push',
          words: 'An "Autopay stopped" notification: nothing more will be taken automatically.',
        });
      } else if (action.autopayRunning === undefined) {
        notes.push('If autopay is running, it is stopped first and the owner gets an "Autopay stopped" notification.');
      }
      lines.push({
        channel: 'app_push',
        words: action.byHand
          ? `A "Refund done" notification once you record the refund: "Your first month of ${amount} has been refunded."`
          : `A "Refund done" notification once Razorpay accepts the refund: "Your first month of ${amount} has been refunded."`,
      });
      notes.push(
        action.byHand
          ? `You give back ${amount} yourself. This only records it.`
          : `${amount} goes back to the account it came from, through Razorpay. The bank can take a few days.`,
      );
      notes.push(CREDIT_NOTE_NOTE);
      notes.push('Billing ends for this outlet: no more bills are raised, and an open next bill is cancelled quietly. The services keep running.');
      break;
    }

    case 'refund':
      notes.push(
        action.byHand
          ? `You give back ${formatPaise(action.amountPaise)} yourself. This only records it.`
          : `${formatPaise(action.amountPaise)} goes back to the account it came from, through Razorpay. The bank can take a few days.`,
      );
      notes.push(CREDIT_NOTE_NOTE);
      notes.push('If this gives back the whole first month, billing ends as in "Give the first month back".');
      break;

    case 'cancel_payment':
      notes.push('Its payment link is shut, so it stops working.');
      if (action.renewal) {
        notes.push("Cancelling does not skip a month: this month's bill is raised again at the next daily run.");
      }
      break;

    case 'pause_services':
      notes.push('Their reports stop. They still sign in and still see their bills.');
      break;

    case 'resume_services':
      notes.push('Exactly the services the pause stopped start again.');
      break;

    case 'start_services':
      lines.push({
        channel: 'app_push',
        words:
          'A notification from "MDG": "Your services have started. In the first days our team will keep a close eye on everything."',
      });
      lines.push({
        channel: 'app_chat',
        words: "The same words in the app's chat, with a card showing the setup is done.",
      });
      break;
  }

  return { charged, lines, notes };
}
