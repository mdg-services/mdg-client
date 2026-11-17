import type { OutletSetupView } from '@dk/shared/types';

import { istToday } from './cardView';

/**
 * The decisions behind the thin bill banner at the top of the app (owner, 16 Nov
 * 2026), kept apart from the drawing so they can be tested without a screen.
 *
 * The first bill is due a week after it goes and nothing waits on it. The banner
 * says so every day: the amount and the days left. On the due day itself — the
 * last twenty-four hours — it turns into a countdown to midnight in India and can
 * no longer be closed. After that it says the day has passed.
 *
 * READ-ONLY ABOUT MONEY. It shows what is due and when; it never links to a way to
 * pay (ADR 0022 §1). Its one button sends the bill again OUTSIDE the app.
 */

export type BillBanner =
  /** More than a day to go: "any time in 5 days". `days` is 1 the day before the due day. */
  | { kind: 'days'; amountPaise: number; dueOn: string; days: number; key: string }
  /** The due day itself: a countdown to midnight in India. Cannot be closed. */
  | { kind: 'countdown'; amountPaise: number; dueOn: string; msLeft: number; key: string }
  /** The due day has gone by. */
  | { kind: 'overdue'; amountPaise: number; dueOn: string; key: string };

const IST_OFFSET_MS = 330 * 60_000;

/** Midnight in India at the END of a `YYYY-MM-DD` day, as an instant. */
export function endOfIstDay(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d + 1) - IST_OFFSET_MS;
}

/** Whole days from one `YYYY-MM-DD` to another (both India's calendar). */
export function daysBetween(from: string, to: string): number {
  const at = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * The banner for this view now, or null when there is none: only for an OWNER,
 * only for a bill that is sent and unpaid with a due day, and not when the server
 * says there is nothing for the owner to do about it (`resend: null` — an autopay
 * already approved takes it by itself). An older server that sends no `resend` at
 * all still gets the banner, without the button.
 */
export function billBanner(view: OutletSetupView | undefined, now: Date = new Date()): BillBanner | null {
  if (!view || !view.canEdit) return null;
  const p = view.payment;
  if (p.state !== 'sent' || p.amountPaise === null || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn ?? '')) return null;
  if (p.resend === null) return null;
  const dueOn = p.dueOn as string;
  const key = p.paymentId ?? dueOn;
  const end = endOfIstDay(dueOn);
  if (now.getTime() >= end) return { kind: 'overdue', amountPaise: p.amountPaise, dueOn, key };
  const today = istToday(now);
  if (today === dueOn) {
    return { kind: 'countdown', amountPaise: p.amountPaise, dueOn, msLeft: end - now.getTime(), key };
  }
  return { kind: 'days', amountPaise: p.amountPaise, dueOn, days: daysBetween(today, dueOn), key };
}

/** "07:04:09" — hours, minutes, seconds left, never below nought. */
export function formatCountdown(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** The countdown cannot be closed: it is the last day. */
export const canClose = (b: BillBanner): boolean => b.kind !== 'countdown';

/** Where "closed for today" is remembered: per bill, so a new bill shows again. */
export const hiddenKey = (b: BillBanner): string => `dk.billBanner.hidden.${b.key}`;

/** Was it closed today (India's day)? A closed countdown does not exist, so it never is. */
export function hiddenToday(b: BillBanner, stored: string | null, now: Date = new Date()): boolean {
  return canClose(b) && stored === istToday(now);
}

/**
 * Whether the "Send again" button shows: the server offers it, and inside the phone
 * apps only while its switch allows (Google Play's payments rule; ADR 0022 §1).
 */
export function showSendAgain(view: OutletSetupView, inApp: boolean): boolean {
  const r = view.payment.resend;
  if (!r) return false;
  return !inApp || r.inApp;
}
