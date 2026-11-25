import type { Lang } from '@/store/lang';

import { sayWords, type Words } from '../../types';

/**
 * Plain formatting shared by the four stock-and-sales kinds (dsr_sales, dsr_variation,
 * stock_check, load_plan): Indian digit grouping, true minus signs, dates and clock times in
 * words, fuel names. Pure functions; nothing here reads the clock except where a caller
 * passes `now`.
 *
 * Digits stay Latin in every language (the dealer's own DSR book and the chat both print
 * "10,430 L" in Hindi too). Days are IST calendar days (`YYYY-MM-DD`); instants are shown
 * on the IST wall clock whatever the phone's own zone is.
 */

/** A true minus sign (U+2212), so "−310" is never read as a dash. */
export const MINUS = '−';

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Indian grouping: 1,24,000. Keeps up to `decimals` places when the number has them. */
export function indian(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole = '0', frac] = fixed.split('.');
  let out: string;
  if (whole.length <= 3) {
    out = whole;
  } else {
    const head = whole.slice(0, -3);
    const tail = whole.slice(-3);
    out = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`;
  }
  const trimmed = frac !== undefined && /[1-9]/.test(frac) ? `${out}.${frac.replace(/0+$/, '')}` : out;
  return neg && Number(fixed) !== 0 ? `${MINUS}${trimmed}` : trimmed;
}

/** "10,430 L". Rounds to whole litres. */
export function litres(n: number): string {
  return `${indian(Math.round(n))} L`;
}

/** "+120", "−310", "0". Whole litres, no unit. */
export function signed(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return r > 0 ? `+${indian(r)}` : `${MINUS}${indian(Math.abs(r))}`;
}

/** "+120 L", "−310 L", "0 L". */
export function signedLitres(n: number): string {
  return `${signed(n)} L`;
}

/**
 * A percentage with at most two decimals and no trailing zero: 4, 0.5, 0.25, 0.75, 0.2. Two,
 * because the allowance rates are real quarter-points (0.25% and 0.75% of sales): one decimal would
 * print 0.3% and 0.8% beside litres worked out at the true rate.
 */
export function pct(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

// ── days and clocks ─────────────────────────────────────────────────────────

const MONTHS: Record<Lang, readonly string[]> = {
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  hl: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const WEEKDAYS_SHORT: Record<Lang, readonly string[]> = {
  hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
  hl: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const WEEKDAYS_LONG: Record<Lang, readonly string[]> = {
  hi: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
  hl: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

interface DayParts {
  y: number;
  m: number; // 1-12
  d: number;
  dow: number; // 0 = Sunday
}

function dayParts(day: string): DayParts | null {
  const hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** The IST calendar day of an instant, as `YYYY-MM-DD`; '' when it does not parse. */
export function istDay(iso: string | number): string {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (both `YYYY-MM-DD`); 0 when either does not parse. */
export function daysBetween(a: string, b: string): number {
  const pa = dayParts(a);
  const pb = dayParts(b);
  if (!pa || !pb) return 0;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/**
 * Whole days from today (IST) to a calendar day: 1 for tomorrow, 0 for today, -2 for the day before
 * yesterday. Null when the text is not a day. This is how a count of days is made TRUE NOW from the
 * date a snapshot carries: the snapshot's own count was worked out on the day it was made.
 */
export function daysFromToday(day: string | null | undefined, now: number = Date.now()): number | null {
  if (!day || !dayParts(day)) return null;
  return daysBetween(istDay(now), day);
}

/** "23 Nov" / "23 नवंबर". An unreadable day comes back as written. */
export function dayWords(day: string, lang: Lang): string {
  const p = dayParts(day);
  if (!p) return day;
  return `${p.d} ${MONTHS[lang][p.m - 1]}`;
}

/** "Mon 23 Nov". */
export function dayWithWeekday(day: string, lang: Lang): string {
  const p = dayParts(day);
  if (!p) return day;
  return `${WEEKDAYS_SHORT[lang][p.dow]} ${p.d} ${MONTHS[lang][p.m - 1]}`;
}

/** "Mon 23" for a narrow strip cell. */
export function weekdayAndDate(day: string, lang: Lang): string {
  const p = dayParts(day);
  if (!p) return day;
  return `${WEEKDAYS_SHORT[lang][p.dow]} ${p.d}`;
}

/** The weekday of a day in words: "Monday". */
export function weekdayLong(day: string, lang: Lang): string {
  const p = dayParts(day);
  return p ? WEEKDAYS_LONG[lang][p.dow]! : day;
}

/** "last Monday" / "पिछले सोमवार" / "pichhle Monday". */
export function lastWeekday(day: string, lang: Lang): string {
  const w = weekdayLong(day, lang);
  return lang === 'hi' ? `पिछले ${w}` : lang === 'hl' ? `pichhle ${w}` : `last ${w}`;
}

function clock12(hour: number, minute: number, lang: Lang): string {
  const mm = String(minute).padStart(2, '0');
  if (lang === 'hi') {
    const part = hour >= 5 && hour < 12 ? 'सुबह' : hour >= 12 && hour < 16 ? 'दोपहर' : hour >= 16 && hour < 19 ? 'शाम' : 'रात';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${part} ${h}:${mm}`;
  }
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${mm} ${hour < 12 ? 'am' : 'pm'}`;
}

/** The IST wall clock of an instant: "7:05 pm" / "शाम 7:05". Empty when it does not parse. */
export function timeWords(iso: string, lang: Lang): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + IST_OFFSET_MS);
  return clock12(d.getUTCHours(), d.getUTCMinutes(), lang);
}

/** A `HH:mm` clock: "4:00 pm". Empty when it does not parse. */
export function clockWords(hhmm: string, lang: Lang): string {
  const hit = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!hit) return '';
  return clock12(Number(hit[1]), Number(hit[2]), lang);
}

/** "24 Nov, 10:14 am" for an instant, in IST. */
export function dayAndTime(iso: string, lang: Lang): string {
  const day = istDay(iso);
  if (!day) return '';
  return `${dayWords(day, lang)}, ${timeWords(iso, lang)}`;
}

// ── lists and fuels ─────────────────────────────────────────────────────────

/** "A", "A and B", "A, B and C" in the reader's language. */
export function joinList(items: readonly string[], lang: Lang): string {
  if (items.length <= 1) return items[0] ?? '';
  const and = lang === 'hi' ? 'और' : lang === 'hl' ? 'aur' : 'and';
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

interface FuelFacts {
  name: Words;
  /** Which workbook colour: diesel blue, petrol deepened orange, or the neutral. */
  tone: 'diesel' | 'petrol' | 'other';
}

const FUELS: Record<string, FuelFacts> = {
  HSD: { name: { hi: 'डीज़ल', hl: 'Diesel', en: 'Diesel' }, tone: 'diesel' },
  MS: { name: { hi: 'पेट्रोल', hl: 'Petrol', en: 'Petrol' }, tone: 'petrol' },
  XP: { name: { hi: 'XP95 पेट्रोल', hl: 'XP95 petrol', en: 'XP95 petrol' }, tone: 'petrol' },
  XG: { name: { hi: 'XG डीज़ल', hl: 'XG diesel', en: 'XG diesel' }, tone: 'diesel' },
};

function factsOf(key: string): FuelFacts | undefined {
  return FUELS[key.trim().toUpperCase()];
}

/** The fuel's name for a reader; an unknown key is shown as written. */
export function fuelName(key: string, lang: Lang): string {
  const f = factsOf(key);
  return f ? sayWords(f.name, lang) : key;
}

/** The letters beside the swatch (HSD, MS, XP, XG), or whatever the portal printed. */
export function fuelLetters(key: string): string {
  return key.trim().toUpperCase();
}

/** `diesel` | `petrol` | `other`: the Tailwind token `fuel-<tone>` and the CSS variable `--fuel-<tone>`. */
export function fuelTone(key: string): 'diesel' | 'petrol' | 'other' {
  return factsOf(key)?.tone ?? 'other';
}

/** The CSS colour of a fuel, for an SVG fill or a style. Never the only cue: the letters go beside it. */
export function fuelColor(key: string): string {
  return `var(--fuel-${fuelTone(key)})`;
}

/** "tanks 4, 6, 8" / "टंकी 4, 6, 8"; empty when there are none. */
export function tanksWords(nos: readonly number[], lang: Lang): string {
  if (nos.length === 0) return '';
  const list = nos.join(', ');
  return lang === 'hi' ? `टंकी ${list}` : lang === 'hl' ? `tanki ${list}` : `${nos.length > 1 ? 'tanks' : 'tank'} ${list}`;
}
