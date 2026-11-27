import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleHelp,
  HandCoins,
  Percent,
  Receipt,
  Repeat,
  Scissors,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { InsightRow } from '@/components/kit';
import { cn } from '@/lib/cn';
import { translate } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import { useLargeText } from '@/lib/useLargeText';
import type { Lang } from '@/store/lang';
import type { LedgerClass, LedgerWatchData } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import type { KindAlert, KindView, OverlayProps, Words } from '../types';

import {
  dayWords,
  fill,
  instantWords,
  leadingFor,
  rupees,
  say,
  shareLines,
} from './_fmtTankerMoney';
import { Lead } from './_partsTankerMoney';

/**
 * Ledger watch (ADR 0056), OWNERS ONLY: a passbook page. Warm paper with three binding
 * holes, ruled lines, a Date | What | Amount table with an arrow on every line, and a
 * dashed tear-off strip with the two totals. Nothing else in the app looks like a bank
 * passbook, so "passbook" means "other entries on my IndianOil account".
 *
 * Direction is an arrow and a word ("Charged" up-right, "Paid to you" down-left), never a
 * sign or a colour. An entry we do not recognise is neutral (a question mark and plain
 * words), not an error. The tone is calm: a passbook is paper, not an alarm. A page
 * is a frozen list: the shell says when a newer one exists.
 */

const T = {
  title: { hi: 'खाते की दूसरी एंट्री', hl: 'Khate ki dusri entry', en: 'Other ledger entries' },
  lead: {
    hi: 'आपके खाते में {n} एंट्री हैं जो न फ्यूल की हैं, न आपके जमा की।',
    hl: 'Aapke khate mein {n} entry hain jo na fuel ki hain, na aapke jama ki.',
    en: '{n} entries on your account that are not fuel and not your deposits.',
  },
  leadOne: {
    hi: 'आपके खाते में 1 एंट्री है जो न फ्यूल की है, न आपके जमा की।',
    hl: 'Aapke khate mein 1 entry hai jo na fuel ki hai, na aapke jama ki.',
    en: '1 entry on your account that is not fuel and not your deposit.',
  },
  period: { hi: 'अवधि', hl: 'Avadhi', en: 'Period' },
  fromTo: { hi: '{a} से {b}', hl: '{a} se {b}', en: '{a} to {b}' },
  onDay: { hi: '{a} को', hl: '{a} ko', en: 'on {a}' },
  truncWindow: {
    hi: 'सबसे नई {shown} एंट्री दिखा रहे हैं ({total} में से)। कुल रकम सभी {total} की है।',
    hl: 'Sabse nayi {shown} entry dikha rahe hain ({total} mein se). Kul rakam sabhi {total} ki hai.',
    en: 'Showing the {shown} newest of {total}. Totals cover all {total}.',
  },
  truncShown: {
    hi: 'सबसे नई {shown} एंट्री दिखा रहे हैं ({total} में से)। नीचे की रकम इन्हीं {shown} की है।',
    hl: 'Sabse nayi {shown} entry dikha rahe hain ({total} mein se). Neeche ki rakam inhi {shown} ki hai.',
    en: 'Showing the {shown} newest of {total}. The totals below are of these {shown}.',
  },
  colDate: { hi: 'तारीख', hl: 'Taareekh', en: 'Date' },
  colWhat: { hi: 'क्या था', hl: 'Kya tha', en: 'What it was' },
  colAmount: { hi: 'रकम', hl: 'Rakam', en: 'Amount' },
  charged: { hi: 'आपसे लिया गया', hl: 'Aapse liya gaya', en: 'Charged' },
  received: { hi: 'आपको मिला', hl: 'Aapko mila', en: 'Paid to you' },
  unknown: {
    hi: 'ऐसी एंट्री जो हम अभी नहीं जानते',
    hl: 'Aisi entry jo hum abhi nahi jaante',
    en: 'Entry we do not know yet',
  },
  weLook: { hi: 'हम देख रहे हैं', hl: 'Hum dekh rahe hain', en: 'We are looking into it' },
  alertWord: { hi: 'ध्यान दें', hl: 'Dhyan dein', en: 'Needs a look' },
  tearCharged: {
    hi: 'आपसे लिया गया (इन {n} में)',
    hl: 'Aapse liya gaya (in {n} mein)',
    en: 'Charged (of these {n})',
  },
  tearReceived: {
    hi: 'आपको मिला (इन {n} में)',
    hl: 'Aapko mila (in {n} mein)',
    en: 'Paid to you (of these {n})',
  },
  tearChargedWindow: {
    hi: 'आपसे लिया गया (सभी {n})',
    hl: 'Aapse liya gaya (sabhi {n})',
    en: 'Charged (all {n})',
  },
  tearReceivedWindow: {
    hi: 'आपको मिला (सभी {n})',
    hl: 'Aapko mila (sabhi {n})',
    en: 'Paid to you (all {n})',
  },
  notDod: {
    hi: 'यह आपके DOD जमा की रकम नहीं है।',
    hl: 'Yeh aapke DOD jama ki rakam nahi hai.',
    en: 'This is not your DOD deposit amount.',
  },
  readAt: {
    hi: 'IndianOil पोर्टल से पढ़ा: {when}',
    hl: 'IndianOil portal se padha: {when}',
    en: 'Read from the IndianOil portal: {when}',
  },
  // Alert / headline
  alertHead: {
    hi: 'आपके खाते में {n} और लेन-देन',
    hl: 'Aapke khate mein {n} aur len-den',
    en: '{n} more transactions on your account',
  },
  alertHeadOne: {
    hi: 'आपके खाते में 1 और लेन-देन',
    hl: 'Aapke khate mein 1 aur len-den',
    en: '1 more transaction on your account',
  },
  money: {
    hi: '{c} कटा, {r} जमा हुआ',
    hl: '{c} kata, {r} jama hua',
    en: '{c} charged, {r} paid to you',
  },
  headLine: {
    hi: '{n} और लेन-देन: {money}',
    hl: '{n} aur len-den: {money}',
    en: '{n} more transactions: {money}',
  },
  headLineOne: {
    hi: '1 और लेन-देन: {money}',
    hl: '1 aur len-den: {money}',
    en: '1 more transaction: {money}',
  },
  shareOutlet: { hi: 'आउटलेट {code}', hl: 'Outlet {code}', en: 'Outlet {code}' },
} satisfies Record<string, Words>;

// Fixed passbook colours: paper does not turn dark in dark mode.
const PAPER = '#fbf7ee';
const RULE = '#d9cfb8';
const INK = '#1c1917';
const INK_MUTED = '#57534e';

const CLASS_ICON: Record<LedgerClass, LucideIcon> = {
  INTEREST: Percent,
  FEE: Receipt,
  COMMISSION: HandCoins,
  RECOVERY: Repeat,
  REVERSAL: Undo2,
  UNCLASSIFIED: CircleHelp,
};

type Movement = LedgerWatchData['movements'][number];

function isUnrecognised(m: Movement): boolean {
  return m.class === 'UNCLASSIFIED' || m.flagKind === 'UNKNOWN_ENTRY';
}

function titleOf(m: Movement, lang: Lang): string {
  if (isUnrecognised(m)) return say(T.unknown, lang);
  const own = lang === 'hi' ? m.title.hi : m.title.en;
  return own || m.title.en || m.title.hi || say(T.unknown, lang);
}

function directionWords(d: Movement['direction']): Words {
  return d === 'CHARGED' ? T.charged : T.received;
}

function refYear(data: LedgerWatchData): number {
  return Number(data.generatedAt.slice(0, 4)) || new Date().getUTCFullYear();
}

function windowText(data: LedgerWatchData, lang: Lang): string {
  const w = data.window;
  if (!w) return '';
  const opts = { refYear: refYear(data) };
  const a = dayWords(w.from, lang, opts);
  const b = dayWords(w.to, lang, opts);
  if (!a || !b) return '';
  return w.from === w.to ? fill(T.onDay, lang, { a: b }) : fill(T.fromTo, lang, { a, b });
}

/** Whole rupees for a one-line summary; the ledger table keeps the paise. */
function wholeRupees(n: number): string {
  return `${n < 0 ? '−' : ''}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(Math.abs(n)))}`;
}

function moneyLine(data: LedgerWatchData, lang: Lang): string {
  return fill(T.money, lang, { c: wholeRupees(data.charged), r: wholeRupees(data.received) });
}

function countText(
  data: LedgerWatchData,
  lang: Lang,
  many: Words,
  one: Words,
  vars: Record<string, string> = {},
): string {
  return data.totalMovements === 1
    ? fill(one, lang, vars)
    : fill(many, lang, { n: String(data.totalMovements), ...vars });
}

// ── the page ────────────────────────────────────────────────────────────────

/** The left margin: three binding holes and a margin rule, so it reads as a page and not a table. */
function Margin({ narrow }: { narrow: boolean }): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn('relative shrink-0 border-r', narrow ? 'w-5' : 'w-7')}
      style={{ borderColor: '#e7b9b0' }}
    >
      {[14, 54, 94].map((top) => (
        <span
          key={top}
          className={cn('absolute h-3.5 w-3.5 rounded-full border', narrow ? 'left-0.5' : 'left-2')}
          style={{ top, backgroundColor: 'var(--wa-wallpaper)', borderColor: RULE }}
        />
      ))}
    </div>
  );
}

/**
 * At large text the three columns (date, what it was, amount) are wider than the page, and the
 * passbook clips what does not fit. Each row stacks instead: the date, what it was, then the amount.
 * `display: block` drops the table's meaning for a screen reader, so the roles are put back.
 */
const stack = (large: boolean, role: string): Record<string, string> => (large ? { role } : {});

function Row({
  m,
  data,
  lang,
  large,
}: {
  m: Movement;
  data: LedgerWatchData;
  lang: Lang;
  large: boolean;
}): ReactElement {
  const Icon = CLASS_ICON[m.class] ?? CircleHelp;
  const Arrow = m.direction === 'CHARGED' ? ArrowUpRight : ArrowDownLeft;
  const unknown = isUnrecognised(m);
  return (
    <tr
      data-testid="ledger-row"
      data-direction={m.direction}
      data-class={m.class}
      data-severity={m.severity}
      className={cn('border-t align-top', large && 'block py-3')}
      style={{ borderColor: RULE }}
      {...stack(large, 'row')}
    >
      <th
        scope="row"
        className={cn('text-left align-top text-cta', large ? 'block pb-1' : 'py-3 pr-2')}
        style={{ color: INK }}
        {...stack(large, 'rowheader')}
      >
        {dayWords(m.date, lang, { refYear: refYear(data) })}
      </th>
      <td className={large ? 'block pb-1' : 'py-3 pr-2'} {...stack(large, 'cell')}>
        <span className="flex items-start gap-2">
          {/* The picture is decoration (the words say what it was); at large text it would take a third of the line. */}
          {large ? null : (
            <Icon
              aria-hidden="true"
              className="mt-0.5 h-7 w-7 shrink-0"
              style={{ color: INK_MUTED }}
              strokeWidth={2}
            />
          )}
          <span className="min-w-0">
            <span
              className={cn('block break-words text-subheading', leadingFor(lang))}
              style={{ color: INK }}
            >
              {titleOf(m, lang)}
            </span>
            {unknown ? (
              <span
                className={cn('block text-body', leadingFor(lang))}
                style={{ color: INK_MUTED }}
              >
                {say(T.weLook, lang)}
              </span>
            ) : null}
            {m.severity === 'ALERT' ? (
              <span className="mt-1 block">
                <StatusBadge status="attention" lang={lang} word={say(T.alertWord, lang)} />
              </span>
            ) : null}
          </span>
        </span>
      </td>
      <td
        className={cn('align-top', large ? 'block' : 'py-3 text-right')}
        {...stack(large, 'cell')}
      >
        <span className="block break-words font-mono text-subheading" style={{ color: INK }}>
          {rupees(m.amount)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-subheading',
            !large && 'justify-end',
            leadingFor(lang),
          )}
          style={{ color: INK }}
        >
          <Arrow aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.6} />
          {say(directionWords(m.direction), lang)}
        </span>
      </td>
    </tr>
  );
}

export function Overlay({ data, lang }: OverlayProps<'ledger_watch'>): ReactElement {
  const large = useLargeText();
  const shown = data.movements.length;
  const truncated = data.totalMovements > shown;
  const win = windowText(data, lang);
  const windowScope = data.totalsScope === 'window';
  const nTear = windowScope ? data.totalMovements : shown;
  const read = instantWords(data.generatedAt, lang);
  const looks = data.movements.filter((m) => m.severity === 'ALERT').length;
  return (
    <div data-kind-view="ledger_watch" data-scope={data.totalsScope} className="space-y-4 p-4">
      <Lead lang={lang}>{countText(data, lang, T.lead, T.leadOne)}</Lead>
      {win ? (
        <p
          data-testid="ledger-window"
          className="rounded-lg bg-kind-ledger-soft px-3 py-2 text-subheading text-kind-ledger-ink"
        >
          <span className="sr-only">{say(T.period, lang)}: </span>
          {win}
        </p>
      ) : null}
      {truncated ? (
        <p
          data-testid="ledger-truncated"
          className={cn('text-body text-text-muted', leadingFor(lang))}
        >
          {fill(windowScope ? T.truncWindow : T.truncShown, lang, {
            shown: String(shown),
            total: String(data.totalMovements),
          })}
        </p>
      ) : null}

      {looks > 0 ? (
        <InsightRow
          status="attention"
          text={tnIn(lang, 'rv2.ledger.look', looks)}
          meta={translate(lang, 'rv2.ledger.lookMeta')}
        />
      ) : null}

      <div
        data-testid="passbook"
        className="flex overflow-hidden rounded-xl border shadow-sm"
        style={{ backgroundColor: PAPER, borderColor: RULE, color: INK }}
      >
        <Margin narrow={large} />
        <div className="min-w-0 flex-1 pr-3">
          <table
            className={cn('w-full table-auto border-collapse', large && 'block')}
            {...stack(large, 'table')}
          >
            <thead className={cn(large && 'sr-only')} {...stack(large, 'rowgroup')}>
              <tr
                className="text-left text-subheading"
                style={{ color: INK_MUTED }}
                {...stack(large, 'row')}
              >
                <th
                  scope="col"
                  className="py-2 pr-2 font-semibold"
                  {...stack(large, 'columnheader')}
                >
                  {say(T.colDate, lang)}
                </th>
                <th
                  scope="col"
                  className="py-2 pr-2 font-semibold"
                  {...stack(large, 'columnheader')}
                >
                  {say(T.colWhat, lang)}
                </th>
                <th
                  scope="col"
                  className="py-2 text-right font-semibold"
                  {...stack(large, 'columnheader')}
                >
                  {say(T.colAmount, lang)}
                </th>
              </tr>
            </thead>
            <tbody className={cn(large && 'block')} {...stack(large, 'rowgroup')}>
              {data.movements.map((m, i) => (
                <Row
                  key={`${m.date}-${m.amount}-${i}`}
                  m={m}
                  data={data}
                  lang={lang}
                  large={large}
                />
              ))}
            </tbody>
          </table>

          <div
            data-testid="tear-off"
            className="relative mt-3 border-t-2 border-dashed pb-3 pt-4"
            style={{ borderColor: INK_MUTED }}
          >
            <span
              aria-hidden="true"
              className="absolute -top-2.5 left-1 px-1"
              style={{ backgroundColor: PAPER, color: INK_MUTED }}
            >
              <Scissors className="h-4 w-4" />
            </span>
            <dl className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className={cn('text-subheading', leadingFor(lang))}>
                  {fill(windowScope ? T.tearChargedWindow : T.tearCharged, lang, {
                    n: String(nTear),
                  })}
                </dt>
                <dd data-testid="total-charged" className="font-mono text-heading">
                  {rupees(data.charged)}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className={cn('text-subheading', leadingFor(lang))}>
                  {fill(windowScope ? T.tearReceivedWindow : T.tearReceived, lang, {
                    n: String(nTear),
                  })}
                </dt>
                <dd data-testid="total-received" className="font-mono text-heading">
                  {rupees(data.received)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <p className={cn('text-subheading text-text', leadingFor(lang))}>{say(T.notDod, lang)}</p>
      {read ? (
        <p className={cn('text-body text-text-muted', leadingFor(lang))}>
          {fill(T.readAt, lang, { when: read })}
        </p>
      ) : null}
    </div>
  );
}

/** 40 x 28 mini: a ruled page with binding holes and an arrow out and an arrow in. */
export function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <rect
        x="6"
        y="2.5"
        width="28"
        height="23"
        rx="3"
        fill={PAPER}
        stroke="currentColor"
        strokeWidth="2"
      />
      {[7, 14, 21].map((cy) => (
        <circle key={cy} cx="10.5" cy={cy} r="1.3" fill="currentColor" />
      ))}
      <path
        d="M15 8 H30 M15 14 H30 M15 20 H30"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M22 11 L27 7.2 M24.2 7 H27.2 V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 21 L22 17.2 M24.8 17 H21.8 V20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function alert(data: LedgerWatchData, lang: Lang): KindAlert | null {
  // Only an entry graded ALERT is lifted onto Today, as a look and never an emergency.
  if (data.topSeverity !== 'ALERT') return null;
  return {
    headline: countText(data, lang, T.alertHead, T.alertHeadOne),
    line: `${moneyLine(data, lang)}.`,
    severity: 'attention',
  };
}

function headline(data: LedgerWatchData, lang: Lang): string {
  return countText(data, lang, T.headLine, T.headLineOne, { money: moneyLine(data, lang) });
}

function share(data: LedgerWatchData, lang: Lang): string {
  const win = windowText(data, lang);
  const read = instantWords(data.generatedAt, lang);
  return shareLines([
    say(T.title, lang),
    data.outletCode && fill(T.shareOutlet, lang, { code: data.outletCode }),
    win,
    ...data.movements.map((m) => {
      const day = dayWords(m.date, lang, { refYear: refYear(data) });
      return `${day}: ${titleOf(m, lang)}, ${rupees(m.amount)} (${say(directionWords(m.direction), lang)})`;
    }),
    data.totalMovements > data.movements.length &&
      fill(data.totalsScope === 'window' ? T.truncWindow : T.truncShown, lang, {
        shown: String(data.movements.length),
        total: String(data.totalMovements),
      }),
    moneyLine(data, lang),
    say(T.notDod, lang),
    read && fill(T.readAt, lang, { when: read }),
  ]);
}

export const view: KindView<'ledger_watch'> = {
  kind: 'ledger_watch',
  Overlay,
  Glyph,
  // A row in "Done for you", not a Today tile.
  tile: () => null,
  alert,
  headline,
  share,
};
