import { useId, type ReactElement } from 'react';

import type { Lang } from '@/store/lang';
import type { DsrVariationBlock, DsrVariationData } from '@dk/shared/types';
import { CONSEQUENCE, GUIDELINE_REF } from '@dk/shared';

import { StatusBadge } from '../StatusBadge';
import { sayWords, type KindAlert, type KindTile, type KindView, type OverlayProps, type ReportStatusKey, type Words } from '../types';
import { SalesSheet, salesShareLines, type SalesProduct } from './dsr_sales';
import {
  dayWords,
  fuelLetters,
  fuelName,
  indian,
  joinList,
  litres,
  pct,
  signed,
  signedLitres,
} from './dsr_sales/fmt';
import { Callout, FuelBand, Lead, More } from './dsr_sales/ui';

/**
 * Stock variation, ADR 0056 §2: the zero-centred balance bar with an arrow pointer. A green
 * zone runs from the shortage edge to the excess edge; the pointer sits left of zero when
 * the stock is short (a down arrow, a triangle badge, the word "Short") and right of zero
 * when it is over (an up arrow, an octagon badge, the word "Over"). The two ways of being
 * wrong are different SHAPES and different WORDS because they cost different things: short
 * means an explanation will be asked, over can stop sales at once.
 *
 * The what-to-do box and the MDG guideline consequence appear only when the fuel is out of
 * the limit. Every litre is the same rounded integer the old picture and the AI reply print.
 */

// ── words ───────────────────────────────────────────────────────────────────

type Tone = DsrVariationBlock['tone'];

const W = {
  short: { hi: 'कम', hl: 'Kam', en: 'Short' },
  over: { hi: 'ज़्यादा', hl: 'Zyada', en: 'Over' },
  within: { hi: 'सीमा के अंदर', hl: 'Seema ke andar', en: 'Within limit' },
  allFine: { hi: 'सब ठीक', hl: 'Sab theek', en: 'All fine' },
  notCounted: { hi: 'अभी गिनती नहीं', hl: 'Abhi ginti nahi', en: 'Not counted yet' },
  countingStarts: {
    hi: 'इंस्पेक्शन के बाद से गिनती शुरू होगी',
    hl: 'Inspection ke baad se ginti shuru hogi',
    en: 'Counting starts after the inspection',
  },
  beforeInspection: {
    hi: 'यह दिन पहली इंस्पेक्शन से पहले का है, इसलिए स्टॉक फ़र्क का हिसाब नहीं बनता। आँकड़े सिर्फ़ जानकारी के लिए हैं।',
    hl: 'Yeh din pehli inspection se pehle ka hai, isliye stock farak ka hisaab nahi banta. Aankde sirf jaankari ke liye hain.',
    en: 'This day is before the first inspection, so there is no stock variation to judge. The figures are for information.',
  },
  consequenceShort: {
    hi: 'आपसे लिखित स्पष्टीकरण माँगा जा सकता है',
    hl: 'Aapse likhit jawab maanga ja sakta hai',
    en: 'You may be asked to explain',
  },
  consequenceOver: {
    hi: 'बिक्री रोकी जा सकती है',
    hl: 'Bikri roki ja sakti hai',
    en: 'Sales can be stopped',
  },
  rowVariation: { hi: 'स्टॉक का फ़र्क', hl: 'Stock ka farak', en: 'Variation' },
  rowPermissible: { hi: 'मान्य सीमा', hl: 'Maanya seema', en: 'Permissible variation' },
  rowBeyond: { hi: 'सीमा से बाहर', hl: 'Seema se bahar', en: 'Beyond the limit' },
  leakOnlyShort: {
    hi: 'वाष्पन की छूट सिर्फ़ कमी पर मिलती है।',
    hl: 'Evaporation ki chhoot sirf kami par milti hai.',
    en: 'The evaporation allowance counts only when stock is short.',
  },
  whatToDo: { hi: 'क्या करना है', hl: 'Kya karna hai', en: 'What to do' },
  moreLabel: { hi: 'और देखें', hl: 'Aur dekhein', en: 'More details' },
  how: { hi: 'हमने यह कैसे निकाला', hl: 'Humne yeh kaise nikala', en: 'How we worked this out' },
  howMeter: { hi: 'मीटर से बिक्री', hl: 'Meter se bikri', en: 'Meter sales' },
  howAfterTesting: { hi: 'टेस्टिंग घटाकर बिक्री', hl: 'Testing ghatakar bikri', en: 'Sales after testing' },
  howTotalStock: { hi: 'कुल स्टॉक (बही)', hl: 'Kul stock (bahi)', en: 'Total stock (book)' },
  howDipStock: { hi: 'डिप से स्टॉक', hl: 'Dip se stock', en: 'Stock by dip' },
  howDipSales: { hi: 'डिप से बिक्री', hl: 'Dip se bikri', en: 'Sales by dip' },
  revised: { hi: 'यह सुधारी हुई कॉपी है।', hl: 'Yeh sudhari hui copy hai.', en: 'This is a corrected copy.' },
  salesHeading: { hi: 'रोज़ की बिक्री शीट', hl: 'Roz ki bikri sheet', en: 'Daily sales sheet' },
  guidelineLabel: {
    hi: `MDG दिशा-निर्देश ${GUIDELINE_REF}`,
    hl: `MDG guideline ${GUIDELINE_REF}`,
    en: `MDG guideline ${GUIDELINE_REF}`,
  },
} satisfies Record<string, Words>;

/**
 * What the MDG guideline does about a variation outside the limit, in the reader's language.
 * Hindi and English are the shared sentences; the Hinglish one lives here (it used to sit
 * only inside the card builder).
 */
export const CONSEQUENCE_WORDS: Record<'low' | 'high', Words> = {
  low: {
    hi: CONSEQUENCE.LOW.hi,
    hl: 'Seema se zyada (−) variation par sample jaanch ke liye bheja jaata hai aur dealer se likhit jawab maanga jaata hai; jawab theek na hone par supply rok di jaati hai.',
    en: CONSEQUENCE.LOW.en,
  },
  high: {
    hi: CONSEQUENCE.HIGH.hi,
    hl: 'Seema se zyada (+) variation par sample lab bheja jaata hai aur sabhi products ki bikri aur supply turant rok di jaati hai.',
    en: CONSEQUENCE.HIGH.en,
  },
};

function t(w: Words, lang: Lang): string {
  return sayWords(w, lang);
}

// ── pure helpers ────────────────────────────────────────────────────────────

type VarProduct = DsrVariationData['products'][number];

/** The fuels that carry a variation figure (a fuel with none is not drawn). */
function withVariation(data: DsrVariationData): Array<VarProduct & { variation: DsrVariationBlock }> {
  return data.products.filter((p): p is VarProduct & { variation: DsrVariationBlock } => !!p.variation);
}

/** The tone the card follows: the snapshot's own word, never re-derived from the sign. */
function toneOf(v: DsrVariationBlock): Tone {
  return v.tone;
}

/** Over before short before fine; within a side the larger miss first. */
function worstFirst(data: DsrVariationData): Array<VarProduct & { variation: DsrVariationBlock }> {
  const rank: Record<Tone, number> = { high: 0, low: 1, ok: 2 };
  return withVariation(data)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ra = rank[toneOf(a.p.variation)] - rank[toneOf(b.p.variation)];
      if (ra !== 0) return ra;
      const da = Math.abs(b.p.variation.offL) - Math.abs(a.p.variation.offL);
      return da !== 0 ? da : a.i - b.i;
    })
    .map((x) => x.p);
}

function outOf(data: DsrVariationData): Array<VarProduct & { variation: DsrVariationBlock }> {
  return worstFirst(data).filter((p) => toneOf(p.variation) !== 'ok');
}

/** "Allowed −420 to +310 L". */
function allowedRange(v: DsrVariationBlock, lang: Lang): string {
  const range = `${signed(v.lowEdgeL)} ${lang === 'en' ? 'to' : lang === 'hi' ? 'से' : 'se'} ${signed(v.highEdgeL)} L`;
  return lang === 'hi' ? `मान्य ${range}` : lang === 'hl' ? `Maanya ${range}` : `Allowed ${range}`;
}

function summarySentence(data: DsrVariationData, lang: Lang): string {
  if (data.beforeInspection) return t(W.beforeInspection, lang);
  const all = withVariation(data);
  if (all.length === 0) return '';
  const out = outOf(data);
  const fine = all.filter((p) => toneOf(p.variation) === 'ok');
  if (out.length === 0) {
    if (all.length === 1) {
      const f = fuelName(all[0]!.key, lang);
      return lang === 'hi' ? `${f} सीमा के अंदर है।` : lang === 'hl' ? `${f} seema ke andar hai.` : `${f} is within the limit.`;
    }
    return lang === 'hi' ? 'सभी ईंधन सीमा के अंदर हैं।' : lang === 'hl' ? 'Sabhi fuel seema ke andar hain.' : 'All fuels are within the limit.';
  }
  const parts = out.map((p) => {
    const f = fuelName(p.key, lang);
    const over = toneOf(p.variation) === 'high';
    if (lang === 'hi') return `${f} ${over ? 'ज़्यादा' : 'कम'} है।`;
    if (lang === 'hl') return `${f} ${over ? 'zyada' : 'kam'} hai.`;
    return `${f} is ${over ? 'over' : 'short'}.`;
  });
  if (fine.length > 0) {
    const names = joinList(fine.map((p) => fuelName(p.key, lang)), lang);
    parts.push(lang === 'hi' ? `${names} ठीक ${fine.length > 1 ? 'हैं' : 'है'}।` : lang === 'hl' ? `${names} theek ${fine.length > 1 ? 'hain' : 'hai'}.` : `${names} ${fine.length > 1 ? 'are' : 'is'} fine.`);
  }
  return parts.join(' ');
}

/** The pointer's position written as words: "310 L short of zero". */
export function positionWords(v: DsrVariationBlock, lang: Lang): string {
  const n = Math.abs(Math.round(v.variationL));
  const low = Math.abs(Math.round(v.lowEdgeL));
  const high = Math.round(v.highEdgeL);
  const where =
    v.variationL === 0 || n === 0
      ? lang === 'hi'
        ? 'ठीक शून्य पर'
        : lang === 'hl'
          ? 'Theek zero par'
          : 'Exactly at zero'
      : v.variationL < 0
        ? lang === 'hi'
          ? `शून्य से ${indian(n)} L कम`
          : lang === 'hl'
            ? `Zero se ${indian(n)} L kam`
            : `${indian(n)} L short of zero`
        : lang === 'hi'
          ? `शून्य से ${indian(n)} L ज़्यादा`
          : lang === 'hl'
            ? `Zero se ${indian(n)} L zyada`
            : `${indian(n)} L over zero`;
  const range =
    lang === 'hi'
      ? `मान्य सीमा: ${indian(low)} L कम से ${indian(high)} L ज़्यादा तक।`
      : lang === 'hl'
        ? `Maanya seema: ${indian(low)} L kam se ${indian(high)} L zyada tak.`
        : `Allowed range: from ${indian(low)} L short to ${indian(high)} L over.`;
  return `${where}. ${range}`;
}

/**
 * A stock beyond the limit is a problem whichever way it goes: a shortage is as red as an excess
 * (amber is for "pending", never for how serious something is). The two are told apart by the
 * word (Short / Over), the arrow's direction and the sentence under it, never by colour alone.
 */
function statusOf(tone: Tone): ReportStatusKey {
  return tone === 'ok' ? 'ok' : 'problem';
}

// ── drawing ─────────────────────────────────────────────────────────────────

/** The balance bar. Real numbers are in the text under it; the drawing adds the shape. */
function BalanceBar({ v, label, lang }: { v: DsrVariationBlock; label: string; lang: Lang }): ReactElement {
  const uid = useId().replace(/:/g, '');
  const Wd = 328;
  const padX = 22;
  const zeroX = Wd / 2;
  const barY = 38;
  const barH = 22;
  const reach = Math.max(Math.abs(v.lowEdgeL), v.highEdgeL, Math.abs(v.variationL), 1) * 1.15;
  const scale = (zeroX - padX) / reach;
  const x = (l: number): number => zeroX + l * scale;
  const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
  const tone = toneOf(v);
  const px = clamp(x(v.variationL), padX, Wd - padX);
  const zoneL = x(v.lowEdgeL);
  const zoneR = x(v.highEdgeL);
  const edgeLabels: Array<{ at: number; text: string }> = [];
  const zeroLabelOk = Math.abs(zoneL - zeroX) >= 32 && Math.abs(zoneR - zeroX) >= 32;
  edgeLabels.push({ at: zoneL, text: signed(v.lowEdgeL) });
  if (Math.abs(zoneR - zoneL) >= 28) edgeLabels.push({ at: zoneR, text: signed(v.highEdgeL) });
  const title = `${label}. ${positionWords(v, lang)}`;
  const numberText = `${signed(v.variationL)} L`;
  const numberY = tone === 'low' ? 12 : barY - 8;
  const triBase = barY + barH;
  return (
    <svg viewBox={`0 0 ${Wd} 100`} className="block h-auto w-full" role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <pattern id={`${uid}h`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" style={{ fill: 'var(--color-surface-2)' }} />
          <line x1="0" y1="0" x2="0" y2="8" style={{ stroke: 'var(--color-border-strong)' }} strokeWidth="2" />
        </pattern>
      </defs>
      {/* the bar; the hatching beyond the zone says "outside the limit" without any colour */}
      <rect x={padX} y={barY} width={Wd - 2 * padX} height={barH} rx="4" fill={`url(#${uid}h)`} style={{ stroke: 'var(--color-border-strong)' }} strokeWidth="2" />
      {/* the permitted zone: shortage edge to excess edge */}
      <rect
        x={Math.min(zoneL, zoneR)}
        y={barY}
        width={Math.max(Math.abs(zoneR - zoneL), 2)}
        height={barH}
        style={{ fill: 'var(--status-ok-soft)', stroke: 'var(--status-ok)' }}
        strokeWidth="2.5"
      />
      {/* edge ticks and zero tick */}
      <line x1={zoneL} y1={barY} x2={zoneL} y2={triBase + 8} style={{ stroke: 'var(--status-ok)' }} strokeWidth="2.5" />
      <line x1={zoneR} y1={barY} x2={zoneR} y2={triBase + 8} style={{ stroke: 'var(--status-ok)' }} strokeWidth="2.5" />
      <line x1={zeroX} y1={barY - 4} x2={zeroX} y2={triBase + 4} style={{ stroke: 'var(--color-text)' }} strokeWidth="2.5" />
      {edgeLabels.map((e, i) => (
        <text
          key={i}
          x={clamp(e.at, 18, Wd - 18)}
          y="94"
          fontSize="13"
          fontWeight="700"
          textAnchor="middle"
          style={{ fill: 'var(--color-text)' }}
        >
          {e.text}
        </text>
      ))}
      {zeroLabelOk ? (
        <text x={zeroX} y="94" fontSize="13" fontWeight="700" textAnchor="middle" style={{ fill: 'var(--color-text)' }}>
          0
        </text>
      ) : null}
      {/* the pointer */}
      {tone === 'low' ? (
        // Short: a triangle above the bar pointing down.
        <polygon
          points={`${px - 13},${barY - 24} ${px + 13},${barY - 24} ${px},${barY - 2}`}
          style={{ fill: 'var(--status-problem)', stroke: 'var(--color-surface)' }}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : tone === 'high' ? (
        // Over: a triangle below the bar pointing up.
        <polygon
          points={`${px},${triBase + 2} ${px - 13},${triBase + 24} ${px + 13},${triBase + 24}`}
          style={{ fill: 'var(--status-problem)', stroke: 'var(--color-surface)' }}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : (
        // Within: a round marker with a tick, on the bar.
        <g>
          <circle cx={px} cy={barY + barH / 2} r="10" style={{ fill: 'var(--status-ok)', stroke: 'var(--color-surface)' }} strokeWidth="2" />
          <path d={`M${px - 5} ${barY + barH / 2}l3.6 3.6L${px + 5.5} ${barY + barH / 2 - 4}`} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      <text
        x={clamp(px, 34, Wd - 34)}
        y={numberY}
        fontSize="15"
        fontWeight="800"
        textAnchor="middle"
        style={{ fill: 'var(--color-text)' }}
      >
        {numberText}
      </text>
    </svg>
  );
}

function PermissibleParts({ v, lang }: { v: DsrVariationBlock; lang: Lang }): ReactElement {
  const b = v.band;
  const stockLine =
    lang === 'hi'
      ? `टंकी स्टॉक का ${b.stockPct !== null ? `${pct(b.stockPct)} ` : ''}(${litres(b.stockL)})`
      : lang === 'hl'
        ? `Tanki stock ka ${b.stockPct !== null ? `${pct(b.stockPct)} ` : ''}(${litres(b.stockL)})`
        : `${b.stockPct !== null ? `${pct(b.stockPct)} of ` : ''}tank stock (${litres(b.stockL)})`;
  const leakLine = b.leakApplies
    ? lang === 'hi'
      ? `बिक्री पर ${b.leakPct !== null ? `${pct(b.leakPct)} ` : ''}वाष्पन व हैंडलिंग (${litres(b.leakL)})`
      : lang === 'hl'
        ? `Bikri par ${b.leakPct !== null ? `${pct(b.leakPct)} ` : ''}evaporation aur handling (${litres(b.leakL)})`
        : `${b.leakPct !== null ? `${pct(b.leakPct)} of ` : ''}sales for evaporation and handling (${litres(b.leakL)})`
    : null;
  return (
    <div className="space-y-0.5 text-body leading-relaxed text-text-muted">
      <div>{stockLine}</div>
      {leakLine ? <div>+ {leakLine}</div> : <div>{t(W.leakOnlyShort, lang)}</div>}
    </div>
  );
}

function WhatToDo({ v, lang }: { v: DsrVariationBlock; lang: Lang }): ReactElement | null {
  const n = indian(Math.abs(Math.round(v.offL)));
  const tone = toneOf(v);
  if (tone === 'ok') return null;
  const body =
    tone === 'low'
      ? lang === 'hi'
        ? `डिस्पेंसर से लगभग ${n} L वापस टंकी में डालें।`
        : lang === 'hl'
          ? `Dispenser se lagbhag ${n} L wapas tanki mein daalein.`
          : `Top up about ${n} L from the dispenser into the tank.`
      : lang === 'hi'
        ? `लगभग ${n} L का हिसाब दिखाएँ: टेस्टिंग या निकासी के रूप में।`
        : lang === 'hl'
          ? `Lagbhag ${n} L ka hisaab dikhaiye: testing ya nikasi ke roop mein.`
          : `Account for about ${n} L by showing it as testing or drawn off.`;
  return (
    <Callout status="info" testId="what-to-do">
      <div className="font-semibold">{t(W.whatToDo, lang)}</div>
      <div>{body}</div>
    </Callout>
  );
}

function FuelVariation({
  product,
  lang,
  revisionLine,
}: {
  product: VarProduct & { variation: DsrVariationBlock };
  lang: Lang;
  revisionLine: string | null;
}): ReactElement {
  const v = product.variation;
  const tone = toneOf(v);
  const name = fuelName(product.key, lang);
  const word = tone === 'low' ? t(W.short, lang) : tone === 'high' ? t(W.over, lang) : t(W.within, lang);
  const consequence = tone === 'low' ? t(W.consequenceShort, lang) : tone === 'high' ? t(W.consequenceOver, lang) : null;
  const numberColor = tone === 'ok' ? 'text-text' : 'text-status-problem-ink';
  const row = 'border-t border-border';
  const th = 'py-2 pr-3 text-left align-top text-subheading leading-relaxed text-text-muted';
  const td = 'whitespace-nowrap py-2 text-right align-top text-subheading tabular-nums leading-relaxed text-text';
  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface p-3" data-fuel={product.key} data-tone={tone}>
      <FuelBand fuelKey={product.key} tankNos={product.tankNos} lang={lang} />
      {revisionLine ? <p className="text-body leading-relaxed text-text-muted">{revisionLine}</p> : null}
      <div className="rounded-md bg-kind-dsr-soft p-2">
        <BalanceBar v={v} label={`${name} (${fuelLetters(product.key)})`} lang={lang} />
      </div>
      <p className="text-body leading-relaxed text-text-muted">{positionWords(v, lang)}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`text-[40px] font-semibold tabular-nums leading-tight ${numberColor}`} data-testid="big-number">
          {signed(v.variationL)} L
        </span>
        <StatusBadge status={statusOf(tone)} lang={lang} word={word} />
      </div>
      {consequence ? <p className="text-subheading leading-relaxed text-text">{consequence}</p> : null}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th scope="row" className={th}>{t(W.rowVariation, lang)}</th>
            <td className={td}>{signedLitres(v.variationL)}</td>
          </tr>
          <tr className={row}>
            <th scope="row" className={th}>
              {t(W.rowPermissible, lang)}
              <PermissibleParts v={v} lang={lang} />
            </th>
            <td className={td}>{litres(v.permissibleL)}</td>
          </tr>
          <tr className={row}>
            <th scope="row" className={th}>{t(W.rowBeyond, lang)}</th>
            <td className={td}>{v.offL === 0 ? '0 L' : signedLitres(v.offL)}</td>
          </tr>
        </tbody>
      </table>
      <WhatToDo v={v} lang={lang} />
      {tone !== 'ok' ? (
        <More label={`${t(W.guidelineLabel, lang)}`}>
          <p>{t(CONSEQUENCE_WORDS[tone], lang)}</p>
        </More>
      ) : null}
      <SinceLines v={v} lang={lang} />
      <HowLines v={v} lang={lang} />
    </article>
  );
}

function SinceLines({ v, lang }: { v: DsrVariationBlock; lang: Lang }): ReactElement | null {
  if (!v.sinceDate) return null;
  const d = dayWords(v.sinceDate, lang);
  const recv =
    lang === 'hi'
      ? `${d} की इंस्पेक्शन से अब तक कुल आया माल: ${litres(v.receiptSinceL)}`
      : lang === 'hl'
        ? `${d} ki inspection se ab tak kul aaya maal: ${litres(v.receiptSinceL)}`
        : `Total received since the inspection on ${d}: ${litres(v.receiptSinceL)}`;
  const test =
    lang === 'hi'
      ? `${d} की इंस्पेक्शन से अब तक कुल टेस्टिंग: ${litres(v.testSinceL)}`
      : lang === 'hl'
        ? `${d} ki inspection se ab tak kul testing: ${litres(v.testSinceL)}`
        : `Total testing since the inspection on ${d}: ${litres(v.testSinceL)}`;
  return (
    <div className="space-y-1 text-body leading-relaxed text-text-muted">
      <p>{recv}</p>
      <p>{test}</p>
    </div>
  );
}

function HowLines({ v, lang }: { v: DsrVariationBlock; lang: Lang }): ReactElement | null {
  const tiers = v.band.tiers;
  if (!v.how && !tiers) return null;
  const rows: Array<[Words, number]> = v.how
    ? [
        [W.howMeter, v.how.meterSalesL],
        [W.howAfterTesting, v.how.afterTestingL],
        [W.howTotalStock, v.how.totalStockL],
        [W.howDipStock, v.how.dipStockL],
        [W.howDipSales, v.how.dipSalesL],
      ]
    : [];
  return (
    <More label={t(W.how, lang)}>
      {rows.length > 0 ? (
        <dl className="space-y-1">
          {rows.map(([label, n]) => (
            <div key={label.en} className="flex justify-between gap-3">
              <dt>{t(label, lang)}</dt>
              <dd className="font-semibold tabular-nums text-text">{litres(n)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {tiers ? (
        <p>
          {lang === 'hi'
            ? `वाष्पन छूट: बिक्री के पहले ${indian(tiers.thresholdL)} L पर ${pct(tiers.firstPct)}, उसके बाद ${pct(tiers.restPct)} (${tiers.days} दिन)।`
            : lang === 'hl'
              ? `Evaporation chhoot: bikri ke pehle ${indian(tiers.thresholdL)} L par ${pct(tiers.firstPct)}, uske baad ${pct(tiers.restPct)} (${tiers.days} din).`
              : `Evaporation allowance: ${pct(tiers.firstPct)} on the first ${indian(tiers.thresholdL)} L of sales, ${pct(tiers.restPct)} after that (${tiers.days} days).`}
        </p>
      ) : null}
    </More>
  );
}

/** The corrected-copy line for one fuel: "Diesel was −310 L, now −120 L". */
function revisionLineFor(data: DsrVariationData, key: string, lang: Lang): string | null {
  const c = data.revision?.changed.find((x) => x.productKey === key);
  if (!c) return null;
  const f = fuelName(key, lang);
  const from = signedLitres(c.fromL);
  const to = signedLitres(c.toL);
  return lang === 'hi' ? `${f} पहले ${from} था, अब ${to} है।` : lang === 'hl' ? `${f} pehle ${from} tha, ab ${to} hai.` : `${f} was ${from}, now ${to}.`;
}

function salesProductsOf(data: DsrVariationData): SalesProduct[] {
  if (!data.sheets.includes('sales')) return [];
  return data.products
    .filter((p): p is VarProduct & { sales: NonNullable<VarProduct['sales']> } => !!p.sales)
    .map((p) => ({
      key: p.key,
      tankNos: p.tankNos,
      ...(p.retiredNozzles ? { retiredNozzles: p.retiredNozzles } : {}),
      sales: p.sales,
    }));
}

function Overlay({ data, lang }: OverlayProps<'dsr_variation'>): ReactElement {
  const shown = data.beforeInspection ? [] : withVariation(data);
  const sales = salesProductsOf(data);
  const revisedWithoutLines = data.revised && !(data.revision && data.revision.changed.length > 0);
  return (
    <div className="space-y-5 p-4" data-kind="dsr_variation">
      <Lead>{summarySentence(data, lang)}</Lead>
      {revisedWithoutLines ? (
        <p className="rounded-md border border-border bg-surface-2 p-3 text-body leading-relaxed text-text">{t(W.revised, lang)}</p>
      ) : null}
      {data.beforeInspection ? (
        <Callout status="info" testId="before-inspection">
          <p>{t(W.beforeInspection, lang)}</p>
        </Callout>
      ) : null}
      {shown.map((p) => (
        <FuelVariation key={p.key} product={p} lang={lang} revisionLine={revisionLineFor(data, p.key, lang)} />
      ))}
      {sales.length > 0 ? (
        <section className="space-y-4 border-t border-border pt-5" aria-label={t(W.salesHeading, lang)}>
          <h2 className="text-heading leading-relaxed text-text">{t(W.salesHeading, lang)}</h2>
          <SalesSheet products={sales} lang={lang} />
        </section>
      ) : null}
    </div>
  );
}

/** The mini signature: a bar with a green zone, a zero tick and a pointer on the left. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <rect x="3" y="14" width="34" height="9" rx="2" style={{ fill: 'var(--color-surface-2)', stroke: 'var(--kind-dsr-ink)' }} strokeWidth="2" />
      <rect x="12" y="14" width="16" height="9" style={{ fill: 'var(--status-ok-soft)', stroke: 'var(--status-ok)' }} strokeWidth="2" />
      <line x1="20" y1="11" x2="20" y2="26" style={{ stroke: 'var(--kind-dsr-ink)' }} strokeWidth="2" />
      <polygon points="3,3 13,3 8,12" style={{ fill: 'var(--kind-dsr-ink)' }} />
    </svg>
  );
}

function tile(data: DsrVariationData, lang: Lang): KindTile | null {
  if (data.beforeInspection) {
    return { value: t(W.notCounted, lang), sub: t(W.countingStarts, lang), status: 'info' };
  }
  const all = withVariation(data);
  if (all.length === 0) return null;
  const out = outOf(data);
  if (out.length === 0) {
    const sub =
      all.length === 1
        ? `${fuelName(all[0]!.key, lang)}: ${allowedRange(all[0]!.variation, lang)}`
        : lang === 'hi'
          ? `${all.length} ईंधन सीमा के अंदर`
          : lang === 'hl'
            ? `${all.length} fuel seema ke andar`
            : `${all.length} fuels within the limit`;
    return { value: t(W.allFine, lang), sub, status: 'ok' };
  }
  const worst = out[0]!;
  const tone = toneOf(worst.variation);
  const more = out.length - 1;
  const word = tone === 'high' ? t(W.over, lang) : t(W.short, lang);
  const sub = [word, allowedRange(worst.variation, lang), more > 0 ? (lang === 'hi' ? `+${more} और` : lang === 'hl' ? `+${more} aur` : `+${more} more`) : null]
    .filter(Boolean)
    .join(' · ');
  // One row per fuel outside its limit, worst first: the figure is the thing to read, the reason
  // ("over"/"short") sits beside the name, and the allowed range is said once, when one fuel is out.
  const rows = out.map((o) => ({
    label: fuelName(o.key, lang),
    value: `${signed(o.variation.variationL)} L`,
    hint: toneOf(o.variation) === 'high' ? t(W.over, lang) : t(W.short, lang),
  }));
  return {
    value: `${fuelName(worst.key, lang)} ${signed(worst.variation.variationL)} L`,
    sub,
    status: statusOf(tone),
    rows,
    // A non-breaking space keeps the unit with its figure: "+731 L" never leaves the L alone on a line.
    lines: out.length === 1 ? [allowedRange(worst.variation, lang).replace(/ L\b/g, '\u00A0L')] : [],
  };
}

function alert(data: DsrVariationData, lang: Lang): KindAlert | null {
  if (data.beforeInspection) return null;
  const out = outOf(data);
  if (out.length === 0) return null;
  const worst = out[0]!;
  const over = toneOf(worst.variation) === 'high';
  // The headline says the stock variation, the same figure the tile, the sheet and the share
  // print (Diesel 520 L short for a -520 L stock); the litres beyond the permitted band, which
  // is what to put right, are said in the line under it.
  const n = indian(Math.abs(Math.round(worst.variation.variationL)));
  const off = Math.abs(Math.round(worst.variation.offL));
  const beyond = indian(off);
  const f = fuelName(worst.key, lang);
  const headline = over
    ? lang === 'hi'
      ? `${f} ${n} L ज़्यादा है`
      : lang === 'hl'
        ? `${f} ${n} L zyada hai`
        : `${f} ${n} L over`
    : lang === 'hi'
      ? `${f} ${n} L कम है`
      : lang === 'hl'
        ? `${f} ${n} L kam hai`
        : `${f} ${n} L short`;
  let line = over
    ? lang === 'hi'
      ? `आपका स्टॉक सीमा से ${beyond} L ज़्यादा है। बिक्री रोकी जा सकती है। टंकी का हिसाब मिलाइए।`
      : lang === 'hl'
        ? `Aapka stock seema se ${beyond} L zyada hai. Bikri roki ja sakti hai. Tanki ka hisaab milaiye.`
        : `Your stock is ${beyond} L above the limit. Sales can be stopped. Please match the tank figures.`
    : lang === 'hi'
      ? `आपका स्टॉक मान्य सीमा से ${beyond} L कम है। आपसे लिखित स्पष्टीकरण माँगा जा सकता है।`
      : lang === 'hl'
        ? `Aapka stock maanya seema se ${beyond} L kam hai. Aapse likhit jawab maanga ja sakta hai.`
        : `Your stock is ${beyond} L below the permitted limit. You may be asked to explain.`;
  if (off === 0) {
    // No litres beyond the band to name: the plain sentence.
    line = over
      ? lang === 'hi'
        ? 'आपका स्टॉक सीमा से ज़्यादा है। बिक्री रोकी जा सकती है। टंकी का हिसाब मिलाइए।'
        : lang === 'hl'
          ? 'Aapka stock seema se zyada hai. Bikri roki ja sakti hai. Tanki ka hisaab milaiye.'
          : 'Your stock is above the limit. Sales can be stopped. Please match the tank figures.'
      : lang === 'hi'
        ? 'आपका स्टॉक मान्य सीमा से कम है। आपसे लिखित स्पष्टीकरण माँगा जा सकता है।'
        : lang === 'hl'
          ? 'Aapka stock maanya seema se kam hai. Aapse likhit jawab maanga ja sakta hai.'
          : 'Your stock is below the permitted limit. You may be asked to explain.';
  }
  if (out.length > 1) {
    line += lang === 'hi' ? ` ${out.length - 1} और ईंधन भी देखें।` : lang === 'hl' ? ` ${out.length - 1} aur fuel bhi dekhein.` : ` ${out.length - 1} more fuel also needs a look.`;
  }
  // Both ways beyond the limit are problems; an excess ranks above a shortage among them.
  return { headline, line, severity: 'problem', weight: over ? 1 : 0 };
}

function headline(data: DsrVariationData, lang: Lang): string {
  if (data.beforeInspection) {
    return lang === 'hi' ? 'इंस्पेक्शन से पहले: गिनती नहीं' : lang === 'hl' ? 'Inspection se pehle: ginti nahi' : 'Before the first inspection: not counted';
  }
  const all = withVariation(data);
  if (all.length === 0) return t({ hi: 'स्टॉक फ़र्क', hl: 'Stock farak', en: 'Stock variation' }, lang);
  const out = outOf(data);
  if (out.length === 0) {
    if (all.length === 1) {
      const f = fuelName(all[0]!.key, lang);
      return lang === 'hi' ? `${f} सीमा के अंदर` : lang === 'hl' ? `${f} seema ke andar` : `${f} within the limit`;
    }
    return lang === 'hi' ? 'सभी ईंधन सीमा के अंदर' : lang === 'hl' ? 'Sabhi fuel seema ke andar' : 'All fuels within the limit';
  }
  return out
    .map((p) => `${fuelName(p.key, lang)} ${signed(p.variation.variationL)} L (${toneOf(p.variation) === 'high' ? t(W.over, lang) : t(W.short, lang)})`)
    .join(', ');
}

function share(data: DsrVariationData, lang: Lang): string {
  const title = lang === 'hi' ? 'स्टॉक फ़र्क' : lang === 'hl' ? 'Stock farak (variation)' : 'Stock variation';
  const lines = [`${title} · ${data.outletCode} · ${dayWords(data.businessDate, lang)}`];
  if (data.beforeInspection) {
    lines.push(t(W.beforeInspection, lang));
  } else {
    for (const p of withVariation(data)) {
      const v = p.variation;
      const tone = toneOf(v);
      const beyond = indian(Math.abs(Math.round(v.offL)));
      const verdict =
        tone === 'ok'
          ? lang === 'hi'
            ? 'सीमा के अंदर'
            : lang === 'hl'
              ? 'seema ke andar'
              : 'within the limit'
          : tone === 'low'
            ? lang === 'hi'
              ? `कम, सीमा से ${beyond} L बाहर`
              : lang === 'hl'
                ? `kam, seema se ${beyond} L bahar`
                : `short, ${beyond} L beyond the limit`
            : lang === 'hi'
              ? `ज़्यादा, सीमा से ${beyond} L बाहर`
              : lang === 'hl'
                ? `zyada, seema se ${beyond} L bahar`
                : `over, ${beyond} L beyond the limit`;
      lines.push(`${fuelName(p.key, lang)} (${fuelLetters(p.key)}): ${signed(v.variationL)} L · ${allowedRange(v, lang)} · ${verdict}`);
    }
  }
  const sales = salesProductsOf(data);
  if (sales.length > 0) lines.push('', ...salesShareLines(sales, lang));
  return lines.join('\n');
}

export const view: KindView<'dsr_variation'> = {
  kind: 'dsr_variation',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
};
