import { translate, type MessageKey, type TVars } from '@/lib/i18n';
import { tnIn, type PluralBase } from '@/lib/messages/_plural';
import type { Lang } from '@/store/lang';

import { sayWords, type Words } from '../types';

/**
 * Plain-word formatting shared by the tanker and money kinds: tanker density, tanker
 * receipt, fuel order, Credit & DOD and ledger watch (ADR 0056).
 *
 * Everything here is pure and works on the strings the snapshot holds. Days are
 * `YYYY-MM-DD` and instants are ISO; both are read as IST wall clock (UTC + 5:30), never
 * in the phone's own zone, so a report says the same time on every phone. Dates and times
 * are written in words ("24 Nov", "24 नवंबर", "7:05 pm", "शाम 7:05"), never as 24-11-2026.
 */

export const say = sayWords;

/**
 * A sentence of the redesign, from the area file `lib/messages/reportViews3.ts` (keys `rv3.`), in the
 * view's own `lang` (the overlay is handed the language, so a test can render any of the three).
 */
export function rv(lang: Lang, key: MessageKey, vars?: TVars): string {
  return translate(lang, key, vars);
}

/** The counted sentence of the redesign: `<base>.one` for 1, `<base>.many` for the rest. */
export function rvn(lang: Lang, base: PluralBase, n: number, vars?: TVars): string {
  return tnIn(lang, base, n, vars);
}

/** A sentence with `{name}` holes filled from `vars` (a hole with no value becomes empty). */
export function fill(w: Words, lang: Lang, vars: Record<string, string>): string {
  return sayWords(w, lang).replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_HI = [
  'जनवरी',
  'फ़रवरी',
  'मार्च',
  'अप्रैल',
  'मई',
  'जून',
  'जुलाई',
  'अगस्त',
  'सितंबर',
  'अक्टूबर',
  'नवंबर',
  'दिसंबर',
];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];

export interface WallClock {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
}

function clockOf(year: number, month: number, day: number, hour: number, minute: number): WallClock | null {
  const t = Date.UTC(year, month - 1, day, hour, minute);
  const d = new Date(t);
  if (Number.isNaN(t) || d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) return null;
  return { year, month, day, hour, minute, weekday: d.getUTCDay() };
}

/**
 * A `YYYY-MM-DD` day, a `YYYY-MM-DD HH:mm[:ss]` portal time (already IST), or an ISO
 * instant (converted to IST). Null when it will not read: the caller then says nothing
 * rather than a wrong date.
 */
export function readWallClock(raw: string | null | undefined): WallClock | null {
  if (!raw) return null;
  const plain = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?$/.exec(raw);
  if (plain) return clockOf(Number(plain[1]), Number(plain[2]), Number(plain[3]), Number(plain[4] ?? 0), Number(plain[5] ?? 0));
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 330 * 60_000);
  return clockOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}

/** True when the string carries a clock time, not only a day. */
export function hasClockTime(raw: string | null | undefined): boolean {
  return !!raw && (/\d{2}:\d{2}/.test(raw) || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw));
}

/** `HH:mm` (a ClockTime) as hours and minutes, or null. */
function readHm(raw: string | null | undefined): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw ?? '');
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export interface DayOptions {
  /** "Tue 25 Nov". */
  weekday?: boolean;
  /** Always print the year ("31 Mar 2027"); it is also printed when the day is not in `refYear`. */
  year?: boolean;
  /** The year of the report; a day in another year gets its year. */
  refYear?: number;
}

/** A day in words: "24 Nov" / "24 नवंबर", with the weekday and year when asked. */
export function dayWords(raw: string | null | undefined, lang: Lang, opts: DayOptions = {}): string {
  const c = readWallClock(raw);
  if (!c) return '';
  const month = lang === 'hi' ? MONTHS_HI[c.month - 1] : MONTHS_EN[c.month - 1];
  const withYear = opts.year || (opts.refYear !== undefined && c.year !== opts.refYear);
  const base = `${c.day} ${month}${withYear ? ` ${c.year}` : ''}`;
  if (!opts.weekday) return base;
  const wd = lang === 'hi' ? WEEKDAYS_HI[c.weekday] : WEEKDAYS_EN[c.weekday];
  return `${wd} ${base}`;
}

/** A clock time in words: "7:05 pm" / "शाम 7:05". */
export function timeWords(hour: number, minute: number, lang: Lang): string {
  const mm = String(minute).padStart(2, '0');
  if (lang === 'hi') {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const part = hour >= 4 && hour < 12 ? 'सुबह' : hour >= 12 && hour < 16 ? 'दोपहर' : hour >= 16 && hour < 20 ? 'शाम' : 'रात';
    return `${part} ${h12}:${mm}`;
  }
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${mm} ${hour < 12 ? 'am' : 'pm'}`;
}

/** A `HH:mm` clock time in words, or '' when it will not read. */
export function clockWords(hm: string | null | undefined, lang: Lang): string {
  const t = readHm(hm);
  return t ? timeWords(t.hour, t.minute, lang) : '';
}

/** "24 Nov, 7:05 pm": an instant or a portal time. A bare day reads as a day only. */
export function instantWords(raw: string | null | undefined, lang: Lang, opts: DayOptions = {}): string {
  const c = readWallClock(raw);
  if (!c) return '';
  const day = dayWords(raw, lang, opts);
  if (!hasClockTime(raw)) return day;
  return `${day}, ${timeWords(c.hour, c.minute, lang)}`;
}

/** A whole number with Indian grouping: 1,24,000. */
export function num(n: number, maxFraction = 0): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxFraction, minimumFractionDigits: 0 }).format(n);
}

/** Litres: "1,240 L". */
export function litres(n: number): string {
  return `${num(n)} L`;
}

/** Kilolitres: "12 KL", "6.5 KL". */
export function kl(n: number): string {
  return `${num(n, 3)} KL`;
}

/**
 * Rupees with Indian grouping, paise only when there are any ("₹4,999", "₹4,999.50"):
 * a trailing ".00" reads as a different number to a dealer. Same rule as the shared
 * `formatPaise`, kept here for amounts that arrive in rupees.
 */
export function rupees(n: number): string {
  const rounded = Math.round(Math.abs(n) * 100) / 100;
  const hasPaise = Math.round(rounded * 100) % 100 !== 0;
  const body = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rounded);
  return `${n < 0 ? '−' : ''}₹${body}`;
}

/** A short rupee figure for a tile: "₹12.7 L", "₹1.2 Cr", "₹82,000". */
export function rupeesShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${num(abs / 1e7, 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${num(abs / 1e5, 2)} L`;
  return rupees(n);
}

/** "3 days" / "1 day" in the reader's language. */
export function daysWords(n: number, lang: Lang): string {
  const abs = Math.abs(n);
  if (lang === 'hi') return `${abs} दिन`;
  return `${abs} ${abs === 1 ? 'day' : 'days'}`;
}

/** Digits for a screen reader, one at a time: "820.500" reads "8 2 0 point 5 0 0". */
export function spokenDigits(raw: string, lang: Lang): string {
  const point: Words = { hi: 'दशमलव', hl: 'point', en: 'point' };
  return raw
    .split('')
    .map((ch) => (ch === '.' ? say(point, lang) : ch === ' ' ? '' : ch))
    .filter(Boolean)
    .join(' ');
}

/** Devanagari needs more air between lines (ADR 0056 type rules). */
export function leadingFor(lang: Lang): string {
  return lang === 'hi' ? 'leading-[1.7]' : 'leading-normal';
}

/** The three kinds of fuel the app tells apart by colour swatch. */
export type FuelFamily = 'diesel' | 'petrol' | 'other';

/** A fuel's family from the key the portal printed (HSD, HS, MS, XP, XG...). */
export function fuelFamilyOfKey(key: string | null | undefined): FuelFamily {
  const k = (key ?? '').trim().toUpperCase();
  if (/^(HSD|HS|XG|DIESEL)/.test(k)) return 'diesel';
  if (/^(MS|XP|PETROL)/.test(k)) return 'petrol';
  return 'other';
}

/** The fuel's plain name in the reader's language; the raw key when it is not one we know. */
export function fuelName(key: string | null | undefined, lang: Lang): string {
  const k = (key ?? '').trim().toUpperCase();
  const diesel: Words = { hi: 'डीज़ल', hl: 'Diesel', en: 'Diesel' };
  const petrol: Words = { hi: 'पेट्रोल', hl: 'Petrol', en: 'Petrol' };
  if (k === 'XG') return `XG ${say({ hi: 'डीज़ल', hl: 'diesel', en: 'diesel' }, lang)}`;
  if (k === 'XP') return `XP ${say({ hi: 'पेट्रोल', hl: 'petrol', en: 'petrol' }, lang)}`;
  if (/^(HSD|HS|DIESEL)/.test(k)) return say(diesel, lang);
  if (/^(MS|PETROL)/.test(k)) return say(petrol, lang);
  return key?.trim() || '';
}

/** Lines of plain text for a share, with empty entries dropped. */
export function shareLines(lines: Array<string | null | false | undefined>): string {
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0).join('\n');
}
