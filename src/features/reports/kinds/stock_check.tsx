import { RefreshCw } from 'lucide-react';
import { useId, type ReactElement } from 'react';

import type { Lang } from '@/store/lang';
import type { StockCheckData, StockTankReading } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import {
  sayWords,
  type KindAlert,
  type KindTile,
  type KindView,
  type OverlayProps,
  type ReportAction,
  type ReportActionContext,
  type Words,
} from '../types';
import {
  dayAndTime,
  dayWords,
  daysFromToday,
  fuelColor,
  fuelLetters,
  fuelName,
  indian,
  istDay,
  litres,
  timeWords,
} from './dsr_sales/fmt';
import { Callout, FuelBand, Lead, More } from './dsr_sales/ui';

/**
 * Tank stock, ADR 0056 §2: one upright cylinder per tank, filled to its level, with a dark
 * water layer at the bottom. The litres are always printed large under each cylinder; the
 * fill is only a picture. A tank whose size is not known is drawn as a hatched outline (no
 * level, so a fake 100% never shows); a silent gauge is a dashed outline with a question
 * mark. Both read in grey-scale.
 *
 * Age always comes from the reading's own time, never from when the message was sent.
 * "Days of cover" is copied from the newest load plan and carries that plan's date; it is
 * never worked out here.
 */

// ── words ───────────────────────────────────────────────────────────────────

const W = {
  reading: { hi: 'रीडिंग', hl: 'Reading', en: 'Reading' },
  readingUnknown: { hi: 'रीडिंग का समय पता नहीं', hl: 'Reading ka samay pata nahi', en: 'Reading time not known' },
  stale: {
    hi: 'यह रीडिंग पुरानी है। अभी का स्टॉक अलग हो सकता है।',
    hl: 'Yeh reading purani hai. Abhi ka stock alag ho sakta hai.',
    en: 'This reading is old. Stock now may be different.',
  },
  staleHeadline: { hi: 'स्टॉक की रीडिंग पुरानी है', hl: 'Stock ki reading purani hai', en: 'Stock reading is old' },
  noReading: { hi: 'रीडिंग नहीं', hl: 'Reading nahi', en: 'No reading' },
  noGauge: {
    hi: 'इस टंकी का गेज रीडिंग नहीं भेज रहा',
    hl: 'Is tanki ka gauge reading nahi bhej raha',
    en: "This tank's gauge is not sending a reading",
  },
  sizeUnknown: { hi: 'टंकी का आकार पता नहीं', hl: 'Tanki ka size pata nahi', en: 'Size not known' },
  sizeEstimated: { hi: 'आकार अनुमान से', hl: 'Size andaaze se', en: 'Size is an estimate' },
  low: { hi: 'न्यूनतम', hl: 'Minimum', en: 'Low' },
  lowWord: { hi: 'कम स्टॉक', hl: 'Kam stock', en: 'Low' },
  moreLabel: { hi: 'और देखें', hl: 'Aur dekhein', en: 'More details' },
  moreBody: {
    hi: 'स्टॉक यानी पानी निकालकर बचा ईंधन। इंडियनऑयल का टंकी गेज हर 30 मिनट में पढ़ता है। यह रीडिंग हमने आपके कहने पर निकाली।',
    hl: "Stock yaani paani nikalkar bacha fuel. IndianOil ka tanki gauge har 30 minute mein padhta hai. Yeh reading humne aapke kehne par nikali.",
    en: "Stock means fuel without water. IndianOil's tank gauge reads every 30 minutes. We fetched this reading when you asked.",
  },
  tank: { hi: 'टंकी', hl: 'Tanki', en: 'Tank' },
  water: { hi: 'पानी', hl: 'Paani', en: 'Water' },
  askAgain: { hi: 'दोबारा पूछें', hl: 'Dobara poochhein', en: 'Ask again' },
  // The sentence sent into the chat. The stock-check reader takes any words; these are the ones the
  // service's own guide lists ("stock kitna hai"), so a dealer reading the chat sees what they would have typed.
  askSentence: { hi: 'स्टॉक कितना है', hl: 'Stock kitna hai', en: 'How much stock is there now?' },
  asked: {
    hi: 'पूछ लिया। नई रीडिंग आपकी चैट में आएगी।',
    hl: 'Pooch liya. Nayi reading aapki chat mein aayegi.',
    en: 'Asked. The new reading will come in your chat.',
  },
} satisfies Record<string, Words>;

function t(w: Words, lang: Lang): string {
  return sayWords(w, lang);
}

// ── pure helpers ────────────────────────────────────────────────────────────

type Fuel = StockCheckData['fuels'][number];

/** A tank with no usable reading: no litres, or the gauge said it is not ok. */
export function hasNoReading(tank: StockTankReading): boolean {
  return tank.litres === null || !tank.gaugeOk;
}

/** Fill 0..1 when the tank's size is known and there is a reading; null otherwise (draw no level). */
export function fillOf(tank: StockTankReading): number | null {
  if (hasNoReading(tank)) return null;
  const cap = tank.capacityL;
  if (cap === null || cap === undefined || !(cap > 0) || tank.litres === null) return null;
  return Math.min(1, Math.max(0, tank.litres / cap));
}

function isLow(tank: StockTankReading): boolean {
  if (hasNoReading(tank) || tank.litres === null) return false;
  const low = tank.lowLineL;
  return low !== null && low !== undefined && low > 0 && tank.litres <= low;
}

function daysWords(days: number, lang: Lang): string {
  if (days < 1) return lang === 'hi' ? 'एक दिन से कम' : lang === 'hl' ? 'ek din se kam' : 'less than a day';
  const n = Math.round(days);
  return lang === 'hi' ? `${n} दिन` : lang === 'hl' ? `${n} din` : `${n} day${n === 1 ? '' : 's'}`;
}

/** The fuel's total in words: "16,200 L", or "Total of 2 of 3 tanks" when a gauge is silent. */
function totalWords(f: Fuel, lang: Lang): string {
  if (f.tanksRead === 0) return t(W.noReading, lang);
  if (f.tanksNoReading > 0) {
    const all = f.tanksRead + f.tanksNoReading;
    const part =
      lang === 'hi'
        ? `${all} में से ${f.tanksRead} टंकी का कुल`
        : lang === 'hl'
          ? `${all} mein se ${f.tanksRead} tanki ka kul`
          : `Total of ${f.tanksRead} of ${all} tanks`;
    return `${part}: ${litres(f.totalL)}`;
  }
  return litres(f.totalL);
}

function readingStamp(data: StockCheckData, lang: Lang): string {
  return data.readingAt ? dayAndTime(data.readingAt, lang) : t(W.readingUnknown, lang);
}

function leadLine(data: StockCheckData, lang: Lang): string {
  const parts = data.fuels.map((f) => {
    const name = fuelName(f.fuelKey, lang);
    return f.tanksRead === 0 ? `${name}: ${t(W.noReading, lang)}` : `${name} ${litres(f.totalL)}`;
  });
  return parts.length > 0 ? `${parts.join('. ')}.` : '';
}

/** Days of cover per fuel, from the plan; only those with a figure. */
function coverFuels(data: StockCheckData): Array<{ fuelKey: string; daysLeft: number; runOutOn: string | null }> {
  return (data.cover?.fuels ?? [])
    .filter((c): c is { fuelKey: string; daysLeft: number; runOutOn: string | null } => c.daysLeft !== null)
    .map((c) => ({ fuelKey: c.fuelKey, daysLeft: c.daysLeft, runOutOn: c.runOutOn }));
}

function deadTanks(data: StockCheckData): number {
  return data.fuels.reduce((n, f) => n + f.tanks.filter(hasNoReading).length, 0);
}

function tankLabel(no: number, lang: Lang): string {
  return `${t(W.tank, lang)} ${no}`;
}

function tankAria(f: Fuel, tank: StockTankReading, lang: Lang): string {
  const base = `${tankLabel(tank.tankNo, lang)}, ${fuelName(f.fuelKey, lang)}`;
  if (hasNoReading(tank)) return `${base}, ${t(W.noGauge, lang)}`;
  const fill = fillOf(tank);
  const pctText = fill === null ? '' : lang === 'hi' ? `, ${Math.round(fill * 100)} प्रतिशत` : lang === 'hl' ? `, ${Math.round(fill * 100)} percent` : `, ${Math.round(fill * 100)} percent`;
  const water =
    tank.waterL === null
      ? ''
      : lang === 'hi'
        ? `, पानी ${indian(tank.waterL, 1)} लीटर`
        : lang === 'hl'
          ? `, paani ${indian(tank.waterL, 1)} litre`
          : `, water ${indian(tank.waterL, 1)} litres`;
  const unit = lang === 'hi' ? 'लीटर' : lang === 'hl' ? 'litre' : 'litres';
  return `${base}, ${indian(Math.round(tank.litres as number))} ${unit}${pctText}${water}`;
}

// ── drawing ─────────────────────────────────────────────────────────────────

const CYL = { w: 96, h: 150, x0: 8, x1: 88, topCy: 14, botCy: 130, rx: 40, ry: 9 } as const;

/** One cylinder. Shapes only; the numbers are printed in HTML under it. */
function Cylinder({ fuelKey, tank, uid, lang }: { fuelKey: string; tank: StockTankReading; uid: string; lang: Lang }): ReactElement {
  const dead = hasNoReading(tank);
  const fill = fillOf(tank);
  const span = CYL.botCy - CYL.topCy;
  const surfaceY = fill === null ? CYL.botCy : CYL.botCy - fill * span;
  const lowFrac =
    tank.capacityL && tank.capacityL > 0 && tank.lowLineL && tank.lowLineL > 0 ? Math.min(1, tank.lowLineL / tank.capacityL) : null;
  const lowY = lowFrac === null ? null : CYL.botCy - lowFrac * span;
  const waterH =
    !dead && tank.waterL && tank.waterL > 0
      ? Math.max(5, tank.capacityL && tank.capacityL > 0 ? (tank.waterL / tank.capacityL) * span : 5)
      : 0;
  const bodyPath = `M${CYL.x0} ${CYL.topCy}A${CYL.rx} ${CYL.ry} 0 0 1 ${CYL.x1} ${CYL.topCy}V${CYL.botCy}A${CYL.rx} ${CYL.ry} 0 0 1 ${CYL.x0} ${CYL.botCy}Z`;
  const ink = 'var(--kind-stock-ink)';
  const clip = `${uid}c`;
  const hatch = `${uid}h`;
  return (
    <svg width={CYL.w} height={CYL.h} viewBox={`0 0 ${CYL.w} ${CYL.h}`} aria-hidden="true" focusable="false" className="mx-auto block">
      <defs>
        <clipPath id={clip}>
          <path d={bodyPath} />
        </clipPath>
        <pattern id={hatch} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" style={{ stroke: ink }} strokeWidth="2" strokeOpacity="0.45" />
        </pattern>
      </defs>
      <path d={bodyPath} style={{ fill: 'var(--color-surface)' }} />
      {dead ? null : fill === null ? (
        // Size not known: the interior is hatched and there is no level.
        <path d={bodyPath} fill={`url(#${hatch})`} />
      ) : (
        <g clipPath={`url(#${clip})`}>
          <rect x={CYL.x0} y={surfaceY} width={CYL.x1 - CYL.x0} height={CYL.h - surfaceY} style={{ fill: fuelColor(fuelKey) }} fillOpacity="0.85" />
          <ellipse cx="48" cy={surfaceY} rx={CYL.rx} ry={CYL.ry} style={{ fill: fuelColor(fuelKey) }} fillOpacity="0.55" />
        </g>
      )}
      {waterH > 0 ? (
        <g clipPath={`url(#${clip})`}>
          <rect x={CYL.x0} y={CYL.botCy + CYL.ry - waterH} width={CYL.x1 - CYL.x0} height={waterH + 2} style={{ fill: '#27272a' }} />
        </g>
      ) : null}
      {lowY !== null && !dead ? (
        <g>
          <line x1={CYL.x0} y1={lowY} x2={CYL.x1} y2={lowY} style={{ stroke: 'var(--color-text)' }} strokeWidth="2" strokeDasharray="5 4" />
          <text
            x={CYL.x1 - 4}
            y={lowY - 4}
            fontSize="10"
            fontWeight="800"
            textAnchor="end"
            paintOrder="stroke"
            strokeWidth="3"
            style={{ fill: 'var(--color-text)', stroke: 'var(--color-surface)' }}
          >
            {t(W.low, lang)}
          </text>
        </g>
      ) : null}
      {/* the outline: solid normally, dashed when the gauge is silent */}
      <path d={bodyPath} fill="none" style={{ stroke: ink }} strokeWidth="3" strokeDasharray={dead ? '7 6' : undefined} strokeLinejoin="round" />
      <ellipse cx="48" cy={CYL.topCy} rx={CYL.rx} ry={CYL.ry} fill="none" style={{ stroke: ink }} strokeWidth="3" strokeDasharray={dead ? '7 6' : undefined} />
      {dead ? (
        <text x="48" y="88" fontSize="44" fontWeight="800" textAnchor="middle" style={{ fill: ink }}>
          ?
        </text>
      ) : null}
    </svg>
  );
}

function TankCard({
  fuel,
  tank,
  readingAt,
  lang,
  uid,
}: {
  fuel: Fuel;
  tank: StockTankReading;
  readingAt: string | null;
  lang: Lang;
  uid: string;
}): ReactElement {
  const dead = hasNoReading(tank);
  const low = isLow(tank);
  const ownTime =
    readingAt && tank.at && Math.abs(Date.parse(tank.at) - Date.parse(readingAt)) > 60_000 ? timeWords(tank.at, lang) : '';
  const noSize = !dead && fillOf(tank) === null;
  return (
    <li className="min-w-0 text-center" data-tank={tank.tankNo} data-state={dead ? 'no-reading' : noSize ? 'no-size' : 'ok'}>
      <div role="img" aria-label={tankAria(fuel, tank, lang)}>
        <Cylinder fuelKey={fuel.fuelKey} tank={tank} uid={uid} lang={lang} />
      </div>
      <div className="mt-1 text-title tabular-nums leading-tight text-text">
        {dead ? <span className="text-body">{t(W.noReading, lang)}</span> : litres(tank.litres as number)}
      </div>
      <div className="mt-1">
        <span className="inline-flex min-h-[28px] items-center rounded-full border border-border-strong bg-surface px-2.5 text-cta text-text">
          {tankLabel(tank.tankNo, lang)}
        </span>
      </div>
      {dead ? <p className="mt-1 text-body leading-snug text-text-muted">{t(W.noGauge, lang)}</p> : null}
      {low ? (
        <div className="mt-1 flex justify-center">
          <StatusBadge status="attention" lang={lang} word={t(W.lowWord, lang)} />
        </div>
      ) : null}
      {!dead && tank.waterL !== null ? (
        <p className="mt-1 flex items-center justify-center gap-1 text-body leading-snug text-text-muted">
          {tank.waterL > 0 ? (
            <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="shrink-0">
              <polygon points="10,2 18.5,17 1.5,17" style={{ fill: 'var(--status-attention)' }} />
              <path d="M10 7.5v4.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="10" cy="14.4" r="1" fill="#fff" />
            </svg>
          ) : null}
          <span className={tank.waterL > 0 ? 'font-semibold text-text' : ''}>
            {t(W.water, lang)} {indian(tank.waterL, 1)} L
          </span>
        </p>
      ) : null}
      {noSize ? <p className="mt-1 text-body leading-snug text-text-muted">{t(W.sizeUnknown, lang)}</p> : null}
      {!dead && !noSize && tank.capacityEstimated ? (
        <p className="mt-1 text-body leading-snug text-text-muted">{t(W.sizeEstimated, lang)}</p>
      ) : null}
      {ownTime ? (
        <p className="mt-1 text-body leading-snug text-text-muted">
          {t(W.reading, lang)} {ownTime}
        </p>
      ) : null}
    </li>
  );
}

function coverSentence(c: { fuelKey: string; daysLeft: number; runOutOn: string | null }, planDay: string, lang: Lang): string {
  const f = fuelName(c.fuelKey, lang);
  const plan = dayWords(planDay, lang);
  const run = c.runOutOn ? dayWords(c.runOutOn, lang) : null;
  const days = daysWords(c.daysLeft, lang);
  if (lang === 'hi') {
    return `${f} लगभग ${days} चलेगा (${plan} के प्लान से)।${run ? ` लगभग ${run} को खत्म होगा।` : ''}`;
  }
  if (lang === 'hl') {
    return `${f} lagbhag ${days} chalega (${plan} ke plan se).${run ? ` Lagbhag ${run} ko khatam hoga.` : ''}`;
  }
  return `${f} lasts about ${days} (from the plan of ${plan}).${run ? ` Runs out about ${run}.` : ''}`;
}

function Overlay({ data, lang }: OverlayProps<'stock_check'>): ReactElement {
  const uid = useId().replace(/:/g, '');
  const cover = coverFuels(data);
  return (
    <div className="space-y-5 p-4" data-kind="stock_check">
      <div className="space-y-1">
        <Lead>{leadLine(data, lang)}</Lead>
        <p className="text-body leading-relaxed text-text-muted">
          {t(W.reading, lang)}: {readingStamp(data, lang)}
        </p>
      </div>
      {data.stale ? (
        <Callout status="attention" testId="stale-band">
          <p className="font-semibold">{t(W.stale, lang)}</p>
        </Callout>
      ) : null}
      {data.fuels.map((f, fi) => (
        <section key={f.fuelKey} className="space-y-3" data-fuel={f.fuelKey}>
          <FuelBand
            fuelKey={f.fuelKey}
            lang={lang}
            trailing={<span className="basis-full text-subheading tabular-nums text-text sm:basis-auto">{totalWords(f, lang)}</span>}
          />
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-3 gap-y-5">
            {f.tanks.map((tk) => (
              <TankCard key={tk.tankNo} fuel={f} tank={tk} readingAt={data.readingAt} lang={lang} uid={`${uid}${fi}x${tk.tankNo}`} />
            ))}
          </ul>
        </section>
      ))}
      {cover.length > 0 && data.cover ? (
        <div className="space-y-2 rounded-md border border-border bg-surface p-3" data-testid="cover">
          {cover.map((c) => (
            <p key={c.fuelKey} className="text-body leading-relaxed text-text">
              {coverSentence(c, data.cover!.planDay, lang)}
            </p>
          ))}
        </div>
      ) : null}
      <More label={t(W.moreLabel, lang)}>
        <p>{t(W.moreBody, lang)}</p>
      </More>
    </div>
  );
}

/** The mini signature: one cylinder, half filled, with a water line. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  const clip = `${useId().replace(/:/g, '')}g`;
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <path d="M10 6A10 3 0 0 1 30 6V22A10 3 0 0 1 10 22Z" />
        </clipPath>
      </defs>
      <path d="M10 6A10 3 0 0 1 30 6V22A10 3 0 0 1 10 22Z" style={{ fill: 'var(--color-surface)' }} />
      <g clipPath={`url(#${clip})`}>
        <rect x="10" y="14" width="20" height="14" style={{ fill: 'var(--kind-stock-ink)' }} fillOpacity="0.6" />
        <rect x="10" y="21" width="20" height="7" style={{ fill: '#27272a' }} />
      </g>
      <path d="M10 6A10 3 0 0 1 30 6V22A10 3 0 0 1 10 22Z" fill="none" style={{ stroke: 'var(--kind-stock-ink)' }} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="20" cy="6" rx="10" ry="3" fill="none" style={{ stroke: 'var(--kind-stock-ink)' }} strokeWidth="2" />
    </svg>
  );
}

/**
 * A reading this old is "old" on the Today tile, whatever the card said when it was sent: the tile
 * stays on the page for days, and `data.stale` was fixed at send time (75 minutes then).
 */
export const TILE_OLD_AFTER_MS = 6 * 60 * 60_000;

/** Old when the card said so at send time, or when the reading is now more than {@link TILE_OLD_AFTER_MS} behind. */
export function readingIsOld(data: StockCheckData, now: number = Date.now()): boolean {
  if (data.stale) return true;
  const at = data.readingAt ? Date.parse(data.readingAt) : NaN;
  return Number.isFinite(at) && now - at > TILE_OLD_AFTER_MS;
}

function tile(data: StockCheckData, lang: Lang): KindTile | null {
  if (data.fuels.length === 0) return null;
  const value =
    data.fuels.length === 1
      ? data.fuels[0]!.tanksRead === 0
        ? t(W.noReading, lang)
        : litres(data.fuels[0]!.totalL)
      : data.fuels.map((f) => `${fuelName(f.fuelKey, lang)} ${f.tanksRead === 0 ? t(W.noReading, lang) : litres(f.totalL)}`).join(' · ');
  const old = readingIsOld(data);
  const cover = coverFuels(data);
  const bits: string[] = [];
  // The reading's own time is always on the tile: "lasts 3 days" is worked out from it, and a tile
  // can sit on Today for days.
  // A reading from today says only its time ("Read 5:54 pm"); an older one keeps its day.
  const readToday = data.readingAt ? daysFromToday(istDay(data.readingAt)) === 0 : false;
  const when = readToday && data.readingAt ? timeWords(data.readingAt, lang) : readingStamp(data, lang);
  const stamp = `${lang === 'hi' ? 'रीडिंग' : lang === 'hl' ? 'Reading' : 'Read'} ${when}`;
  if (!old && cover.length > 0 && data.cover) {
    const worst = cover.reduce((a, b) => (b.daysLeft < a.daysLeft ? b : a));
    const days = daysWords(worst.daysLeft, lang);
    // The plan's day is said only when it is not today's plan.
    const plan = daysFromToday(data.cover.planDay) === 0 ? '' : dayWords(data.cover.planDay, lang);
    const who = data.fuels.length > 1 ? `${fuelName(worst.fuelKey, lang)} ` : '';
    bits.push(
      lang === 'hi'
        ? `${who}${days} चलेगा${plan ? ` (${plan} का प्लान)` : ''}`
        : lang === 'hl'
          ? `${who}${days} chalega${plan ? ` (${plan} ka plan)` : ''}`
          : `${who ? `${who}lasts` : 'Lasts'} ${days}${plan ? ` (plan of ${plan})` : ''}`,
    );
    bits.push(stamp);
  } else {
    bits.push(old ? `${lang === 'hi' ? 'पुरानी रीडिंग' : lang === 'hl' ? 'Purani reading' : 'Old reading'} · ${stamp}` : stamp);
  }
  const dead = deadTanks(data);
  if (dead > 0) {
    bits.push(
      lang === 'hi' ? `${dead} टंकी की रीडिंग नहीं` : lang === 'hl' ? `${dead} tanki ki reading nahi` : `${dead} tank${dead === 1 ? '' : 's'} not reading`,
    );
  }
  const status = old ? ('attention' as const) : ('ok' as const);
  if (data.fuels.length === 1) return { value, sub: bits.join(' · '), status };
  // Several fuels: one row each; a fuel with no reading says so quietly instead of passing for a figure.
  const rows = data.fuels.map((f) => {
    const none = f.tanksRead === 0;
    return { label: fuelName(f.fuelKey, lang), value: none ? t(W.noReading, lang) : litres(f.totalL), ...(none ? { quiet: true } : {}) };
  });
  return { value, sub: bits.join(' · '), status, rows, lines: bits };
}

function alert(data: StockCheckData, lang: Lang): KindAlert | null {
  if (!data.stale) return null;
  const stamp = readingStamp(data, lang);
  const line =
    lang === 'hi'
      ? `यह रीडिंग ${stamp} की है। नई रीडिंग के लिए दोबारा पूछें।`
      : lang === 'hl'
        ? `Yeh reading ${stamp} ki hai. Nayi reading ke liye dobara poochhein.`
        : `This reading is from ${stamp}. Ask again for a fresh one.`;
  return { headline: t(W.staleHeadline, lang), line, severity: 'attention' };
}

function headline(data: StockCheckData, lang: Lang): string {
  if (data.fuels.length === 0) return t({ hi: 'टंकी का स्टॉक', hl: 'Tanki ka stock', en: 'Tank stock' }, lang);
  return data.fuels
    .map((f) => `${fuelName(f.fuelKey, lang)} ${f.tanksRead === 0 ? t(W.noReading, lang) : litres(f.totalL)}`)
    .join(', ');
}

function share(data: StockCheckData, lang: Lang): string {
  const title = lang === 'hi' ? 'टंकी का स्टॉक' : lang === 'hl' ? 'Tanki ka stock' : 'Tank stock';
  const lines = [`${title} · ${data.outletCode} · ${t(W.reading, lang).toLowerCase()} ${readingStamp(data, lang)}`];
  for (const f of data.fuels) {
    lines.push(`${fuelName(f.fuelKey, lang)} (${fuelLetters(f.fuelKey)}): ${totalWords(f, lang)}`);
    for (const tk of f.tanks) {
      lines.push(`  ${tankLabel(tk.tankNo, lang)}: ${hasNoReading(tk) ? t(W.noReading, lang) : litres(tk.litres as number)}`);
    }
  }
  if (data.cover) {
    for (const c of coverFuels(data)) lines.push(coverSentence(c, data.cover.planDay, lang));
  }
  return lines.join('\n');
}

const newestAt = (clock: string): Words => ({
  hi: `नई रीडिंग ${clock} के बाद मिल सकती है`,
  hl: `Nayi reading ${clock} ke baad mil sakti hai`,
  en: `Newest reading possible at ${clock}`,
});

/** The gauges report every 30 minutes, so asking again inside that window only brings the same reading. */
export const STOCK_ASK_LOCK_MS = 30 * 60_000;

/** When asking again can bring a newer reading, in ms; null when the reading's time is not known (no lock). */
export function stockAskableAt(data: StockCheckData): number | null {
  if (!data.readingAt) return null;
  const at = Date.parse(data.readingAt);
  return Number.isFinite(at) ? at + STOCK_ASK_LOCK_MS : null;
}

/**
 * "Ask again": the same sentence a dealer would type, sent into this chat; the stock check reads
 * the newest tank gauge and posts a new report. Greyed out for 30 minutes from the reading, with the
 * time it can next bring something new, because asking sooner only repeats this reading.
 */
function actions(data: StockCheckData, _report: unknown, ctx: ReportActionContext): ReportAction[] {
  const askableAt = stockAskableAt(data);
  const locked = askableAt !== null && ctx.now() < askableAt;
  return [
    {
      id: 'ask-again',
      icon: RefreshCw,
      label: W.askAgain,
      once: true,
      ...(locked
        ? { disabled: { note: sayWords(newestAt(timeWords(new Date(askableAt).toISOString(), ctx.lang)), ctx.lang) } }
        : {}),
      // A send that fails rejects: the overlay says it did not go through and leaves the button usable.
      run: async () => {
        await ctx.sendChat(sayWords(W.askSentence, ctx.lang));
        ctx.toast.success(sayWords(W.asked, ctx.lang));
      },
    },
  ];
}

export const view: KindView<'stock_check'> = {
  kind: 'stock_check',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
  actions,
};
