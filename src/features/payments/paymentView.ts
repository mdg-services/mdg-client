import type { MessageKey, TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { SETTLED_STATUSES } from '@dk/shared/types';
import type { DealerPayment, PaymentStatus } from '@dk/shared/types';

/**
 * What the payment screens decide, kept apart from how they draw it, so the
 * decisions can be tested without a page around them.
 */

/** The dealer's word for each status. The admin's own list is in the shared types. */
export const STATUS_KEY: Record<PaymentStatus, MessageKey> = {
  due: 'payments.status.due',
  processing: 'payments.status.processing',
  paid: 'payments.status.paid',
  cancelled: 'payments.status.cancelled',
  partially_refunded: 'payments.status.partiallyRefunded',
  refunded: 'payments.status.refunded',
};

/**
 * Which colour a status wears. Amber for "your move or ours", green for done,
 * blue for money that went back, grey for withdrawn. Never red: nothing a dealer
 * sees here is an error of theirs.
 */
export type StatusTone = 'warning' | 'success' | 'info' | 'neutral';

export const STATUS_TONE: Record<PaymentStatus, StatusTone> = {
  due: 'warning',
  processing: 'warning',
  paid: 'success',
  cancelled: 'neutral',
  partially_refunded: 'info',
  refunded: 'info',
};

/** Money reached us, whatever happened to it afterwards — there is a receipt to show. */
export function hasReceipt(status: PaymentStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

/**
 * Only a `due` payment can be paid from the screen. `processing` is also open
 * on the server, but it means a payment is already on its way (a UPI request
 * not yet answered), and a second one would be charged twice.
 */
export function canStartPayment(payment: Pick<DealerPayment, 'status'>): boolean {
  return payment.status === 'due';
}

/** The sooner a due date, the higher it sits; payments with no date go last. */
function byDueDate(a: DealerPayment, b: DealerPayment): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

/** The moment a payment last changed in a way the dealer cares about. */
function settledOrCreated(p: DealerPayment): string {
  return p.paidAt ?? p.createdAt;
}

/**
 * Two lists: what is still open (due, or on its way), soonest date first, and
 * everything else — paid, refunded, cancelled — newest first.
 */
export function splitPayments(items: readonly DealerPayment[]): {
  due: DealerPayment[];
  history: DealerPayment[];
} {
  const due = items.filter((p) => p.status === 'due' || p.status === 'processing');
  const history = items.filter((p) => p.status !== 'due' && p.status !== 'processing');
  due.sort(byDueDate);
  history.sort((a, b) => settledOrCreated(b).localeCompare(settledOrCreated(a)));
  return { due, history };
}

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

/** `2026-11-05` → "5 Nov 2026". A calendar date has no time zone, so none is applied. */
export function formatDueDate(lang: Lang, ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * `2026-11-24` → "24 Nov", with no year: for a day within the coming month
 * (the next autopay, the last paid day), where a year is only noise on a
 * phone-width line. Same calendar-day reading as `formatDueDate`.
 */
export function formatDayMonth(lang: Lang, ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return ymd;
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * The line that says when an open payment will be settled, or null when there
 * is nothing to say.
 *
 * A DUE bill that autopay will take (`autopayOn`) reads "Autopay will take this
 * on 28 Oct" instead of "Due by …": the dealer has nothing to do, and a due
 * date beside it would read as a thing they must do. Only a `due` payment
 * counts — the server sets `autopayOn` while the bill is due, and a payment
 * already `processing` is on its way whoever started it. Everything else open
 * keeps the usual due wording; a payment that is not open has no line.
 */
export function dueNote(
  t: TFunction,
  lang: Lang,
  payment: Pick<DealerPayment, 'status' | 'dueDate' | 'autopayOn'>,
): string | null {
  if (payment.status === 'due' && payment.autopayOn) {
    return t('payments.autopayWillTake', { date: formatDayMonth(lang, payment.autopayOn) });
  }
  const isOpen = payment.status === 'due' || payment.status === 'processing';
  if (isOpen && payment.dueDate) {
    return t('payments.dueBy', { date: formatDueDate(lang, payment.dueDate) });
  }
  return null;
}

/** A moment as an Indian date, "5 Nov 2026" — the day it happened in India. */
export function formatDay(lang: Lang, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

/** A moment on a receipt, "5 Nov 2026, 3:20 pm" — always Indian time, whatever the phone says. */
export function formatDateTimeIst(lang: Lang, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

const METHOD_KEY: Record<string, MessageKey> = {
  upi: 'payments.method.upi',
  card: 'payments.method.card',
  netbanking: 'payments.method.netbanking',
  wallet: 'payments.method.wallet',
  emi: 'payments.method.emi',
  paylater: 'payments.method.paylater',
  bank_transfer: 'payments.method.bankTransfer',
  // Money MDG recorded by hand (a payment made outside Razorpay).
  cash: 'payments.method.cash',
  cheque: 'payments.method.cheque',
};

/** How it was paid, in the dealer's words. A method we have no word for is shown as Razorpay names it. */
export function methodLabel(t: (key: MessageKey) => string, method: string | null): string | null {
  if (!method) return null;
  const key = METHOD_KEY[method.toLowerCase()];
  return key ? t(key) : method;
}
