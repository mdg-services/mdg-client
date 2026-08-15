/**
 * The festival catalog and the window arithmetic that decides whether a band is
 * drawn today.
 *
 * Both live here, in shared, on purpose. The server decides whether to paint the
 * band onto a dealer's card; the admin screen tells the super-admin whether it
 * is painting one. Those two answers disagreeing — the screen reading LIVE while
 * cards go out plain — is the only way this feature can quietly fail, so there
 * is exactly one implementation of the rule.
 */
import type { FestivalDefinition, FestivalKey, FestivalWindow } from '../types/festival';

/**
 * The Ashoka Chakra: navy rim, hub, and 24 spokes. Built by loop rather than
 * written out as 24 hand-typed `<line>`s — the shape is defined by the count,
 * and a miscopied spoke is a defaced national symbol.
 */
const CHAKRA_SVG = ((): string => {
  const spokes = Array.from(
    { length: 24 },
    (_, i) => `<line x1="16" y1="16" x2="16" y2="3.4" transform="rotate(${i * 15} 16 16)"/>`,
  ).join('');
  return (
    `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">` +
    `<g stroke="#0a0a5c" stroke-width="1.1" fill="none">` +
    `<circle cx="16" cy="16" r="13.2" stroke-width="1.8"/>${spokes}</g>` +
    `<circle cx="16" cy="16" r="2.6" fill="#0a0a5c"/></svg>`
  );
})();

/** A lit diya — bowl, flame, and a small glow. */
const DIYA_SVG =
  `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">` +
  `<path d="M5 19h22c0 4.4-4.9 7-11 7S5 23.4 5 19z" fill="#b45309"/>` +
  `<path d="M5 19h22a11 3.2 0 0 0-22 0z" fill="#f59e0b"/>` +
  `<path d="M16 4c3.1 3.1 4.6 5.4 4.6 7.6a4.6 4.6 0 1 1-9.2 0C11.4 9.4 12.9 7.1 16 4z" fill="#f59e0b"/>` +
  `<path d="M16 8.2c1.6 1.8 2.4 3.2 2.4 4.4a2.4 2.4 0 1 1-4.8 0c0-1.2.8-2.6 2.4-4.4z" fill="#fde68a"/>` +
  `</svg>`;

/**
 * Every festival that can be switched on. Order is display order in the admin
 * picker. Adding one here is the whole job of supporting a new festival — the
 * renderer, the toggle, and the preview all read from this list.
 */
export const FESTIVAL_CATALOG: readonly FestivalDefinition[] = [
  {
    key: 'independence-day',
    label: 'Independence Day',
    labelHi: 'स्वतंत्रता दिवस',
    greetingHi: 'स्वतंत्रता दिवस की हार्दिक शुभकामनाएँ',
    greetingEn: 'Happy Independence Day',
    bandStyle: 'stripes',
    colors: ['#ff9933', '#ffffff', '#138808'],
    ink: '#0a0a5c',
    emblemSvg: CHAKRA_SVG,
    defaultDays: 3,
    observedOn: '08-15',
  },
  {
    key: 'republic-day',
    label: 'Republic Day',
    labelHi: 'गणतंत्र दिवस',
    greetingHi: 'गणतंत्र दिवस की हार्दिक शुभकामनाएँ',
    greetingEn: 'Happy Republic Day',
    bandStyle: 'stripes',
    colors: ['#ff9933', '#ffffff', '#138808'],
    ink: '#0a0a5c',
    emblemSvg: CHAKRA_SVG,
    defaultDays: 3,
    observedOn: '01-26',
  },
  {
    key: 'diwali',
    label: 'Diwali',
    labelHi: 'दीपावली',
    greetingHi: 'दीपावली की हार्दिक शुभकामनाएँ',
    greetingEn: 'Happy Diwali',
    bandStyle: 'gradient',
    colors: ['#f59e0b', '#fef3c7', '#d97706'],
    ink: '#7c2d12',
    emblemSvg: DIYA_SVG,
    defaultDays: 5,
    // Lunar — the date moves every year, so the admin types it in.
    observedOn: null,
  },
  {
    key: 'holi',
    label: 'Holi',
    labelHi: 'होली',
    greetingHi: 'होली की हार्दिक शुभकामनाएँ',
    greetingEn: 'Happy Holi',
    bandStyle: 'gradient',
    colors: ['#ec4899', '#fde68a', '#22c55e'],
    ink: '#7c2d12',
    emblemSvg: null,
    defaultDays: 2,
    observedOn: null,
  },
  {
    key: 'new-year',
    label: 'New Year',
    labelHi: 'नववर्ष',
    greetingHi: 'नववर्ष की हार्दिक शुभकामनाएँ',
    greetingEn: 'Happy New Year',
    bandStyle: 'gradient',
    colors: ['#0ea5e9', '#f8fafc', '#6366f1'],
    ink: '#0c4a6e',
    emblemSvg: null,
    defaultDays: 2,
    observedOn: '01-01',
  },
];

/** The catalog entry for a key, or null if the key is unknown (or stale). */
export function findFestival(key: string | null | undefined): FestivalDefinition | null {
  if (!key) return null;
  return FESTIVAL_CATALOG.find((f) => f.key === key) ?? null;
}

/** Type guard for a value that claims to be a catalog key. */
export function isFestivalKey(key: string): key is FestivalKey {
  return FESTIVAL_CATALOG.some((f) => f.key === key);
}

/**
 * Today's calendar date in IST as `YYYY-MM-DD`.
 *
 * Via `Intl`, not the `Date` getters: production runs in UTC, where `getDate()`
 * changes the day at 05:30 IST — a festival would switch on half a day early
 * and off half a day early with it.
 */
export function istDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** `YYYY-MM-DD` + n days, as `YYYY-MM-DD`. Returns '' for an unparseable date. */
export function addDays(date: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative if `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Resolve a setting into its window and whether it is live on `today`.
 *
 * The window is INCLUSIVE of both ends: `days: 1` starting on the 15th means the
 * band is drawn on the 15th and gone on the 16th. That is what "on for N days"
 * means to the person setting it, and getting it wrong by one is a greeting that
 * outlives the festival by a day.
 *
 * Nothing expires the row in the database — the window simply stops containing
 * today. There is no scheduled job to miss, and re-running the same festival
 * next year is a date change rather than a cleanup.
 */
export function festivalWindow(
  setting: { enabled: boolean; startDate: string; days: number },
  today: string = istDateKey(),
): FestivalWindow {
  const days = Math.max(1, Math.floor(setting.days));
  const endDate = addDays(setting.startDate, days - 1);
  const started = daysBetween(setting.startDate, today) >= 0;
  const ended = endDate === '' || daysBetween(endDate, today) > 0;
  const active = setting.enabled && started && !ended;
  // Counts today as one of the remaining days, and never reports a future
  // window as already running down.
  const daysLeft = active ? Math.max(0, daysBetween(today, endDate) + 1) : 0;
  return { startDate: setting.startDate, endDate, active, daysLeft };
}
