import { Check, Info, Lock, TriangleAlert } from 'lucide-react';
import { useId, type ReactElement } from 'react';

import { Num, SectionCard, StatTile } from '@/components/kit';
import { cn } from '@/lib/cn';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import { findFestival } from '@dk/shared';
import type { CreditDodData } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import type { KindAlert, KindTile, KindView, OverlayProps, ReportStatusKey, Words } from '../types';

import {
  dayWords,
  daysWords,
  fill,
  instantWords,
  leadingFor,
  num,
  rupees,
  rupeesShort,
  say,
  shareLines,
} from './_fmtTankerMoney';
import { Lead, MoreRow } from './_partsTankerMoney';
import { daysFromToday } from './dsr_sales/fmt';

/**
 * Credit & DOD (ADR 0056), OWNERS ONLY: the ring of how much of the credit limit is used,
 * the percentage in the middle, and the amount to deposit above it. A ring is only ever
 * this report. A padlock in the middle (and a hatched ring) means credit is locked.
 *
 * Rules the figures follow:
 *  - Every "days left" is the snapshot's own number, measured at `asOf`. A report from
 *    20 Nov never says "3 days left" on 25 Nov.
 *  - An advance is a positive amount in words ("IndianOil holds your advance"), never a
 *    minus sign. Settled says "No dues", never "Rs 0".
 *  - Overdue is red with an octagon and a word; inside the portal's posting lag it is
 *    amber with a triangle and says the payment may not be posted yet (never accusing).
 *  - A back-dated report says so first and is never read as today's.
 */

/**
 * Limit figures are shown to the whole rupee: nobody reads paise off a limit. The amount to deposit
 * (the hero) keeps its paise because that is the figure paid in.
 */
function wholeRupees(n: number): string {
  return `${n < 0 ? '−' : ''}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(Math.abs(n)))}`;
}

/** "₹12.75 L" from a lakh up, otherwise whole rupees: never paise. */
function limitRupees(n: number): string {
  return Math.abs(n) >= 1e5 ? rupeesShort(n) : wholeRupees(n);
}

const T = {
  title: { hi: 'उधार और DOD', hl: 'Credit aur DOD', en: 'Credit & DOD' },
  // Hero
  eyDeposit: { hi: '{day} तक जमा करें', hl: '{day} tak jama karein', en: 'Deposit by {day}' },
  eyDepositBare: { hi: 'जमा करने की रकम', hl: 'Jama karne ki rakam', en: 'Amount to deposit' },
  eyToday: { hi: 'आज जमा करें', hl: 'Aaj jama karein', en: 'Deposit today' },
  eyOverdue: { hi: 'तारीख निकल चुकी है', hl: 'Taareekh nikal chuki hai', en: 'Overdue' },
  eyLag: { hi: 'तारीख निकल गई', hl: 'Taareekh nikal gayi', en: 'Deadline passed' },
  eyAdvance: {
    hi: 'IndianOil के पास आपका एडवांस',
    hl: 'IndianOil ke paas aapka advance',
    en: 'IndianOil holds your advance',
  },
  eySettled: { hi: 'कुछ बकाया नहीं', hl: 'Kuch baaki nahi', en: 'Nothing due' },
  noDues: { hi: 'कोई बकाया नहीं', hl: 'Koi baaki nahi', en: 'No dues' },
  leadSettled: {
    hi: 'आपके IndianOil खाते में कुछ बकाया नहीं है।',
    hl: 'Aapke IndianOil account mein kuch baaki nahi hai.',
    en: 'Nothing is due on your IndianOil account.',
  },
  wordOverdue: { hi: 'देर हो चुकी', hl: 'Der ho chuki', en: 'Overdue' },
  wordLag: { hi: 'तारीख निकली', hl: 'Taareekh nikli', en: 'Deadline passed' },
  wordToday: { hi: 'आज', hl: 'Aaj', en: 'Due today' },
  wordSoon: { hi: 'जल्द', hl: 'Jaldi', en: 'Due soon' },
  wordDue: { hi: 'जमा करना है', hl: 'Jama karna hai', en: 'To deposit' },
  wordAdvance: { hi: 'एडवांस', hl: 'Advance', en: 'Advance' },
  wordSettled: { hi: 'सब चुकता', hl: 'Sab chukta', en: 'Settled' },
  deadlineWas: {
    hi: 'आखिरी तारीख {day} थी',
    hl: 'Aakhri taareekh {day} thi',
    en: 'Deadline was {day}',
  },
  deadlineWasApprox: {
    hi: 'आखिरी तारीख लगभग {day} थी',
    hl: 'Aakhri taareekh lagbhag {day} thi',
    en: 'Deadline was about {day}',
  },
  daysOverdue: { hi: '{d} की देरी', hl: '{d} ki der', en: '{d} overdue' },
  daysOverdueMin: {
    hi: 'कम से कम {d} की देरी',
    hl: 'Kam se kam {d} ki der',
    en: 'At least {d} overdue',
  },
  coversMissed: {
    hi: '{n} छूटी हुई तारीखें इसमें शामिल हैं',
    hl: '{n} chhooti hui taareekhein isme shaamil hain',
    en: 'Covers {n} missed deadlines',
  },
  partOfThis: {
    hi: 'इसमें से {n} सबसे पुराना बकाया है, बाकी भी देर हो चुकी है।',
    hl: 'Isme se {n} sabse purana baaki hai, baaki bhi der ho chuki hai.',
    en: 'Part of this: {n} is the oldest due, the rest is also overdue.',
  },
  lagNote: {
    hi: 'आपका भुगतान अभी पोर्टल पर दिखा न हो।',
    hl: 'Aapka payment abhi portal par post na hua ho.',
    en: 'Your payment may not be posted yet.',
  },
  byDay: { hi: '{day} तक', hl: '{day} tak', en: 'by {day}' },
  byDayApprox: { hi: 'लगभग {day} तक', hl: 'Lagbhag {day} tak', en: 'by about {day}' },
  daysLeftToday: { hi: 'आज आखिरी दिन', hl: 'Aaj aakhri din', en: 'last day today' },
  daysLeftTomorrow: { hi: 'कल आखिरी दिन', hl: 'Kal aakhri din', en: 'last day tomorrow' },
  daysLeft: { hi: '{d} बाकी', hl: '{d} baaki', en: '{d} left' },
  backdated: {
    hi: 'यह {day} का हिसाब है, आज का नहीं।',
    hl: 'Yeh {day} ka hisaab hai, aaj ka nahi.',
    en: 'Position as of {day}, not today.',
  },
  // Lock
  lockHead: { hi: 'क्रेडिट लॉक है', hl: 'Credit lock hai', en: 'Credit is locked' },
  lockBody: {
    hi: 'हर खरीद का पैसा लोडिंग से पहले दें। अपने सेल्स ऑफिसर को फ़ोन करें।',
    hl: 'Har kharid ka paisa loading se pehle dein. Apne sales officer ko phone karein.',
    en: 'Pay for each purchase before loading. Call your sales officer.',
  },
  lockSince: {
    hi: 'रिव्यू की तारीख {day} को निकल गई ({d} पहले)।',
    hl: 'Review ki taareekh {day} ko nikal gayi ({d} pehle).',
    en: 'The review date, {day}, passed {d} ago.',
  },
  lockBadge: { hi: 'लॉक', hl: 'Lock', en: 'Locked' },
  lockedRing: {
    hi: 'बची हुई यह रकम इस्तेमाल नहीं हो सकती',
    hl: 'Bachi hui yeh rakam istemaal nahi ho sakti',
    en: 'This remaining amount cannot be used',
  },
  // Ring
  pctUsed: { hi: 'इस्तेमाल', hl: 'istemaal', en: 'used' },
  ringAria: {
    hi: 'लिमिट का {p} प्रतिशत इस्तेमाल हुआ',
    hl: 'Limit ka {p} percent istemaal hua',
    en: 'Used {p} percent of the limit',
  },
  ringLockedAria: {
    hi: 'क्रेडिट लॉक है, लिमिट इस्तेमाल नहीं हो सकती',
    hl: 'Credit lock hai, limit istemaal nahi ho sakti',
    en: 'Credit is locked, the limit cannot be used',
  },
  usedLabel: { hi: 'इस्तेमाल {n}', hl: 'Istemaal {n}', en: 'Used {n}' },
  leftLabel: { hi: 'बची {n}', hl: 'Bachi {n}', en: 'Left {n}' },
  nearlyFull: {
    hi: 'लिमिट लगभग भर गई है',
    hl: 'Limit lagbhag bhar gayi hai',
    en: 'The limit is nearly full',
  },
  // Three tiles
  limit: { hi: 'लिमिट', hl: 'Limit', en: 'Limit' },
  used: { hi: 'इस्तेमाल', hl: 'Istemaal', en: 'Used' },
  left: { hi: 'बची', hl: 'Bachi', en: 'Left' },
  form: { hi: 'लिमिट का तरीका', hl: 'Limit ka tareeka', en: 'Form of limit' },
  // Open purchases
  purchases: { hi: 'खुली खरीद', hl: 'Khuli kharid', en: 'Open purchases' },
  bought: { hi: '{day} को खरीदी', hl: '{day} ko kharidi', en: 'Bought {day}' },
  depositBy: { hi: '{day} तक जमा करें', hl: '{day} tak jama karein', en: 'deposit by {day}' },
  // Review
  review: {
    hi: 'क्रेडिट रिव्यू {day} को ({d} बाद)',
    hl: 'Credit review {day} ko ({d} baad)',
    en: 'Credit review on {day} ({d})',
  },
  reviewFar: {
    hi: 'क्रेडिट रिव्यू लगभग {m} महीने बाद ({day} को)',
    hl: 'Credit review lagbhag {m} mahine baad ({day} ko)',
    en: 'Credit review in about {m} months ({day})',
  },
  reviewToday: {
    hi: 'क्रेडिट रिव्यू आज है',
    hl: 'Credit review aaj hai',
    en: 'Credit review is today',
  },
  // More
  moreTitle: {
    hi: 'और देखें: पूरी रकम',
    hl: 'Aur dekhein: poori rakam',
    en: 'More details: full amounts',
  },
  asOfLine: {
    hi: 'हिसाब {when} तक का है।',
    hl: 'Hisaab {when} tak ka hai.',
    en: 'Figures are up to {when}.',
  },
  laterNot: {
    hi: 'इसके बाद की खरीद और भुगतान इसमें नहीं हैं।',
    hl: 'Iske baad ki kharid aur payment isme nahi hain.',
    en: 'Later purchases and payments are not in it.',
  },
  // Alert
  alertOverdueLine: {
    hi: 'IndianOil में अभी जमा करें।',
    hl: 'IndianOil mein abhi jama karein.',
    en: 'Deposit it with IndianOil now.',
  },
  alertAlsoLocked: {
    hi: ' क्रेडिट भी लॉक है।',
    hl: ' Credit bhi lock hai.',
    en: ' Credit is also locked.',
  },
  alertLagHead: {
    hi: 'जमा करने की तारीख निकल गई',
    hl: 'Jama karne ki taareekh nikal gayi',
    en: 'The deposit deadline passed',
  },
  // Headline
  headDue: {
    hi: '{day} तक {n} जमा करें',
    hl: '{day} tak {n} jama karein',
    en: '{n} to deposit by {day}',
  },
  headDueBare: { hi: '{n} जमा करें', hl: '{n} jama karein', en: '{n} to deposit' },
  headToday: { hi: 'आज {n} जमा करें', hl: 'Aaj {n} jama karein', en: '{n} to deposit today' },
  headOverdue: { hi: '{n} की तारीख निकल गई', hl: '{n} ki taareekh nikal gayi', en: '{n} overdue' },
  headLag: { hi: '{n}: तारीख निकल गई', hl: '{n}: taareekh nikal gayi', en: '{n}: deadline passed' },
  headAdvance: {
    hi: 'IndianOil के पास आपका {n} एडवांस है',
    hl: 'IndianOil ke paas aapka {n} advance hai',
    en: 'IndianOil holds {n} for you',
  },
  // Tile
  tileOverdue: { hi: 'देर हो चुकी', hl: 'Der ho chuki', en: 'Overdue' },
  tileLag: {
    hi: 'भुगतान अभी न दिखा हो',
    hl: 'Payment abhi na dikha ho',
    en: 'Payment may not be posted',
  },
  tileToday: { hi: 'आज जमा करें', hl: 'Aaj jama karein', en: 'Deposit today' },
  tileAdvance: {
    hi: 'IndianOil के पास आपका',
    hl: 'IndianOil ke paas aapka',
    en: 'IndianOil holds it for you',
  },
  tileLimitLeft: { hi: 'बची लिमिट {n}', hl: 'Bachi limit {n}', en: 'Limit left {n}' },
  tileLocked: { hi: 'क्रेडिट लॉक', hl: 'Credit lock', en: 'Credit locked' },
  tileAsOf: { hi: '{day} का हिसाब', hl: '{day} ka hisaab', en: 'As of {day}' },
  // Share
  shareTitle: { hi: 'उधार और DOD', hl: 'Credit aur DOD', en: 'Credit & DOD' },
  shareAsOf: { hi: '{when} तक का हिसाब', hl: '{when} tak ka hisaab', en: 'Position as of {when}' },
  shareFooter: {
    hi: 'IndianOil पोर्टल से, MDG द्वारा।',
    hl: 'IndianOil portal se, MDG dwara.',
    en: 'From the IndianOil portal, via MDG.',
  },
} satisfies Record<string, Words>;

// ── what the verdict means ──────────────────────────────────────────────────

/** A deposit due within this many days is "due soon" (the same cut as the server's). */
const DUE_SOON_DAYS = 3;

/**
 * The snapshot with its day counts made true NOW. The count in the snapshot ("1 day left") was worked
 * out on the day the card was made and Today keeps a card for up to a week, so the 7 pm card that says
 * "last day tomorrow" would still say it on the morning of the last day. The date itself
 * (`money.date`) does not go stale: the days are counted from it again, and a deposit that was not yet
 * due is read again by the server's own rule (before today overdue, today due today, up to three days
 * due soon). A card without a date, or a back-dated one, keeps what it was sent with. An overdue
 * card keeps its verdict and its "at least" flag; only the number of days moves on.
 */
export function liveCredit(data: CreditDodData, now: number = Date.now()): CreditDodData {
  if (data.backdated) return data;
  const left = daysFromToday(data.money.date, now);
  if (left === null) return data;
  const money = { ...data.money, daysLeft: left };
  switch (data.verdict) {
    case 'overdue':
    case 'overdue_lag':
      // Still the same missed deadline: only a date that is really behind us can count days overdue.
      return left < 0 ? { ...data, money } : data;
    case 'due':
    case 'due_soon':
    case 'due_today': {
      // The verdict moves only when the count has crossed a line since the card was made.
      const was = data.money.daysLeft === null ? data.verdict : dueVerdictAt(data.money.daysLeft);
      const now = dueVerdictAt(left);
      return { ...data, verdict: was === now ? data.verdict : now, money };
    }
    default:
      return data;
  }
}

/** The server's reading of a deposit that is not yet overdue, for a count of days. */
function dueVerdictAt(days: number): 'overdue' | 'due_today' | 'due_soon' | 'due' {
  return days < 0
    ? 'overdue'
    : days === 0
      ? 'due_today'
      : days <= DUE_SOON_DAYS
        ? 'due_soon'
        : 'due';
}

export function isLocked(data: CreditDodData): boolean {
  return data.review?.lapsed === true;
}

/** How the report stands, as a status: red only when overdue, calm when it is just a deposit to make. */
export function statusOf(data: CreditDodData): ReportStatusKey {
  let base: ReportStatusKey;
  switch (data.verdict) {
    case 'overdue':
      base = 'problem';
      break;
    case 'overdue_lag':
    case 'due_today':
    case 'due_soon':
      base = 'attention';
      break;
    case 'due':
      base = 'info';
      break;
    case 'advance':
    case 'settled':
      base = 'ok';
      break;
  }
  if (isLocked(data) && (base === 'info' || base === 'ok')) return 'attention';
  return base;
}

function statusWord(data: CreditDodData): Words {
  switch (data.verdict) {
    case 'overdue':
      return T.wordOverdue;
    case 'overdue_lag':
      return T.wordLag;
    case 'due_today':
      return T.wordToday;
    case 'due_soon':
      return T.wordSoon;
    case 'due':
      return T.wordDue;
    case 'advance':
      return T.wordAdvance;
    case 'settled':
      return T.wordSettled;
  }
}

function dayOf(data: CreditDodData, raw: string | null | undefined, lang: Lang): string {
  return dayWords(raw, lang, { refYear: Number(data.asOf.slice(0, 4)) });
}

/** "6 days overdue" / "at least 6 days overdue", from the count (see {@link liveCredit}). */
function overdueDays(data: CreditDodData, lang: Lang): string {
  const n = data.money.daysLeft;
  if (n === null || n >= 0) return '';
  const d = daysWords(n, lang);
  return fill(data.money.daysIsMinimum ? T.daysOverdueMin : T.daysOverdue, lang, { d });
}

/** "3 days left", "last day tomorrow", from the count (see {@link liveCredit}). */
function daysLeftText(data: CreditDodData, lang: Lang): string {
  const n = data.money.daysLeft;
  if (n === null || n < 0) return '';
  if (n === 0) return say(T.daysLeftToday, lang);
  if (n === 1) return say(T.daysLeftTomorrow, lang);
  return fill(T.daysLeft, lang, { d: daysWords(n, lang) });
}

function eyebrow(data: CreditDodData, lang: Lang): string {
  const day = dayOf(data, data.money.date, lang);
  switch (data.verdict) {
    case 'overdue':
      return say(T.eyOverdue, lang);
    case 'overdue_lag':
      return say(T.eyLag, lang);
    case 'due_today':
      return say(T.eyToday, lang);
    case 'due_soon':
    case 'due':
      return day ? fill(T.eyDeposit, lang, { day }) : say(T.eyDepositBare, lang);
    case 'advance':
      return say(T.eyAdvance, lang);
    case 'settled':
      return say(T.eySettled, lang);
  }
}

// ── pieces ──────────────────────────────────────────────────────────────────

function FestivalStrip({
  festivalKey,
  lang,
}: {
  festivalKey: CreditDodData['festivalKey'];
  lang: Lang;
}): ReactElement | null {
  const f = findFestival(festivalKey);
  if (!f) return null;
  const [a, b, c] = f.colors;
  const background =
    f.bandStyle === 'stripes'
      ? `linear-gradient(to bottom, ${a} 0 33.33%, ${b} 33.33% 66.66%, ${c} 66.66% 100%)`
      : `linear-gradient(to right, ${a}, ${b}, ${c})`;
  return (
    <div
      data-testid="festival-strip"
      className="flex min-h-10 items-center justify-center rounded-xl px-3 py-1"
      style={{ background }}
    >
      <span
        className={cn('rounded-full px-3 py-0.5 text-center text-cta', leadingFor(lang))}
        style={{ backgroundColor: 'rgba(255,255,255,0.94)', color: f.ink }}
      >
        {lang === 'hi' ? f.greetingHi : f.greetingEn}
      </span>
    </div>
  );
}

const RING = 70;
const RING_C = 2 * Math.PI * RING;

/**
 * The ring: a thick donut of the limit used. The arc starts at the top and runs clockwise.
 * At 85% or more it gets white notches and a triangle (a pattern, not only a colour);
 * locked, it is a hatched grey ring with a padlock in the middle.
 */
export function LimitRing({
  pct,
  locked,
  lang,
}: {
  pct: number | null;
  locked: boolean;
  lang: Lang;
}): ReactElement {
  const uid = useId().replace(/:/g, '');
  const hatchId = `hatch-${uid}`;
  const rounded = pct === null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
  const arc = (RING_C * rounded) / 100;
  const heavy = !locked && rounded >= 85;
  const aria = locked
    ? say(T.ringLockedAria, lang)
    : fill(T.ringAria, lang, { p: String(rounded) });
  return (
    <div
      role="img"
      aria-label={aria}
      data-testid="limit-ring"
      data-locked={locked ? 'true' : 'false'}
      data-pct={locked ? '' : String(rounded)}
      className="relative mx-auto aspect-square w-44 max-w-full"
    >
      <svg viewBox="0 0 176 176" className="h-full w-full" aria-hidden="true" focusable="false">
        <defs>
          <pattern
            id={hatchId}
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="9" height="9" fill="var(--color-surface-2)" />
            <line x1="0" y1="0" x2="0" y2="9" stroke="var(--color-text-muted)" strokeWidth="4" />
          </pattern>
        </defs>
        <circle
          cx="88"
          cy="88"
          r={RING}
          fill="none"
          stroke={locked ? `url(#${hatchId})` : 'var(--color-border-strong)'}
          strokeWidth="22"
        />
        {!locked && rounded > 0 ? (
          <circle
            cx="88"
            cy="88"
            r={RING}
            fill="none"
            stroke="var(--kind-credit-ink)"
            strokeWidth="22"
            strokeDasharray={`${arc} ${RING_C}`}
            transform="rotate(-90 88 88)"
          />
        ) : null}
        {heavy
          ? Array.from({ length: 36 }, (_, i) => {
              const a = (i * 10 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={88 + (RING - 11) * Math.sin(a)}
                  y1={88 - (RING - 11) * Math.cos(a)}
                  x2={88 + (RING + 11) * Math.sin(a)}
                  y2={88 - (RING + 11) * Math.cos(a)}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                />
              );
            })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {locked ? (
          <>
            <Lock aria-hidden="true" className="h-9 w-9 text-text" strokeWidth={2.4} />
            <span className="text-subheading text-text">{say(T.lockBadge, lang)}</span>
          </>
        ) : (
          <>
            <span className="text-display leading-none text-text">{rounded}%</span>
            <span className="text-body text-text-muted">{say(T.pctUsed, lang)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Amount({
  children,
  tone,
}: {
  children: string;
  tone?: 'problem' | 'attention';
}): ReactElement {
  return (
    <p
      data-testid="credit-amount"
      className={cn(
        'break-words text-display',
        tone === 'problem'
          ? 'text-status-problem-ink'
          : tone === 'attention'
            ? 'text-status-attention-ink'
            : 'text-text',
      )}
    >
      {children}
    </p>
  );
}

function Hero({ data, lang }: { data: CreditDodData; lang: Lang }): ReactElement {
  const m = data.money;
  const v = data.verdict;
  const day = dayOf(data, m.date, lang);
  const overdue = v === 'overdue' || v === 'overdue_lag';
  const dateLine = overdue
    ? day
      ? fill(m.dateIsApprox ? T.deadlineWasApprox : T.deadlineWas, lang, { day })
      : ''
    : v === 'due' || v === 'due_soon' || v === 'due_today'
      ? day
        ? fill(m.dateIsApprox ? T.byDayApprox : T.byDay, lang, { day })
        : ''
      : '';
  const days =
    v === 'overdue'
      ? overdueDays(data, lang)
      : v === 'due' || v === 'due_soon'
        ? daysLeftText(data, lang)
        : '';
  const status = statusOf(data);
  const tone = v === 'overdue' ? 'problem' : v === 'overdue_lag' ? 'attention' : undefined;
  return (
    <section
      data-testid="credit-hero"
      data-verdict={v}
      className="rounded-xl bg-kind-credit-soft p-4"
    >
      <p className={cn('text-subheading text-kind-credit-ink', leadingFor(lang))}>
        {eyebrow(data, lang)}
      </p>
      {v === 'settled' ? (
        <Amount>{say(T.noDues, lang)}</Amount>
      ) : (
        <Amount tone={tone}>{rupees(m.amount)}</Amount>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={status} lang={lang} word={say(statusWord(data), lang)} />
        {dateLine ? <span className="text-subheading text-text">{dateLine}</span> : null}
        {days ? <span className="text-body text-text">{days}</span> : null}
      </div>
      {v === 'overdue_lag' ? (
        <p className={cn('mt-2 text-subheading text-text', leadingFor(lang))}>
          {say(T.lagNote, lang)}
        </p>
      ) : null}
      {overdue && m.deadlines !== null && m.deadlines > 1 ? (
        <p className={cn('mt-2 text-body text-text', leadingFor(lang))}>
          {fill(T.coversMissed, lang, { n: String(m.deadlines) })}
        </p>
      ) : null}
      {overdue && m.dueAmount > 0 && m.dueAmount < m.amount ? (
        <p className={cn('mt-2 text-body text-text', leadingFor(lang))}>
          {fill(T.partOfThis, lang, { n: rupees(m.dueAmount) })}
        </p>
      ) : null}
    </section>
  );
}

function LockBand({ data, lang }: { data: CreditDodData; lang: Lang }): ReactElement | null {
  if (!data.review || !data.review.lapsed) return null;
  const ago = Math.abs(data.review.daysUntil);
  return (
    <div
      data-testid="lock-band"
      role="status"
      className="flex items-start gap-3 rounded-xl bg-status-attention-soft px-4 py-3 text-status-attention-ink"
    >
      <Lock aria-hidden="true" className="mt-1 h-6 w-6 shrink-0" strokeWidth={2.4} />
      <div className={cn('min-w-0', leadingFor(lang))}>
        <p className="text-subheading">{say(T.lockHead, lang)}</p>
        <p className="text-body">{say(T.lockBody, lang)}</p>
        <p className="mt-1 text-body">
          {fill(T.lockSince, lang, {
            day: dayOf(data, data.review.on, lang),
            d: ago > 0 ? daysWords(ago, lang) : daysWords(0, lang),
          })}
        </p>
      </div>
    </div>
  );
}

/** One of the three limit figures as a kit tile: the label, the amount in short form (₹47.25 L), never shrunk. */
function FigureTile({ label, value }: { label: string; value: string }): ReactElement {
  return <StatTile label={label} value={<Num>{value}</Num>} ariaLabel={`${label}: ${value}`} />;
}

const FORMS = ['DOD', 'CREDIT', 'CASH & CARRY'] as const;

function FormChips({
  form,
  lang,
}: {
  form: CreditDodData['limit']['form'];
  lang: Lang;
}): ReactElement | null {
  if (!form) return null;
  return (
    <div data-testid="form-chips">
      <p className="mb-1.5 text-subheading text-text-muted">{say(T.form, lang)}</p>
      <ul className="flex flex-wrap gap-2">
        {FORMS.map((f) => {
          const lit = f === form;
          return (
            <li
              key={f}
              data-lit={lit ? 'true' : 'false'}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-body',
                lit
                  ? 'border-2 border-kind-credit-ink bg-kind-credit-soft font-semibold text-text'
                  : 'border border-dashed border-border-strong text-text-muted',
              )}
            >
              {lit ? <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} /> : null}
              {f}
              {lit ? <span className="sr-only"> ✓</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Purchases({ data, lang }: { data: CreditDodData; lang: Lang }): ReactElement | null {
  const lots = data.lots ?? [];
  if (lots.length === 0) return null;
  return (
    <section data-testid="open-purchases">
      <SectionCard title={say(T.purchases, lang)} count={lots.length} variant="list">
        <ul className="divide-y divide-border">
          {lots.map((lot, i) => (
            <li key={`${lot.boughtOn}-${i}`} className="min-h-14 py-2">
              <p className="text-subheading text-text">{rupees(lot.amount)}</p>
              <p className={cn('text-body text-text-muted', leadingFor(lang))}>
                {fill(T.bought, lang, { day: dayOf(data, lot.boughtOn, lang) })} ·{' '}
                {fill(T.depositBy, lang, { day: dayOf(data, lot.deadline, lang) })}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </section>
  );
}

function reviewLine(data: CreditDodData, lang: Lang): string {
  const r = data.review;
  if (!r || r.lapsed) return '';
  if (r.daysUntil === 0) return say(T.reviewToday, lang);
  const day = dayWords(r.on, lang, { year: true });
  // A date months away is easier to read as months: "about 4 months", with the date in brackets.
  if (r.daysUntil >= 60)
    return fill(T.reviewFar, lang, { day, m: num(Math.round(r.daysUntil / 30)) });
  return fill(T.review, lang, { day, d: daysWords(r.daysUntil, lang) });
}

export function Overlay({ data: sent, lang }: OverlayProps<'credit_dod'>): ReactElement {
  const data = liveCredit(sent);
  const locked = isLocked(data);
  const lim = data.limit;
  const showRing = locked || lim.usedPct !== null;
  const asOfDay = dayOf(data, data.asOf, lang);
  const review = reviewLine(data, lang);
  const heavy = !locked && lim.usedPct !== null && lim.usedPct >= 85;
  return (
    <div data-kind-view="credit_dod" data-verdict={data.verdict} className="space-y-4 p-4">
      <FestivalStrip festivalKey={data.festivalKey} lang={lang} />
      {data.backdated ? (
        <div
          data-testid="backdated-banner"
          role="status"
          className="flex items-start gap-3 rounded-xl bg-status-info-soft px-4 py-3 text-status-info-ink"
        >
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <p className={cn('text-subheading', leadingFor(lang))}>
            {fill(T.backdated, lang, { day: asOfDay })}
          </p>
        </div>
      ) : null}

      <Lead lang={lang}>
        {data.verdict === 'settled' ? say(T.leadSettled, lang) : headlineOf(data, lang)}
      </Lead>
      <Hero data={data} lang={lang} />
      <LockBand data={data} lang={lang} />

      <SectionCard title={translate(lang, 'rv2.credit.limitTitle')}>
        <div className="space-y-3">
          {showRing ? (
            <section className="space-y-3">
              <LimitRing pct={lim.usedPct} locked={locked} lang={lang} />
              {locked ? (
                <p className={cn('text-center text-subheading text-text', leadingFor(lang))}>
                  {say(T.lockedRing, lang)}
                </p>
              ) : (
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-subheading text-text">
                  <span>{fill(T.usedLabel, lang, { n: limitRupees(lim.availed) })}</span>
                  <span>{fill(T.leftLabel, lang, { n: limitRupees(lim.available) })}</span>
                </div>
              )}
              {heavy ? (
                <p
                  className={cn(
                    'flex items-center justify-center gap-2 text-subheading text-status-attention-ink',
                    leadingFor(lang),
                  )}
                >
                  <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {say(T.nearlyFull, lang)}
                </p>
              ) : null}
            </section>
          ) : null}

          <div
            data-testid="limit-figures"
            className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2"
          >
            <FigureTile label={say(T.limit, lang)} value={limitRupees(lim.current)} />
            <FigureTile label={say(T.used, lang)} value={limitRupees(lim.availed)} />
            <FigureTile label={say(T.left, lang)} value={limitRupees(lim.available)} />
          </div>

          <FormChips form={lim.form} lang={lang} />
        </div>
      </SectionCard>
      <Purchases data={data} lang={lang} />

      {review ? (
        <p data-testid="review-line" className={cn('text-subheading text-text', leadingFor(lang))}>
          {review}
        </p>
      ) : null}

      <MoreRow title={T.moreTitle} lang={lang}>
        <dl className="space-y-1">
          {(
            [
              [T.limit, lim.current],
              [T.used, lim.availed],
              [T.left, lim.available],
            ] as const
          ).map(([label, amount]) => (
            <div key={label.en} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
              <dt className="min-w-0 break-words text-text-muted">{say(label, lang)}</dt>
              <dd
                data-testid={`exact-${label.en.toLowerCase()}`}
                className="min-w-0 break-words font-semibold"
              >
                {wholeRupees(amount)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3">
          {fill(T.asOfLine, lang, { when: instantWords(data.capturedAt, lang) || asOfDay })}
        </p>
        <p>{say(T.laterNot, lang)}</p>
      </MoreRow>
    </div>
  );
}

/** 40 x 28 mini: the ring with an arc about three-quarters round. */
export function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <circle
        cx="20"
        cy="14"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="5"
      />
      <circle
        cx="20"
        cy="14"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeDasharray={`${c * 0.72} ${c}`}
        transform="rotate(-90 20 14)"
      />
    </svg>
  );
}

// ── the contract ────────────────────────────────────────────────────────────

function headlineOf(data: CreditDodData, lang: Lang): string {
  const n = rupees(data.money.amount);
  const day = dayOf(data, data.money.date, lang);
  switch (data.verdict) {
    case 'overdue':
      return fill(T.headOverdue, lang, { n });
    case 'overdue_lag':
      return fill(T.headLag, lang, { n });
    case 'due_today':
      return fill(T.headToday, lang, { n });
    case 'due_soon':
    case 'due':
      return day ? fill(T.headDue, lang, { n, day }) : fill(T.headDueBare, lang, { n });
    case 'advance':
      return fill(T.headAdvance, lang, { n });
    case 'settled':
      return say(T.noDues, lang);
  }
}

function tile(sent: CreditDodData, lang: Lang): KindTile | null {
  const data = liveCredit(sent);
  const left = fill(T.tileLimitLeft, lang, { n: limitRupees(data.limit.available) });
  const lockedWord = isLocked(data) ? say(T.tileLocked, lang) : '';
  const join = (...parts: string[]): string => parts.filter(Boolean).join(' · ');
  const status = statusOf(data);
  const base = (value: string, sub: string): KindTile => ({ value, sub: sub || undefined, status });
  if (data.backdated) {
    return {
      value: data.verdict === 'settled' ? say(T.noDues, lang) : rupees(data.money.amount),
      sub: join(fill(T.tileAsOf, lang, { day: dayOf(data, data.asOf, lang) }), lockedWord),
      status: 'info',
    };
  }
  const day = dayOf(data, data.money.date, lang);
  switch (data.verdict) {
    case 'overdue': {
      const days = overdueDays(data, lang);
      return base(rupees(data.money.amount), join(days || say(T.tileOverdue, lang), lockedWord));
    }
    case 'overdue_lag':
      return base(rupees(data.money.amount), join(say(T.tileLag, lang), lockedWord));
    case 'due_today':
      return base(rupees(data.money.amount), join(say(T.tileToday, lang), lockedWord));
    case 'due_soon':
    case 'due':
      return base(
        rupees(data.money.amount),
        join(day ? fill(T.byDay, lang, { day }) : '', daysLeftText(data, lang), lockedWord),
      );
    case 'advance':
      return base(rupees(data.money.amount), join(say(T.tileAdvance, lang), lockedWord));
    case 'settled':
      return base(say(T.noDues, lang), join(left, lockedWord));
  }
}

function alert(sent: CreditDodData, lang: Lang): KindAlert | null {
  const data = liveCredit(sent);
  // An old position never raises an alarm on today's page.
  if (data.backdated) return null;
  const locked = isLocked(data);
  if (data.verdict === 'overdue') {
    return {
      headline: fill(T.headOverdue, lang, { n: rupees(data.money.amount) }),
      line: say(T.alertOverdueLine, lang) + (locked ? say(T.alertAlsoLocked, lang) : ''),
      severity: 'problem',
    };
  }
  if (data.verdict === 'overdue_lag') {
    return {
      headline: say(T.alertLagHead, lang),
      line: say(T.lagNote, lang),
      severity: 'attention',
    };
  }
  if (locked) {
    return { headline: say(T.lockHead, lang), line: say(T.lockBody, lang), severity: 'attention' };
  }
  return null;
}

function headline(data: CreditDodData, lang: Lang): string {
  return headlineOf(liveCredit(data), lang);
}

function share(sent: CreditDodData, lang: Lang): string {
  const data = liveCredit(sent);
  const lim = data.limit;
  const when = instantWords(data.capturedAt, lang) || dayOf(data, data.asOf, lang);
  const lockLine = isLocked(data) ? `${say(T.lockHead, lang)}. ${say(T.lockBody, lang)}` : '';
  const partOf =
    (data.verdict === 'overdue' || data.verdict === 'overdue_lag') &&
    data.money.dueAmount > 0 &&
    data.money.dueAmount < data.money.amount
      ? fill(T.partOfThis, lang, { n: rupees(data.money.dueAmount) })
      : '';
  return shareLines([
    say(T.shareTitle, lang),
    fill(T.shareAsOf, lang, { when }),
    data.backdated && fill(T.backdated, lang, { day: dayOf(data, data.asOf, lang) }),
    headlineOf(data, lang),
    data.verdict === 'overdue' && overdueDays(data, lang),
    partOf,
    lockLine,
    `${say(T.limit, lang)}: ${rupees(lim.current)}`,
    `${say(T.used, lang)}: ${rupees(lim.availed)}${lim.usedPct !== null ? ` (${num(Math.round(lim.usedPct))}%)` : ''}`,
    `${say(T.left, lang)}: ${rupees(lim.available)}`,
    lim.form && `${say(T.form, lang)}: ${lim.form}`,
    reviewLine(data, lang),
    say(T.shareFooter, lang),
  ]);
}

export const view: KindView<'credit_dod'> = {
  kind: 'credit_dod',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
};
