import type { Lang } from '@/store/lang';

import { translate } from './i18n';

/**
 * Formats every screen shares (spec 3.3), in one place so no sentence breaks when a value wraps and
 * no two screens write the same date two ways.
 *
 * Everything is read in INDIA TIME, the dealer's clock, whatever the phone says. That is the defect
 * this file replaces: `toLocaleString(undefined, ...)` printed the PHONE's month names, so a
 * Hindi-app dealer on an English phone read English months. The weekday and month names below are
 * written out, not asked of `Intl`: a cheap Android WebView can ship without the Hindi locale data,
 * and a date must read the same on every phone.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

type DateLike = Date | string | number;

function asDate(value: DateLike): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The calendar fields of an instant on the India clock. */
function indiaParts(date: Date): { y: number; m: number; d: number; h: number; min: number; dow: number } {
  const x = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth() + 1,
    d: x.getUTCDate(),
    h: x.getUTCHours(),
    min: x.getUTCMinutes(),
    dow: x.getUTCDay(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The India business day of an instant, `YYYY-MM-DD`. */
export function indiaDay(date: Date = new Date()): string {
  const p = indiaParts(date);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

const PLAIN_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A day as `YYYY-MM-DD`. A plain day is kept as it is (it is already a calendar date, with no
 * time zone to shift); a full timestamp becomes the India day it falls on. Null when unreadable.
 */
function dayOf(value: DateLike): string | null {
  if (typeof value === 'string' && PLAIN_DAY.test(value)) return value;
  const d = asDate(value);
  return d ? indiaDay(d) : null;
}

/** A day's number: whole days since 1970-01-01, so two days subtract. */
function dayNumber(day: string): number {
  const m = PLAIN_DAY.exec(day)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** The weekday, 0 = Sunday, of a `YYYY-MM-DD`. */
function weekdayOf(day: string): number {
  return (dayNumber(day) + 4) % 7; // 1970-01-01 was a Thursday
}

/**
 * Whole days from today (India time) to `isoDay`: 3 means "3 days left", 0 is today, -2 is two days
 * ago. Counted from the DATE every time it is shown: a frozen "3 days left" in a stored snapshot
 * reads wrong two days later. Null when the date cannot be read: never compare it as a number
 * without looking.
 */
export function daysUntil(isoDay: string | Date, now: Date = new Date()): number | null {
  const target = dayOf(isoDay);
  if (!target) return null;
  return dayNumber(target) - dayNumber(indiaDay(now));
}

// ── numbers ────────────────────────────────────────────────────────────────

/** Digits grouped the Indian way: 118000 is 1,18,000. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${digits.slice(-3)}`;
}

const DASH = '–';

/**
 * A whole number with Indian grouping, the same in all three languages: `1,18,000`, `24,330`.
 * Show it through `<Num>` so it never splits across two lines. Not a number: an en dash.
 * `_lang` is taken so every format has the same call shape; digits never change with it.
 */
export function fmtInt(n: number, _lang?: Lang): string {
  if (!Number.isFinite(n)) return DASH;
  const r = Math.round(n);
  const abs = Math.abs(r);
  return `${r < 0 ? '-' : ''}${groupIndian(String(abs))}`;
}

/** Litres, whole: `24,330 L` (English, Hinglish), `24,330 लीटर` (Hindi). */
export function fmtLitres(n: number, lang: Lang): string {
  if (!Number.isFinite(n)) return DASH;
  return `${fmtInt(n, lang)} ${translate(lang, 'kit.unit.litres')}`;
}

/** Cover days: one decimal when it is not whole ("4.2"), none for a count ("5"). */
export function fmtDays(x: number): string {
  if (!Number.isFinite(x)) return DASH;
  const one = Math.round(x * 10) / 10;
  return Number.isInteger(one) ? String(one) : one.toFixed(1);
}

/**
 * Money from paise: `Rs 1,18,000` (English, Hinglish), `₹1,18,000` (Hindi). Whole rupees print
 * with no decimals; a bill with paise prints both digits. Only the money screens use it: MDG's
 * bill is shown as days everywhere else.
 */
export function fmtMoney(paise: number, lang: Lang): string {
  if (!Number.isFinite(paise)) return DASH;
  const total = Math.round(paise);
  const abs = Math.abs(total);
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = groupIndian(String(rupees)) + (rest ? `.${pad2(rest)}` : '');
  const sign = total < 0 ? '-' : '';
  return lang === 'hi' ? `${sign}₹${body}` : `${sign}Rs ${body}`;
}

// ── days and times ─────────────────────────────────────────────────────────

const WEEKDAY_SHORT: Record<Lang, readonly string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
  hl: ['Raviwar', 'Somwar', 'Mangalwar', 'Budhwar', 'Guruwar', 'Shukrawar', 'Shaniwar'],
};
const WEEKDAY_LONG: Record<Lang, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hi: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
  hl: ['Raviwar', 'Somwar', 'Mangalwar', 'Budhwar', 'Guruwar', 'Shukrawar', 'Shaniwar'],
};
const WEEKDAY_LETTER: Record<Lang, readonly string[]> = {
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  hi: ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'],
  hl: ['R', 'So', 'Ma', 'Bu', 'Gu', 'Sh', 'Sa'],
};
const MONTH: Record<Lang, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्तूबर', 'नवंबर', 'दिसंबर'],
  hl: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** The weekday of a day in full ("Monday", "सोमवार", "Somwar"), for "last Monday". Empty if unreadable. */
export function fmtWeekday(isoDay: DateLike, lang: Lang): string {
  const day = dayOf(isoDay);
  return day ? WEEKDAY_LONG[lang][weekdayOf(day)]! : '';
}

/** One short mark for a day strip: "M", "सो", "So". Empty if unreadable. */
export function weekdayLetter(isoDay: DateLike, lang: Lang): string {
  const day = dayOf(isoDay);
  return day ? WEEKDAY_LETTER[lang][weekdayOf(day)]! : '';
}

/**
 * A day for a sentence: "today / आज / Aaj", "yesterday / कल / Kal", else weekday, day and month
 * ("Tue 24 Nov", "मंगल 24 नवंबर", "Mangalwar 24 Nov"). The dealer's clock, never the phone's.
 */
export function fmtDay(isoDay: DateLike, lang: Lang, now: Date = new Date()): string {
  const day = dayOf(isoDay);
  if (!day) return DASH;
  const ahead = dayNumber(day) - dayNumber(indiaDay(now));
  if (ahead === 0) return translate(lang, 'kit.day.today');
  if (ahead === -1) return translate(lang, 'kit.day.yesterday');
  const m = PLAIN_DAY.exec(day)!;
  return `${WEEKDAY_SHORT[lang][weekdayOf(day)]} ${Number(m[3])} ${MONTH[lang][Number(m[2]) - 1]}`;
}

/**
 * The part of the day, for the two spoken languages: Hindi says "सुबह 9:40", not "9:40 am".
 * From 04:00 it is morning (सुबह), the way a pump owner speaks: "रात 4:35" for a report that came
 * at 4:35 in the morning read as the middle of the night. Midnight to 03:59 is रात.
 */
function dayPart(hour: number): 0 | 1 | 2 | 3 {
  if (hour >= 4 && hour < 12) return 0;
  if (hour >= 12 && hour < 16) return 1;
  if (hour >= 16 && hour < 20) return 2;
  return 3;
}
const PART: Record<'hi' | 'hl', readonly string[]> = {
  hi: ['सुबह', 'दोपहर', 'शाम', 'रात'],
  hl: ['subah', 'dopahar', 'shaam', 'raat'],
};
/**
 * "The night that just ended": the word for a time between midnight and 04:00 of TODAY, said after
 * 04:00. "आज रात 12:11" at 5:57 in the morning means tonight, a time that has not come, to a reader;
 * "बीती रात 12:11" says it has gone.
 */
const LAST_NIGHT: Record<'hi' | 'hl', string> = { hi: 'बीती रात', hl: 'beeti raat' };

/**
 * A time of day on the India clock: "9:40 am", "सुबह 9:40", "subah 9:40". `now` (default: the real
 * clock) matters in Hindi and Hinglish for one case only: a time between 00:00 and 03:59 on today's
 * date, read after 04:00, is "बीती रात 12:11" ("last night"), not "रात 12:11", so it is never taken
 * for tonight. A caller that puts "आज" in front gets "आज बीती रात 12:11".
 */
export function fmtTime(date: DateLike, lang: Lang, now: Date = new Date()): string {
  const d = asDate(date);
  if (!d) return DASH;
  const { h, min } = indiaParts(d);
  const clock = `${h % 12 || 12}:${pad2(min)}`;
  if (lang === 'en') return `${clock} ${h < 12 ? 'am' : 'pm'}`;
  const part = dayPart(h);
  if (part === 3 && h < 4 && indiaDay(d) === indiaDay(now) && indiaParts(now).h >= 4) {
    return `${LAST_NIGHT[lang]} ${clock}`;
  }
  return `${PART[lang][part]} ${clock}`;
}

/**
 * A date with the month in full for Hindi ("26 नवंबर"), short in English and Hinglish ("26 Nov"),
 * with no weekday and no "today". For the places that name a date, never an abbreviation from the
 * phone's locale data ("नव॰"). Empty dash if unreadable.
 */
export function fmtDate(isoDay: DateLike, lang: Lang): string {
  const day = dayOf(isoDay);
  if (!day) return DASH;
  const m = PLAIN_DAY.exec(day)!;
  return `${Number(m[3])} ${MONTH[lang][Number(m[2]) - 1]}`;
}
