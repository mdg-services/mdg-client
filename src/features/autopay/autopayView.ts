import { formatDayMonth, type StatusTone } from '@/features/payments/paymentView';
import { ApiError } from '@/lib/api';
import type { MessageKey, TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { formatPaise } from '@dk/shared';
import type { StopAutopayDealerInput } from '@dk/shared/schemas';
import type { AutopayStopReason, AutopayViewState, DealerAutopay } from '@dk/shared/types';
import { AUTOPAY_STOP_REASONS } from '@dk/shared/types';

/**
 * What the autopay screens decide, kept apart from how they draw it, so the
 * decisions can be tested without a page around them (the same split as
 * `payments/paymentView.ts`).
 *
 * Inside the Android app autopay is only SHOWN and STOPPED. Nothing in this file
 * can produce a "turn on" button, a link, or a sentence about how to turn it on:
 * Google Play forbids a payment link or button in the app (payments/policy.ts),
 * and what the dealer may do here is end it.
 */

/** The state in a word, on the chip. */
export const AUTOPAY_STATE_KEY: Record<AutopayViewState, MessageKey> = {
  setting_up: 'autopay.chip.settingUp',
  on: 'autopay.chip.on',
  failing: 'autopay.chip.failing',
  off: 'autopay.chip.off',
};

/**
 * The colour each state wears, from the same set the payment chips use. Amber
 * for "waiting on someone" and "a debit did not go through", green for on,
 * grey for off. Never red: a debit that bounced is not an error of the dealer's
 * that the screen should shout about.
 */
export const AUTOPAY_TONE: Record<AutopayViewState, StatusTone> = {
  setting_up: 'warning',
  on: 'success',
  failing: 'warning',
  off: 'neutral',
};

/**
 * The line under "Autopay" on the Help row and on the Payments card. The amount
 * and the days are the server's, written with the app's own money and date
 * helpers; a day the server does not know yet (`null`) is left out rather than
 * guessed.
 */
export function autopaySubtitle(t: TFunction, lang: Lang, autopay: DealerAutopay): string {
  const amount = formatPaise(autopay.amountPaise);
  switch (autopay.state) {
    case 'setting_up':
      return t('autopay.sub.settingUp');
    case 'on':
      return autopay.nextDebitOn
        ? t('autopay.sub.on', { amount, date: formatDayMonth(lang, autopay.nextDebitOn) })
        : t('autopay.sub.onNoDate', { amount });
    case 'failing':
      return t('autopay.sub.failing');
    case 'off':
      return autopay.paidThrough
        ? t('autopay.sub.off', { date: formatDayMonth(lang, autopay.paidThrough) })
        : t('autopay.sub.offNoDate');
  }
}

/**
 * The sentence in the card on the Autopay screen. Null when off: the screen
 * then shows the "Autopay is off" block instead of a card.
 */
export function autopayBody(t: TFunction, lang: Lang, autopay: DealerAutopay): string | null {
  switch (autopay.state) {
    case 'setting_up':
      return t('autopay.body.settingUp');
    case 'on':
      return autopay.nextDebitOn
        ? t('autopay.body.on', { date: formatDayMonth(lang, autopay.nextDebitOn) })
        : t('autopay.body.onNoDate');
    case 'failing':
      return t('autopay.body.failing', { amount: formatPaise(autopay.amountPaise) });
    case 'off':
      return null;
  }
}

/** The one thing a dealer can do here: end it. Hidden once it is off. */
export function canStop(state: AutopayViewState): boolean {
  return state !== 'off';
}

/** A setup nobody has approved yet is cancelled; one that is running is stopped. */
export function isSetup(state: AutopayViewState): boolean {
  return state === 'setting_up';
}

/** The words on the button under the card, and on the dialog's danger button. */
export function stopLabelKey(state: AutopayViewState): MessageKey {
  return isSetup(state) ? 'autopay.cancelSetup' : 'autopay.stop';
}

export function dialogTitleKey(state: AutopayViewState): MessageKey {
  return isSetup(state) ? 'autopay.dialog.cancelSetupTitle' : 'autopay.dialog.title';
}

/** The way out of the dialog is always a named "keep", never a bare "Cancel". */
export function keepLabelKey(state: AutopayViewState): MessageKey {
  return isSetup(state) ? 'autopay.dialog.keepSetup' : 'autopay.dialog.keep';
}

/** Only a failing autopay gets an "Ask in chat" row on the screen: that is where a dealer is stuck. */
export function showAskInChat(state: AutopayViewState): boolean {
  return state === 'failing';
}

/** "₹3,540 is being taken right now…", the dialog's first line — only while a debit is in flight. */
export function inProgressLine(t: TFunction, autopay: DealerAutopay): string | null {
  return autopay.debitInProgress
    ? t('autopay.dialog.inProgress', { amount: formatPaise(autopay.amountPaise) })
    : null;
}

/**
 * Whether the refund tick is in force: ticked, and still allowed (inside the first
 * month). The one test the screen's words and the request body both go by.
 */
export function refundAsked(
  refundTicked: boolean,
  autopay: Pick<DealerAutopay, 'firstMonthRefundable'>,
): boolean {
  return refundTicked && canAskRefund(autopay);
}

/**
 * What stopping does and does not do: the service runs on to the paid day. With the
 * refund tick on it does not promise a bill each month: the owner is asking for the
 * money back, and says so right under the tick.
 */
export function dialogBody(
  t: TFunction,
  lang: Lang,
  autopay: DealerAutopay,
  refundTicked = false,
): string {
  const asking = refundAsked(refundTicked, autopay);
  if (autopay.paidThrough) {
    return t(asking ? 'autopay.dialog.bodyRefund' : 'autopay.dialog.body', {
      date: formatDayMonth(lang, autopay.paidThrough),
    });
  }
  return t(asking ? 'autopay.dialog.bodyRefundNoDate' : 'autopay.dialog.bodyNoDate');
}

/**
 * The dialog's one help line. Inside the first month it also says the money comes
 * back, until the tick is on: then the tick's own line says it, and this one is the
 * plain one, so the same promise is not made twice.
 */
export function helpLineKey(
  autopay: Pick<DealerAutopay, 'firstMonthRefundable'>,
  refundTicked = false,
): MessageKey {
  return autopay.firstMonthRefundable && !refundTicked
    ? 'autopay.dialog.helpRefund'
    : 'autopay.dialog.help';
}

/** The off screen's words: the service runs on to the paid day, nothing is taken. */
export function offBody(t: TFunction, lang: Lang, autopay: DealerAutopay): string {
  return autopay.paidThrough
    ? t('autopay.off.body', { date: formatDayMonth(lang, autopay.paidThrough) })
    : t('autopay.off.bodyNoDate');
}

/** The five reasons, in the order they are shown, each with the dealer's words. */
export const STOP_REASONS: readonly AutopayStopReason[] = AUTOPAY_STOP_REASONS;

export const STOP_REASON_KEY: Record<AutopayStopReason, MessageKey> = {
  pay_myself: 'autopay.reason.pay_myself',
  too_expensive: 'autopay.reason.too_expensive',
  not_useful: 'autopay.reason.not_useful',
  closing: 'autopay.reason.closing',
  other: 'autopay.reason.other',
};

/** One reason at a time, none at first; tapping the chosen one again clears it. */
export function toggleReason(
  current: AutopayStopReason | null,
  tapped: AutopayStopReason,
): AutopayStopReason | null {
  return current === tapped ? null : tapped;
}

/** The tick "Also give me my first month back" is drawn only inside the first month. */
export function canAskRefund(autopay: Pick<DealerAutopay, 'firstMonthRefundable'>): boolean {
  return autopay.firstMonthRefundable;
}

/**
 * The request body: the reason if one was picked, the refund request if it was
 * ticked, an empty body if neither. A reason never blocks the stop. The refund
 * is sent only while the first month is refundable — the server answers 400
 * otherwise — so a tick left over from a stale screen never goes out.
 */
export function stopBody(
  reason: AutopayStopReason | null,
  refundFirstMonth = false,
  autopay: Pick<DealerAutopay, 'firstMonthRefundable'> = { firstMonthRefundable: true },
): StopAutopayDealerInput {
  const body: StopAutopayDealerInput = reason ? { reason } : {};
  if (refundAsked(refundFirstMonth, autopay)) body.refundFirstMonth = true;
  return body;
}

/** "Services paid till 24 Nov", while autopay runs. Null when the last paid day is not known yet. */
export function paidTillLine(t: TFunction, lang: Lang, autopay: DealerAutopay): string | null {
  return autopay.paidThrough
    ? t('autopay.paidTill', { date: formatDayMonth(lang, autopay.paidThrough) })
    : null;
}

/**
 * The toast when there was no autopay left to stop (the server answered 409
 * `NO_AUTOPAY`). With the refund tick on, a bare "already off" would hide that the
 * ask for the first month back went nowhere, so it says how to make it.
 */
export function noAutopayToastKey(
  refundTicked: boolean,
  autopay: Pick<DealerAutopay, 'firstMonthRefundable'>,
): MessageKey {
  return refundAsked(refundTicked, autopay)
    ? 'autopay.toast.alreadyOffRefund'
    : 'autopay.toast.alreadyOff';
}

/** After a stop that asked for the first month back: what happens next. */
export function refundAskedLine(t: TFunction, autopay: DealerAutopay): string | null {
  return autopay.refundAskedAt ? t('autopay.off.refundAsked') : null;
}

/**
 * How long before the request left the phone a stop may be dated and still
 * count as this stop. Phone clocks drift by seconds, not minutes; two minutes
 * keeps a drifting clock from calling a fresh stop "already off".
 */
export const ALREADY_OFF_MARGIN_MS = 2 * 60_000;

/**
 * Whether the server found autopay already off when our stop arrived: stopped
 * from the UPI app, or from the owner's other phone. The answer is the same 200
 * either way, so the difference is read from WHEN it was stopped — before this
 * request was sent, or by it. A stop with no time on it is taken as this one.
 */
export function wasAlreadyOff(autopay: DealerAutopay | null, sentAtMs: number): boolean {
  if (!autopay?.stoppedAt) return false;
  const stoppedAtMs = Date.parse(autopay.stoppedAt);
  if (Number.isNaN(stoppedAtMs)) return false;
  return stoppedAtMs < sentAtMs - ALREADY_OFF_MARGIN_MS;
}

/**
 * What the stop dialog says when the stop did not come back as done, by the
 * server's own code.
 *
 * "Nothing has changed" is said whenever the server itself answered with a
 * refusal, because it touched nothing: payments switched off
 * (`PAYMENTS_NOT_CONFIGURED`), Razorpay did not answer (`RAZORPAY_UNREACHABLE`,
 * `AUTOPAY_NOT_STOPPED`), Razorpay refused (`PAYMENT_PROVIDER_ERROR`), or any
 * other 4xx. Only a reply we never got — a dropped connection, a timeout, or a
 * server error with no code we know — says "we could not confirm": the stop may
 * have landed and only the reply been lost, so the screen reads the truth again.
 */
export function stopFailureKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    if (err.code === 'PAYMENTS_NOT_CONFIGURED') return 'autopay.dialog.notConfigured';
    if (err.code === 'RAZORPAY_UNREACHABLE' || err.code === 'AUTOPAY_NOT_STOPPED') {
      return 'autopay.dialog.failed';
    }
    if (err.code === 'PAYMENT_PROVIDER_ERROR') return 'autopay.dialog.refused';
    if (err.status >= 400 && err.status < 500) return 'autopay.dialog.notStopped';
  }
  return 'autopay.dialog.unconfirmed';
}
