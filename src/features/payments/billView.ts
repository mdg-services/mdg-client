import type { Status } from '@/components/kit/types';
import { daysUntil, fmtDay, indiaDay } from '@/lib/fmt';
import type { MessageKey, TFunction } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import type { Lang } from '@/store/lang';
import { GST_RATE_PERCENT, splitGstInclusive } from '@dk/shared';
import type {
  DealerAutopay,
  DealerPayment,
  GstDocumentSummary,
  OutletSetupView,
  PaymentStatus,
} from '@dk/shared/types';

import { hasReceipt, monthFull, money, nb, readCalendarDay, todayIst } from './paymentView';

/**
 * What the Bill and plan page decides (spec 4.8), kept apart from how it is drawn so every decision
 * can be tested without a page around it. Nothing here asks the server for anything: every number is
 * read from the three answers the page already holds (the bills, the owner's autopay, the setup
 * view), and every one of them may be missing.
 *
 * The server sends at most this many bills (`DEALER_LIST_LIMIT` in the backend's payments service).
 * When the list is that long it may be cut short, and the page says so.
 */
export const BILL_LIST_CAP = 100;

export function isListCapped(items: readonly unknown[]): boolean {
  return items.length >= BILL_LIST_CAP;
}

// ── dates ───────────────────────────────────────────────────────────────────

/** A day for a sentence, on the dealer's clock ("today", "yesterday", "Tue 24 Nov"), never split across lines. */
export function dayLabel(lang: Lang, isoDay: string, now: number = Date.now()): string {
  return nb(fmtDay(isoDay, lang, new Date(now)));
}

/** The India calendar day of a moment, `YYYY-MM-DD`; null when the moment cannot be read. */
function dayOfMoment(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : indiaDay(d);
}

/**
 * The financial year (April to March, India time) that `now` falls in: its first and last day, and
 * the two calendar years it spans.
 */
export function financialYearOf(now: number = Date.now()): {
  from: number;
  to: number;
  start: string;
  end: string;
} {
  const [y, m] = todayIst(now).split('-').map(Number) as [number, number];
  const from = m >= 4 ? y : y - 1;
  return { from, to: from + 1, start: `${from}-04-01`, end: `${from + 1}-03-31` };
}

// ── one bill's name ─────────────────────────────────────────────────────────

/**
 * The server writes a bill's name in English from its month ("Dealer Kavach, November", "Dealer's
 * Kavach — Oct 2026"). A Hindi reader must not get an English month, so the name is built again here
 * from that month.
 */
const SERVER_BILL_NAME = /^Dealer(?:'s|’s)?\s+Kavach\s*[—–,:-]\s*([A-Za-z]{3,9})\.?(?:\s+(\d{4}))?\s*$/i;
const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The month a bill is for, or null when it is not a monthly bill or the month cannot be read. The
 * month comes from the server's own name for the bill (the month the bill pays for, which is not
 * always its due month); a name that is not that shape is left as the server wrote it. A name with no year takes the year of the due day (or of the day the
 * bill was made), one year earlier when the month is later than the due month (December's bill due
 * in January).
 */
export function billMonthOf(
  p: Pick<DealerPayment, 'title' | 'purpose' | 'dueDate' | 'createdAt'>,
): { month: number; year: number } | null {
  const due = p.dueDate ? readCalendarDay(p.dueDate) : null;
  const made = readCalendarDay(dayOfMoment(p.createdAt) ?? '');
  const named = SERVER_BILL_NAME.exec(p.title.trim());
  if (named) {
    const month = MONTH_ABBR.indexOf((named[1] ?? '').slice(0, 3).toLowerCase()) + 1;
    if (month > 0) {
      if (named[2]) return { month, year: Number(named[2]) };
      const ref = due ?? made;
      if (!ref) return null;
      return { month, year: month > ref.m ? ref.y - 1 : ref.y };
    }
  }
  return null;
}

/** A bill's name in the reader's language: "Dealer Kavach, नवंबर 2026". Any other bill keeps its own name. */
export function billName(
  t: TFunction,
  lang: Lang,
  p: Pick<DealerPayment, 'title' | 'purpose' | 'dueDate' | 'createdAt'>,
): string {
  const m = billMonthOf(p);
  if (!m) return p.title;
  return t('bill.name.month', { month: monthFull(lang, m.month), year: m.year });
}

/** "November 2026" for the page of one bill: the month it pays for, or null when that is not known. */
export function billMonthLabel(
  lang: Lang,
  p: Pick<DealerPayment, 'title' | 'purpose' | 'dueDate' | 'createdAt'>,
): string | null {
  const m = billMonthOf(p);
  return m ? `${monthFull(lang, m.month)} ${m.year}` : null;
}

// ── one bill's status ───────────────────────────────────────────────────────

/** Whether a bill that reached us was paid by its due day (India time). Null when either day is unknown. */
export function paidOnTime(p: Pick<DealerPayment, 'paidAt' | 'dueDate'>): boolean | null {
  if (!p.paidAt || !p.dueDate) return null;
  const paid = dayOfMoment(p.paidAt);
  return paid ? paid <= p.dueDate : null;
}

/**
 * The shape and the word a bill wears in the table and on its own page. Never red: nothing a dealer
 * sees here is an error of theirs. A bill autopay is about to take is "waiting", not "needs a look".
 */
export function billStatus(
  p: Pick<DealerPayment, 'status' | 'paidAt' | 'dueDate' | 'autopayOn' | 'waitingForAutopayApproval'>,
): { status: Status; key: MessageKey } {
  switch (p.status as PaymentStatus) {
    case 'due':
      return p.autopayOn || p.waitingForAutopayApproval
        ? { status: 'waiting', key: 'payments.status.due' }
        : { status: 'attention', key: 'payments.status.due' };
    case 'processing':
      return { status: 'waiting', key: 'payments.status.processing' };
    case 'paid': {
      const onTime = paidOnTime(p);
      if (onTime === null) return { status: 'ok', key: 'payments.status.paid' };
      return onTime
        ? { status: 'ok', key: 'bill.status.paidOnTime' }
        : { status: 'info', key: 'bill.status.paidLate' };
    }
    case 'partially_refunded':
      return { status: 'info', key: 'payments.status.partiallyRefunded' };
    case 'refunded':
      return { status: 'info', key: 'payments.status.refunded' };
    case 'cancelled':
      return { status: 'info', key: 'payments.status.cancelled' };
  }
}

// ── what needs me ───────────────────────────────────────────────────────────

export interface NeedsMe {
  status: Status;
  word: string;
  text: string;
}

const isOpen = (p: Pick<DealerPayment, 'status'>) => p.status === 'due' || p.status === 'processing';

/** Open bills: the soonest due date first, a bill with no date last (oldest first among those). */
function byUrgency(a: DealerPayment, b: DealerPayment): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

/** The open bill that matters most. */
export function mostUrgent(items: readonly DealerPayment[]): DealerPayment | null {
  return items.filter(isOpen).sort(byUrgency)[0] ?? null;
}

/** The day a debit of this bill was last tried and failed, from the bill's own last failure. */
function lastTryDay(p: DealerPayment): string | null {
  return p.lastFailure?.at ? dayOfMoment(p.lastFailure.at) : null;
}

/** The newest day any bill's debit was tried and failed, or null. Only an open bill carries one. */
export function lastFailedDay(payments: readonly DealerPayment[]): string | null {
  return (
    payments
      .map(lastTryDay)
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null
  );
}

/**
 * The one sentence under "what needs me": a word, a shape and a sentence, in the order the owner
 * would ask. Sources, in this order: the open bills, then the owner's autopay, then the setup view's
 * own bill (a bill that was sent but whose row has not reached this list). Every number is the
 * server's; every day is counted again from its date in India time (`daysUntil`), never a frozen
 * "3 days left".
 *
 * In the phone shell this sentence is plain text: it names no button, no way to pay and no place.
 */
export function needsMe(args: {
  t: TFunction;
  lang: Lang;
  payments: readonly DealerPayment[];
  autopay: DealerAutopay | null;
  setup: Pick<OutletSetupView, 'payment'> | null | undefined;
  now?: number;
}): NeedsMe {
  const { t, lang, payments, autopay, setup } = args;
  const now = args.now ?? Date.now();
  const today = todayIst(now);
  const urgent = mostUrgent(payments);

  if (urgent) {
    const amount = money(lang, urgent.amountPaise);
    if (urgent.status === 'processing') {
      return {
        status: 'waiting',
        word: t('bill.need.processing.word'),
        text: t('payments.confirmingNote'),
      };
    }
    if (urgent.waitingForAutopayApproval) {
      return {
        status: 'waiting',
        word: t('bill.need.approval.word'),
        text: t('payments.waitingForApproval'),
      };
    }
    if (urgent.autopayOn) {
      if (urgent.autopayOn < today) return retry(t, lang, amount, lastTryDay(urgent) ?? urgent.autopayOn, now);
      return {
        status: 'waiting',
        word: t('bill.need.autopay.word'),
        text:
          urgent.autopayOn === today
            ? t('bill.need.autopay.today', { amount })
            : t('bill.need.autopay.text', { amount, date: dayLabel(lang, urgent.autopayOn, now) }),
      };
    }
    return dueSentence(t, lang, amount, urgent.dueDate, now);
  }

  if (autopay?.state === 'failing') {
    return retry(t, lang, money(lang, autopay.amountPaise), lastFailedDay(payments), now);
  }
  if (autopay?.state === 'setting_up') {
    return {
      status: 'waiting',
      word: t('bill.need.approval.word'),
      text: t('autopay.body.settingUp'),
    };
  }
  if (autopay?.state === 'on') {
    const amount = money(lang, autopay.amountPaise);
    return {
      status: 'ok',
      word: t('bill.need.autopayOn.word'),
      text: autopay.nextDebitOn
        ? autopay.nextDebitOn === today
          ? t('bill.need.autopay.today', { amount })
          : t('bill.need.autopay.text', { amount, date: dayLabel(lang, autopay.nextDebitOn, now) })
        : t('bill.need.autopay.every', { amount }),
    };
  }

  // A bill the setup view knows is sent and unpaid, though the list has no row for it yet.
  const sent = setup?.payment;
  if (sent && sent.state === 'sent' && sent.amountPaise) {
    return dueSentence(t, lang, money(lang, sent.amountPaise), sent.dueOn, now);
  }

  return { status: 'ok', word: t('bill.need.none.word'), text: t('bill.need.none.text') };
}

function retry(t: TFunction, lang: Lang, amount: string, day: string | null, now: number): NeedsMe {
  return {
    status: 'attention',
    word: t('bill.need.retry.word'),
    text: day
      ? t('bill.need.retry.text', { amount, date: dayLabel(lang, day, now) })
      : t('bill.need.retry.noDate', { amount }),
  };
}

function dueSentence(
  t: TFunction,
  lang: Lang,
  amount: string,
  dueDate: string | null,
  now: number,
): NeedsMe {
  const left = dueDate ? daysUntil(dueDate, new Date(now)) : null;
  if (!dueDate || left === null) {
    return {
      status: 'attention',
      word: t('bill.need.due.word'),
      text: t('bill.need.due.noDate', { amount }),
    };
  }
  if (left < 0) {
    return {
      status: 'attention',
      word: t('bill.need.overdue.word'),
      text: t('bill.need.overdue.text', { amount, date: dayLabel(lang, dueDate, now) }),
    };
  }
  if (left === 0) {
    return {
      status: 'attention',
      word: t('bill.need.due.word'),
      text: t('bill.need.due.today', { amount }),
    };
  }
  return {
    status: 'attention',
    word: t('bill.need.due.word'),
    text: tnIn(lang, 'bill.need.due', left, { amount, date: dayLabel(lang, dueDate, now) }),
  };
}

// ── the plan ────────────────────────────────────────────────────────────────

export interface Plan {
  totalPaise: number;
  /** The service's own price before GST. */
  basePaise: number;
  ratePercent: number;
  /** True when the figure was read from the newest subscription bill, not from autopay. */
  fromBill: boolean;
}

/**
 * What a month costs, read from the data and never written in: the owner's autopay amount while
 * autopay is running (it is the recurring price: a first month can be lower), else the newest
 * subscription bill. Null when neither exists. The split is the shared GST rule (`splitGstInclusive`).
 */
export function planOf(
  payments: readonly DealerPayment[],
  autopay: DealerAutopay | null,
): Plan | null {
  let total: number | null = null;
  let fromBill = false;
  if (autopay && autopay.state !== 'off' && autopay.amountPaise > 0) {
    total = autopay.amountPaise;
  } else {
    const newest = payments
      .filter((p) => p.purpose === 'subscription' && p.status !== 'cancelled' && p.amountPaise > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (newest) {
      total = newest.amountPaise;
      fromBill = true;
    }
  }
  if (total === null) return null;
  // The place of supply does not change the value before tax, only how the tax is named.
  const { taxablePaise } = splitGstInclusive(total, '06');
  return { totalPaise: total, basePaise: taxablePaise, ratePercent: GST_RATE_PERCENT, fromBill };
}

// ── what a bill is made of ──────────────────────────────────────────────────

export interface GstBreakdown {
  /** The amount before GST. */
  beforePaise: number;
  /** The GST in the bill. */
  gstPaise: number;
  ratePercent: number;
}

/**
 * The split of one bill into the amount and its GST. Read from the GST invoice when it is issued;
 * until then worked out with the shared rule (`splitGstInclusive`), the same one the plan uses, so
 * the two never disagree.
 */
export function gstBreakdownOf(p: Pick<DealerPayment, 'amountPaise' | 'invoice'>): GstBreakdown {
  if (p.invoice && p.invoice.taxablePaise > 0) {
    return {
      beforePaise: p.invoice.taxablePaise,
      gstPaise: p.invoice.cgstPaise + p.invoice.sgstPaise + p.invoice.igstPaise,
      ratePercent: GST_RATE_PERCENT,
    };
  }
  const { taxablePaise } = splitGstInclusive(p.amountPaise, '06');
  return {
    beforePaise: taxablePaise,
    gstPaise: Math.max(0, p.amountPaise - taxablePaise),
    ratePercent: GST_RATE_PERCENT,
  };
}

// ── this year ───────────────────────────────────────────────────────────────

export interface YearSummary {
  from: number;
  to: number;
  /** Money kept by MDG in bills paid this financial year: what was paid less what went back. */
  paidPaise: number;
  /** Bills paid this year that still count (not wholly refunded). */
  paidCount: number;
  /** Of the bills that have both a due day and a paid day, how many were paid by the due day. */
  onTime: number;
  withDueDay: number;
  /** GST on the invoices issued this year, less the credit notes. */
  gstPaise: number;
  invoiceCount: number;
}

const gstOf = (d: GstDocumentSummary) => d.cgstPaise + d.sgstPaise + d.igstPaise;

export function yearSummary(payments: readonly DealerPayment[], now: number = Date.now()): YearSummary {
  const fy = financialYearOf(now);
  const inYear = (day: string | null) => day !== null && day >= fy.start && day <= fy.end;
  const out: YearSummary = {
    from: fy.from,
    to: fy.to,
    paidPaise: 0,
    paidCount: 0,
    onTime: 0,
    withDueDay: 0,
    gstPaise: 0,
    invoiceCount: 0,
  };
  for (const p of payments) {
    if (hasReceipt(p.status) && p.paidAt && inYear(dayOfMoment(p.paidAt))) {
      out.paidPaise += Math.max(0, p.amountPaise - p.refundedPaise);
      if (p.status !== 'refunded') {
        out.paidCount += 1;
        const onTime = paidOnTime(p);
        if (onTime !== null) {
          out.withDueDay += 1;
          if (onTime) out.onTime += 1;
        }
      }
    }
    if (p.invoice && inYear(dayOfMoment(p.invoice.issuedAt))) {
      out.gstPaise += gstOf(p.invoice);
      out.invoiceCount += 1;
    }
    for (const note of p.creditNotes) {
      if (inYear(dayOfMoment(note.issuedAt))) out.gstPaise -= gstOf(note);
    }
  }
  return out;
}

// ── the table ───────────────────────────────────────────────────────────────

/** The day a bill is filed under: its due day, else the day it was paid, else the day it was made. */
function filingDay(p: DealerPayment): string {
  return p.dueDate ?? (p.paidAt ? dayOfMoment(p.paidAt) : null) ?? dayOfMoment(p.createdAt) ?? '';
}

export interface BillYear {
  /** `2026`. */
  year: string;
  items: DealerPayment[];
}

/**
 * The bills grouped by year, newest year first. Inside a year what is still open comes first (the
 * soonest day first), then what was paid, newest first. A bill with no readable day goes last under
 * "—" rather than being dropped.
 */
export function groupByYear(items: readonly DealerPayment[]): BillYear[] {
  const years = new Map<string, DealerPayment[]>();
  for (const p of items) {
    const year = filingDay(p).slice(0, 4) || '—';
    const list = years.get(year);
    if (list) list.push(p);
    else years.set(year, [p]);
  }
  return [...years.entries()]
    .sort(([a], [b]) => (a === '—' ? 1 : b === '—' ? -1 : b.localeCompare(a)))
    .map(([year, list]) => ({
      year,
      items: list.sort((a, b) => {
        const aOpen = isOpen(a);
        if (aOpen !== isOpen(b)) return aOpen ? -1 : 1;
        if (aOpen) return byUrgency(a, b);
        return filingDay(b).localeCompare(filingDay(a));
      }),
    }));
}

// ── papers ──────────────────────────────────────────────────────────────────

export interface Paper {
  doc: GstDocumentSummary;
  paymentId: string;
}

/** Every GST invoice and credit note of every bill, newest first. */
export function papersOf(payments: readonly DealerPayment[]): Paper[] {
  const papers: Paper[] = [];
  for (const p of payments) {
    if (p.invoice) papers.push({ doc: p.invoice, paymentId: p.id });
    for (const note of p.creditNotes) papers.push({ doc: note, paymentId: p.id });
  }
  return papers.sort((a, b) => b.doc.issuedAt.localeCompare(a.doc.issuedAt));
}
