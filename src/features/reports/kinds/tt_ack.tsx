import { Check, Clock, EyeOff, Octagon, Phone, UserCheck } from 'lucide-react';
import type { ReactElement } from 'react';

import { cn } from '@/lib/cn';
import type { Lang } from '@/store/lang';
import type { TtAckData, TtAckRow } from '@dk/shared/types';

import type { KindAlert, KindView, OverlayProps, Words } from '../types';

import { dayWords, fill, fuelName, instantWords, leadingFor, litres, say, shareLines } from './_fmtTankerMoney';
import { FuelSwatch, IconNote, Lead } from './_partsTankerMoney';

/**
 * Tanker receipt (ADR 0056): a torn-edge receipt slip with a rubber RECEIVED stamp. When
 * litres are short the stamp turns into a boxed SHORT with the gap in litres.
 *
 * It reads as "paperwork done for you at the gate", not a chart. Honesty is load-bearing
 * and stays on screen whatever the outcome: the team entered this at the dealer's word,
 * MDG did not look at the vehicle and filed no claim, and any change goes through the
 * IndianOil sales officer. The shortage is settled once at send time (`none`, `short`,
 * `unknown`); an unreadable one says "see the portal", never a made-up figure.
 */

const T = {
  title: { hi: 'टैंकर रसीद', hl: 'Tanker receipt', en: 'Tanker receipt' },
  tanker: { hi: 'टैंकर', hl: 'Tanker', en: 'Tanker' },
  tankerNoNumber: { hi: 'टैंकर नंबर दर्ज नहीं', hl: 'Tanker number darj nahi', en: 'Tanker number not recorded' },
  leadOk: {
    hi: 'हमने IndianOil पोर्टल पर यह टैंकर आपके लिए "प्राप्त" दर्ज कर दिया है।',
    hl: 'Humne IndianOil portal par yeh tanker aapke liye "received" bhar diya hai.',
    en: "We marked this tanker as received on IndianOil's portal for you.",
  },
  leadShort: {
    hi: 'पोर्टल पर {n} कम दिख रहा है।',
    hl: 'Portal par {n} kam dikh raha hai.',
    en: 'The portal shows {n} short.',
  },
  leadShortNoFigure: {
    hi: 'पोर्टल पर इस टैंकर का माल कम दिख रहा है।',
    hl: 'Portal par is tanker ka maal kam dikh raha hai.',
    en: 'The portal shows this tanker came short.',
  },
  leadUnknown: {
    hi: 'हमने यह टैंकर "प्राप्त" दर्ज कर दिया है। पोर्टल की कमी का आँकड़ा हम पढ़ नहीं पाए, कृपया पोर्टल देखें।',
    hl: 'Humne yeh tanker "received" bhar diya hai. Portal ka shortage figure hum padh nahi paaye, portal dekh lein.',
    en: "We marked this tanker as received. We could not read the portal's shortage figure, so please check the portal.",
  },
  entered: { hi: 'दर्ज किया', hl: 'Darj kiya', en: 'Entered' },
  condition: { hi: 'दर्ज की गई हालत', hl: 'Darj ki gayi halat', en: 'Condition entered' },
  invoice: { hi: 'बिल', hl: 'Bill', en: 'Invoice' },
  noShort: { hi: 'कमी नहीं', hl: 'Kami nahi', en: 'No shortage' },
  short: { hi: 'कम {n}', hl: 'Kam {n}', en: 'Short {n}' },
  shortBare: { hi: 'कम', hl: 'Kam', en: 'Short' },
  seePortal: { hi: 'पोर्टल देखें', hl: 'Portal dekhein', en: 'See the portal' },
  unknownLine: {
    hi: 'पोर्टल की कमी का आँकड़ा हम पढ़ नहीं पाए। पोर्टल देखें।',
    hl: 'Portal ka shortage figure hum padh nahi paaye. Portal dekhein.',
    en: "We could not read the portal's shortage figure. Check the portal.",
  },
  perFuel: {
    hi: 'कुल कमी {total}, क्लेम की कमी {claim}',
    hl: 'Kul kami {total}, claim ki kami {claim}',
    en: 'total short {total}, claim short {claim}',
  },
  officerBox: {
    hi: 'अपने IndianOil सेल्स ऑफिसर से बात करें',
    hl: 'Apne IndianOil sales officer se baat karein',
    en: 'Speak to your IndianOil sales officer',
  },
  stampOk: { hi: 'प्राप्त', hl: 'RECEIVED', en: 'RECEIVED' },
  stampShort: { hi: 'कम {n}', hl: 'SHORT {n}', en: 'SHORT {n}' },
  stampShortBare: { hi: 'कम', hl: 'SHORT', en: 'SHORT' },
  stampOkSentence: {
    hi: 'प्राप्त: IndianOil पोर्टल पर टैंकर प्राप्त दर्ज हो गया',
    hl: 'Received: tanker IndianOil portal par received darj ho gaya',
    en: "Received: the tanker is marked as received on IndianOil's portal",
  },
  stampShortSentence: {
    hi: 'कम: पोर्टल पर माल कम दिख रहा है',
    hl: 'Short: portal par maal kam dikh raha hai',
    en: 'Short: the portal shows litres short',
  },
  note1: {
    hi: 'MDG की टीम ने यह आपके कहने पर दर्ज किया है।',
    hl: 'MDG ki team ne yeh aapke kehne par darj kiya hai.',
    en: "MDG's team entered this for you.",
  },
  note2: {
    hi: 'MDG ने गाड़ी नहीं देखी और कोई क्लेम फ़ाइल नहीं किया।',
    hl: 'MDG ne gaadi nahi dekhi aur koi claim file nahi kiya.',
    en: 'MDG did not inspect the vehicle and filed no claim.',
  },
  note3: {
    hi: 'किसी भी बदलाव के लिए IndianOil सेल्स ऑफिसर से बात करें।',
    hl: 'Kisi bhi badlav ke liye IndianOil sales officer se baat karein.',
    en: 'For any change, speak to your IndianOil sales officer.',
  },
  alertShortHead: {
    hi: 'टैंकर का माल {n} कम उतरा',
    hl: 'Tanker ka maal {n} kam utra',
    en: 'Tanker came short by {n}',
  },
  alertShortHeadBare: {
    hi: 'टैंकर का माल कम उतरा',
    hl: 'Tanker ka maal kam utra',
    en: 'Tanker came short',
  },
  alertShortLine: {
    hi: 'IndianOil सेल्स ऑफिसर से बात करें।',
    hl: 'IndianOil sales officer se baat karein.',
    en: 'Speak to your IndianOil sales officer.',
  },
  alertUnknownHead: {
    hi: 'टैंकर की रसीद: पोर्टल पर कमी देखें',
    hl: 'Tanker receipt: portal par kami dekhein',
    en: 'Tanker receipt: check the shortage on the portal',
  },
  alertUnknownLine: {
    hi: 'कमी का आँकड़ा हम पढ़ नहीं पाए। हम भी देख रहे हैं।',
    hl: 'Kami ka figure hum padh nahi paaye. Hum bhi dekh rahe hain.',
    en: 'We could not read the shortage figure. We are looking too.',
  },
  headOk: {
    hi: 'टैंकर {v}: प्राप्त दर्ज, कमी नहीं',
    hl: 'Tanker {v}: received darj, kami nahi',
    en: 'Tanker {v}: received, no shortage',
  },
  headShort: {
    hi: 'टैंकर {v}: {n} कम',
    hl: 'Tanker {v}: {n} kam',
    en: 'Tanker {v}: {n} short',
  },
  headUnknown: {
    hi: 'टैंकर {v}: पोर्टल पर कमी देखें',
    hl: 'Tanker {v}: portal par kami dekhein',
    en: 'Tanker {v}: check the portal for shortage',
  },
  shareTitle: {
    hi: 'टैंकर रसीद (IndianOil पोर्टल पर दर्ज)',
    hl: 'Tanker receipt (IndianOil portal par darj)',
    en: 'Tanker receipt (acknowledged on the IndianOil portal)',
  },
  shareHonest: {
    hi: 'MDG की टीम ने यह डीलर के कहने पर दर्ज किया। MDG ने गाड़ी नहीं देखी और कोई क्लेम फ़ाइल नहीं किया।',
    hl: 'MDG ki team ne yeh dealer ke kehne par darj kiya. MDG ne gaadi nahi dekhi aur koi claim file nahi kiya.',
    en: "MDG's team entered this at the dealer's word. MDG did not inspect the vehicle and filed no claim.",
  },
} satisfies Record<string, Words>;

/**
 * The litres short on one row, as the portal's card says it: the row's total when it is above
 * zero, else the claim figure (a row can read "total short 0 L, claim short 35 L"), else what its
 * fuels add up to (total first, then claim), else unknown. A zero is never a figure: a short row
 * that reads 0 would print "Short" with no litres.
 */
export function rowShortLitres(row: TtAckRow): number | null {
  if (typeof row.totalShortL === 'number' && row.totalShortL > 0) return row.totalShortL;
  if (typeof row.claimShortL === 'number' && row.claimShortL > 0) return row.claimShortL;
  const total = row.products.reduce((a, p) => a + (p.totalShortL || 0), 0);
  if (total > 0) return total;
  const claim = row.products.reduce((a, p) => a + (p.claimShortL || 0), 0);
  return claim > 0 ? claim : null;
}

export interface TtAckSummary {
  shortRows: TtAckRow[];
  unknownRows: TtAckRow[];
  /** Litres short across rows that say so; 0 when none or when no figure read. */
  totalShortL: number;
  outcome: 'ok' | 'short' | 'unknown';
}

/** What the whole receipt says: short wins, then an unreadable shortage, then a clean receipt. */
export function summarise(data: TtAckData): TtAckSummary {
  const shortRows = data.rows.filter((r) => r.short === 'short');
  const unknownRows = data.rows.filter((r) => r.short === 'unknown');
  const totalShortL = shortRows.reduce((a, r) => a + (rowShortLitres(r) ?? 0), 0);
  const outcome = shortRows.length > 0 ? 'short' : unknownRows.length > 0 ? 'unknown' : 'ok';
  return { shortRows, unknownRows, totalShortL, outcome };
}

function vehicleOf(data: TtAckData): string {
  return (data.vehicleNo ?? '').trim();
}

function RowOutcome({ row, lang }: { row: TtAckRow; lang: Lang }): ReactElement {
  if (row.short === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5 text-subheading" style={{ color: '#166534' }}>
        <Check aria-hidden="true" className="h-5 w-5 shrink-0" />
        {say(T.noShort, lang)}
      </span>
    );
  }
  if (row.short === 'short') {
    const n = rowShortLitres(row);
    return (
      <span className="inline-flex items-center gap-1.5 text-subheading" style={{ color: '#b91c1c' }}>
        <Octagon aria-hidden="true" className="h-5 w-5 shrink-0" />
        {n && n > 0 ? fill(T.short, lang, { n: litres(n) }) : say(T.shortBare, lang)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-subheading" style={{ color: '#1d4ed8' }}>
      <Clock aria-hidden="true" className="h-5 w-5 shrink-0" />
      {say(T.seePortal, lang)}
    </span>
  );
}

function InvoiceRow({ row, lang }: { row: TtAckRow; lang: Lang }): ReactElement {
  const shortProducts = row.short === 'short' ? row.products.filter((p) => p.totalShortL > 0 || p.claimShortL > 0) : [];
  return (
    <li data-testid="slip-row" data-short={row.short} className="border-t border-dashed py-3" style={{ borderColor: '#a8a29e' }}>
      <p className="flex flex-wrap items-baseline gap-x-2 text-body" style={{ color: '#18181b' }}>
        <span style={{ color: '#57534e' }}>{say(T.invoice, lang)}</span>
        <span className="select-all break-all font-mono font-semibold">{row.invoiceNo}</span>
        <span style={{ color: '#57534e' }}>{dayWords(row.invoiceDate, lang)}</span>
      </p>
      {row.products.length > 0 ? (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {row.products.map((p, i) => (
            <FuelSwatch key={`${p.code}-${i}`} productKey={p.code} />
          ))}
        </p>
      ) : null}
      <p className="mt-1.5">
        <RowOutcome row={row} lang={lang} />
      </p>
      {shortProducts.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-body" style={{ color: '#18181b' }}>
          {shortProducts.map((p, i) => (
            <li key={`${p.code}-${i}`} className={leadingFor(lang)}>
              {fuelName(p.code, lang) || p.code}
              {fuelName(p.code, lang) && fuelName(p.code, lang) !== p.code ? ` (${p.code})` : ''}:{' '}
              {fill(T.perFuel, lang, { total: litres(p.totalShortL), claim: litres(p.claimShortL) })}
            </li>
          ))}
        </ul>
      ) : null}
      {row.short === 'unknown' ? (
        <p className={cn('mt-1 text-body', leadingFor(lang))} style={{ color: '#18181b' }}>
          {say(T.unknownLine, lang)}
        </p>
      ) : null}
    </li>
  );
}

const SLIP_PAPER = '#ffffff';
const SLIP_EDGE = '#a8a29e';
const STAMP_OK = '#155e75';
const STAMP_SHORT = '#b91c1c';

/** The zig-zag bottom edge of the slip: 24 teeth that stretch to the slip's width. */
function TornEdge(): ReactElement {
  const teeth = 24;
  const points = ['0,0', ...Array.from({ length: teeth }, (_, i) => `${((i + 0.5) * 100) / teeth},8 ${((i + 1) * 100) / teeth},0`), '100,0'].join(' ');
  return (
    <svg aria-hidden="true" focusable="false" className="block w-full" height="10" viewBox="0 0 100 8" preserveAspectRatio="none">
      <polygon points={points} fill={SLIP_PAPER} stroke={SLIP_EDGE} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stamp({ summary, lang }: { summary: TtAckSummary; lang: Lang }): ReactElement {
  const isShort = summary.outcome === 'short';
  const color = isShort ? STAMP_SHORT : STAMP_OK;
  const text = isShort
    ? summary.totalShortL > 0
      ? fill(T.stampShort, lang, { n: litres(summary.totalShortL) })
      : say(T.stampShortBare, lang)
    : say(T.stampOk, lang);
  const sentence = say(isShort ? T.stampShortSentence : T.stampOkSentence, lang);
  const Icon = isShort ? Octagon : Check;
  return (
    <div
      data-testid="slip-stamp"
      data-stamp={isShort ? 'short' : 'received'}
      role="img"
      aria-label={isShort && summary.totalShortL > 0 ? `${sentence}: ${litres(summary.totalShortL)}` : sentence}
      className="ml-auto flex w-fit max-w-full -rotate-6 items-center gap-2 rounded-lg border-[3px] px-3 py-2"
      style={{ borderColor: color, color, backgroundColor: 'rgba(255,255,255,0.9)' }}
    >
      <Icon aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={3} />
      <span aria-hidden="true" className="break-words text-body font-black uppercase leading-tight tracking-wider">
        {text}
      </span>
    </div>
  );
}

export function Overlay({ data, lang }: OverlayProps<'tt_ack'>): ReactElement {
  const summary = summarise(data);
  const v = vehicleOf(data);
  const lead =
    summary.outcome === 'short'
      ? summary.totalShortL > 0
        ? fill(T.leadShort, lang, { n: litres(summary.totalShortL) })
        : say(T.leadShortNoFigure, lang)
      : summary.outcome === 'unknown'
        ? say(T.leadUnknown, lang)
        : say(T.leadOk, lang);
  const entered = instantWords(data.ackedAt, lang);
  return (
    <div data-kind-view="tt_ack" data-outcome={summary.outcome} className="space-y-4 p-4">
      <Lead lang={lang}>{lead}</Lead>

      <div className="overflow-hidden rounded-xl bg-kind-tanker-soft px-3 pb-5 pt-4">
        <div className="mx-auto w-full max-w-[320px]">
          <div
            data-testid="slip"
            className="border-x border-t px-4 pb-4 pt-3"
            style={{ backgroundColor: SLIP_PAPER, borderColor: SLIP_EDGE, color: '#18181b' }}
          >
            <p className="border-b-2 border-dashed pb-2 text-body" style={{ borderColor: SLIP_EDGE }}>
              <span style={{ color: '#57534e' }}>{say(T.tanker, lang)} </span>
              {v ? (
                <span className="select-all break-all font-mono text-subheading">{v}</span>
              ) : (
                <span className="font-semibold">{say(T.tankerNoNumber, lang)}</span>
              )}
            </p>
            <p className={cn('mt-2 text-body', leadingFor(lang))}>
              <span style={{ color: '#57534e' }}>{say(T.condition, lang)}: </span>
              <span className="font-mono font-semibold">{data.condition}</span>
            </p>
            {entered ? (
              <p className={cn('text-body', leadingFor(lang))}>
                <span style={{ color: '#57534e' }}>{say(T.entered, lang)}: </span>
                {entered}
              </p>
            ) : null}
            {data.rows.length > 0 ? (
              <ul className="mt-2" aria-label={say(T.invoice, lang)}>
                {data.rows.map((row, i) => (
                  <InvoiceRow key={`${row.invoiceNo}-${i}`} row={row} lang={lang} />
                ))}
              </ul>
            ) : null}
            <div className="mt-3">
              <Stamp summary={summary} lang={lang} />
            </div>
          </div>
          <TornEdge />
        </div>
      </div>

      {summary.outcome === 'short' ? (
        <div
          data-testid="officer-box"
          className="flex items-start gap-3 rounded-xl border bg-surface px-4 py-3"
          style={{ borderColor: STAMP_SHORT }}
        >
          <Octagon aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0" style={{ color: STAMP_SHORT }} />
          <p className={cn('text-subheading text-text', leadingFor(lang))}>{say(T.officerBox, lang)}</p>
        </div>
      ) : null}

      <ul data-testid="honest-notes" className="space-y-3 rounded-xl border border-border bg-surface px-4 py-3">
        <IconNote lang={lang} icon={<UserCheck className="h-5 w-5" />}>
          {say(T.note1, lang)}
        </IconNote>
        <IconNote lang={lang} icon={<EyeOff className="h-5 w-5" />}>
          {say(T.note2, lang)}
        </IconNote>
        <IconNote lang={lang} icon={<Phone className="h-5 w-5" />}>
          {say(T.note3, lang)}
        </IconNote>
      </ul>
    </div>
  );
}

/** 40 x 28 mini: a slip with a zig-zag bottom and a tick (an octagon for the short version is the alert's job). */
export function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <path
        d="M9 3 H31 V23 L28.5 25.5 L26 23 L23.5 25.5 L21 23 L18.5 25.5 L16 23 L13.5 25.5 L11 23 L9 25 Z"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12.5 8 H27.5 M12.5 12 H24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 17.5 L17 20.2 L23 14" fill="none" stroke={STAMP_OK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function alert(data: TtAckData, lang: Lang): KindAlert | null {
  const s = summarise(data);
  if (s.outcome === 'short') {
    return {
      headline: s.totalShortL > 0 ? fill(T.alertShortHead, lang, { n: litres(s.totalShortL) }) : say(T.alertShortHeadBare, lang),
      line: say(T.alertShortLine, lang),
      severity: 'problem',
    };
  }
  // The tag says "needs a look" while no figure could be read: the dealer is told to check the portal.
  if (s.outcome === 'unknown' && data.anyShort) {
    return { headline: say(T.alertUnknownHead, lang), line: say(T.alertUnknownLine, lang), severity: 'attention' };
  }
  return null;
}

function headline(data: TtAckData, lang: Lang): string {
  const s = summarise(data);
  const v = vehicleOf(data) || say(T.tankerNoNumber, lang);
  if (s.outcome === 'short') {
    return s.totalShortL > 0 ? fill(T.headShort, lang, { v, n: litres(s.totalShortL) }) : `${say(T.title, lang)}: ${say(T.shortBare, lang)}`;
  }
  return fill(s.outcome === 'unknown' ? T.headUnknown : T.headOk, lang, { v });
}

function share(data: TtAckData, lang: Lang): string {
  const v = vehicleOf(data);
  const entered = instantWords(data.ackedAt, lang);
  return shareLines([
    say(T.shareTitle, lang),
    v && `${say(T.tanker, lang)}: ${v}`,
    entered && `${say(T.entered, lang)}: ${entered}`,
    data.condition && `${say(T.condition, lang)}: ${data.condition}`,
    ...data.rows.flatMap((row) => {
      const day = dayWords(row.invoiceDate, lang);
      const head = `${say(T.invoice, lang)} ${row.invoiceNo}${day ? ` (${day})` : ''}: `;
      if (row.short === 'none') return [head + say(T.noShort, lang)];
      if (row.short === 'unknown') return [head + say(T.seePortal, lang)];
      const n = rowShortLitres(row);
      const per = row.products
        .filter((p) => p.totalShortL > 0 || p.claimShortL > 0)
        .map(
          (p) =>
            `${fuelName(p.code, lang) || p.code} (${p.code}): ${fill(T.perFuel, lang, { total: litres(p.totalShortL), claim: litres(p.claimShortL) })}`,
        );
      return [head + (n && n > 0 ? fill(T.short, lang, { n: litres(n) }) : say(T.shortBare, lang)), ...per];
    }),
    say(T.shareHonest, lang),
  ]);
}

export const view: KindView<'tt_ack'> = {
  kind: 'tt_ack',
  Overlay,
  Glyph,
  // A receipt is "done for you", not a tile.
  tile: () => null,
  alert,
  headline,
  share,
};
