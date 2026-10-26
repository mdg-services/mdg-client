import type { Lang } from '@/store/lang';
import { GST_STATES, cleanGstin, isGstin } from '@dk/shared';

/**
 * The small decisions behind the setup cards (billing, the bill), kept
 * apart from the drawing so they can be tested without a screen. The strip's own
 * live in `stripView.ts`: the strip is always on screen in the owner's chat, the
 * cards are only downloaded when there is one to draw.
 */

// ── The billing card ───────────────────────────────────────────────────────

export type GstinCheck =
  /** Nothing typed: fine, a GSTIN is optional. */
  | { state: 'empty' }
  /** Still being typed: fewer than 15 characters. */
  | { state: 'partial'; length: number }
  | { state: 'ok'; gstin: string; stateCode: string }
  | { state: 'bad'; length: number };

/**
 * Where a GSTIN being typed stands. "Partial" is not an error — nobody types
 * fifteen characters at once — but it does stop Save, so a half-typed number is
 * never saved as if it were whole.
 */
export function checkGstin(raw: string): GstinCheck {
  const gstin = cleanGstin(raw);
  if (!gstin) return { state: 'empty' };
  if (gstin.length < 15) return { state: 'partial', length: gstin.length };
  if (gstin.length === 15 && isGstin(gstin)) {
    return { state: 'ok', gstin, stateCode: gstin.slice(0, 2) };
  }
  return { state: 'bad', length: gstin.length };
}

/** Each GST state's name in Hindi, for the dealer's own list. */
export const GST_STATE_HI: Readonly<Record<string, string>> = {
  '01': 'जम्मू और कश्मीर',
  '02': 'हिमाचल प्रदेश',
  '03': 'पंजाब',
  '04': 'चंडीगढ़',
  '05': 'उत्तराखंड',
  '06': 'हरियाणा',
  '07': 'दिल्ली',
  '08': 'राजस्थान',
  '09': 'उत्तर प्रदेश',
  '10': 'बिहार',
  '11': 'सिक्किम',
  '12': 'अरुणाचल प्रदेश',
  '13': 'नागालैंड',
  '14': 'मणिपुर',
  '15': 'मिज़ोरम',
  '16': 'त्रिपुरा',
  '17': 'मेघालय',
  '18': 'असम',
  '19': 'पश्चिम बंगाल',
  '20': 'झारखंड',
  '21': 'ओडिशा',
  '22': 'छत्तीसगढ़',
  '23': 'मध्य प्रदेश',
  '24': 'गुजरात',
  // 25 and 28 are old codes (before the 2020 merger, before the 2014 split) that older GSTINs still carry.
  '25': 'दमन और दीव',
  '26': 'दादरा और नगर हवेली और दमन और दीव',
  '27': 'महाराष्ट्र',
  '28': 'आंध्र प्रदेश (पुराना)',
  '29': 'कर्नाटक',
  '30': 'गोवा',
  '31': 'लक्षद्वीप',
  '32': 'केरल',
  '33': 'तमिल नाडु',
  '34': 'पुदुचेरी',
  '35': 'अंडमान और निकोबार द्वीप समूह',
  '36': 'तेलंगाना',
  '37': 'आंध्र प्रदेश',
  '38': 'लद्दाख',
  '97': 'अन्य क्षेत्र',
  '99': 'केंद्र अधिकार क्षेत्र',
};

/** "हरियाणा (Haryana)" on the Hindi screen, "Haryana" on the English one. */
export function stateLabel(code: string, lang: Lang): string {
  const en = GST_STATES[code] ?? code;
  if (lang !== 'hi') return en;
  const hi = GST_STATE_HI[code];
  return hi ? `${hi} (${en})` : en;
}

/** Every state, in the reader's alphabet (a Hindi reader finds "हरियाणा" under ह). */
export function stateOptions(lang: Lang): Array<{ code: string; label: string }> {
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(lang === 'hi' ? 'hi' : 'en');
  } catch {
    collator = new Intl.Collator();
  }
  return Object.keys(GST_STATES)
    .map((code) => ({ code, label: stateLabel(code, lang) }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

// ── The bill ───────────────────────────────────────────────────────────────

/** "₹3,540" — whole rupees, Indian grouping, with the paise only when there are some. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

const LOCALES: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN' };

/**
 * "2 November" / "2 नवंबर" from a `YYYY-MM-DD` day. Built from its parts, not
 * parsed as a timestamp, so the day never slips by one in a zone behind UTC.
 * Empty when it cannot be read, so the card shows what it can and nothing odd.
 */
export function formatDay(ymd: string | null | undefined, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long' }).replace(/॰/g, '');
}

/**
 * Today in India as `YYYY-MM-DD`, whatever the phone's own zone says: a bill's due
 * day is a day on India's calendar, and a phone set to another zone must not call
 * it late (or on time) a few hours early.
 */
export function istToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Has a bill's due day gone by? Only after the day itself: on the due day it is
 * still due. Judged on the strings (both `YYYY-MM-DD`, so they order as days), and
 * never for a bill with no day, or one whose day cannot be read.
 */
export function isPastDue(dueOn: string | null | undefined, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueOn ?? '') && (dueOn as string) < today;
}
