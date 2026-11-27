import { fmtMoney, fmtTime, indiaDay } from '@/lib/fmt';
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

/**
 * A first bill whose autopay approval was sent and has not been approved yet.
 * Approving pays it, and the server refuses every other way of paying it
 * meanwhile (409 WAITING_FOR_AUTOPAY), so no screen offers one. Only a `due`
 * bill can be waiting: once it is paid or cancelled the flag no longer matters.
 */
export function isWaitingForApproval(
  payment: Pick<DealerPayment, 'status' | 'waitingForAutopayApproval'>,
): boolean {
  return payment.status === 'due' && payment.waitingForAutopayApproval;
}

/**
 * Whether a bill gets a Pay button (in a browser; the app never draws one).
 * Open bills do, except one autopay is about to take and one waiting on its
 * autopay approval: paying either by hand would be paying twice.
 */
export function showsPayButton(
  payment: Pick<DealerPayment, 'status' | 'autopayOn' | 'waitingForAutopayApproval'>,
): boolean {
  const isOpen = payment.status === 'due' || payment.status === 'processing';
  return isOpen && !payment.autopayOn && !isWaitingForApproval(payment);
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

/**
 * A space that never breaks a line: "Rs 3,540" stays in one piece at 200% text. Used for amounts and
 * for the days inside the new sentences. The plain day formatters below keep ordinary spaces on
 * purpose: `shellNoPayPath.test.tsx` (pinned, unchanged) looks the old sentences up by their exact
 * text, and a testing-library text match folds a no-break space into a plain one.
 */
export function nb(text: string): string {
  return text.replace(/ /g, '\u00a0');
}

/**
 * Rupees from paise on the money screens (spec 3.3): `Rs 3,540` in English and Hinglish, `₹3,540` in
 * Hindi, never split across two lines. The one place the Bill and plan screens write an amount.
 */
export function money(lang: Lang, paise: number): string {
  return nb(fmtMoney(paise, lang));
}

/**
 * Month names written out, not asked of `Intl`: a cheap Android WebView can ship without the Hindi
 * locale data and print English months to a Hindi reader (the defect `lib/fmt.ts` was made to end).
 * Hinglish reads English's letters.
 */
const MONTHS: Record<'en' | 'hi', readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: [
    'जनवरी',
    'फ़रवरी',
    'मार्च',
    'अप्रैल',
    'मई',
    'जून',
    'जुलाई',
    'अगस्त',
    'सितंबर',
    'अक्तूबर',
    'नवंबर',
    'दिसंबर',
  ],
};

const PLAIN_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `{ y, m, d }` of a `YYYY-MM-DD`, or null when it is not a real calendar day. */
function readDay(ymd: string): { y: number; m: number; d: number } | null {
  const m = PLAIN_DAY.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return { y, m: mo, d };
}

function monthName(lang: Lang, m: number): string {
  return MONTHS[lang === 'hi' ? 'hi' : 'en'][m - 1] ?? '';
}

const MONTHS_FULL_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** A month written out in full for a bill's name ("November", "नवंबर"); Hinglish reads English's letters. */
export function monthFull(lang: Lang, m: number): string {
  return lang === 'hi' ? (MONTHS.hi[m - 1] ?? '') : (MONTHS_FULL_EN[m - 1] ?? '');
}

/** `{ y, m, d }` of a plain calendar day, or null. */
export function readCalendarDay(ymd: string): { y: number; m: number; d: number } | null {
  return readDay(ymd);
}

/** `2026-11-05` → "5 Nov 2026". A calendar date has no time zone, so none is applied. */
export function formatDueDate(lang: Lang, ymd: string): string {
  const day = readDay(ymd);
  if (!day) return ymd;
  return `${day.d} ${monthName(lang, day.m)} ${day.y}`;
}

/**
 * `2026-11-24` → "24 Nov", with no year: for a day within the coming month
 * (the next autopay, the last paid day), where a year is only noise on a
 * phone-width line. Same calendar-day reading as `formatDueDate`.
 */
export function formatDayMonth(lang: Lang, ymd: string): string {
  const day = readDay(ymd);
  if (!day) return ymd;
  return `${day.d} ${monthName(lang, day.m)}`;
}

/** Today's calendar day in India, `YYYY-MM-DD`, whatever time zone the phone is set to. */
export function todayIst(now: number = Date.now()): string {
  return indiaDay(new Date(now));
}

/**
 * The line that says when an open payment will be settled, or null when there
 * is nothing to say.
 *
 * A DUE bill that autopay will take (`autopayOn`) reads "Autopay will take this
 * on 28 Oct" instead of "Due by …": the dealer has nothing to do, and a due
 * date beside it would read as a thing they must do. Only a `due` payment
 * counts — the server sets `autopayOn` while the bill is due, and a payment
 * already `processing` is on its way whoever started it.
 *
 * If that day has already gone and the bill is still due, the debit did not
 * go through and autopay is trying again: a past date after "will take this on"
 * would be a promise already broken, so the line says it is trying again. (The
 * Pay button stays away either way: the server decides when a link is sent.)
 *
 * Everything else open keeps the usual due wording; a payment that is not open
 * has no line. `now` is for tests.
 */
export function dueNote(
  t: TFunction,
  lang: Lang,
  payment: Pick<DealerPayment, 'status' | 'dueDate' | 'autopayOn'>,
  now: number = Date.now(),
): string | null {
  if (payment.status === 'due' && payment.autopayOn) {
    if (payment.autopayOn < todayIst(now)) return t('payments.autopayRetrying');
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
  return formatDueDate(lang, indiaDay(d));
}

/** A moment on a receipt, "5 Nov 2026, 3:20 pm" — always Indian time, whatever the phone says. */
export function formatDateTimeIst(lang: Lang, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDay(lang, iso)}, ${fmtTime(d, lang)}`;
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
