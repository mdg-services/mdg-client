import { useRef, useState, type ReactElement } from 'react';
import { Check, Copy, ShoppingCart } from 'lucide-react';

import { copyText } from '@/lib/clipboard';
import type { Lang } from '@/store/lang';
import type { LoadPlanData, LoadPlanSnapTruck } from '@dk/shared/types';

import {
  sayWords,
  type KindAlert,
  type KindTile,
  type KindView,
  type OverlayProps,
  type ReportAction,
  type ReportActionContext,
  type ReportStatusKey,
  type Words,
} from '../types';
import {
  clockWords,
  dayWithWeekday,
  dayWords,
  daysBetween,
  fuelColor,
  fuelLetters,
  fuelName,
  indian,
  istDay,
  joinList,
  litres,
  weekdayAndDate,
} from './dsr_sales/fmt';
import { Callout, FuelSwatch, More } from './dsr_sales/ui';

/**
 * Next tanker plan, ADR 0056 §2: a side-view tanker lorry drawn with its chambers (each with
 * its fuel letters and litres), then a 4-day strip. Only this report draws a lorry with
 * compartments, so "a lorry with compartments" means "what to order from IndianOil".
 *
 * Severity is one value the snapshot carries (`urgent`, `order_today`, `calm`): its shape
 * (octagon, triangle, tick) and its words follow it, and red is used only when it is urgent
 * (a calm day never wears a red banner). The credit line is the owner's money: it exists only
 * when the server sent the `credit` block, and it never goes into the shared text.
 */

// ── words ───────────────────────────────────────────────────────────────────

const W = {
  orderNow: { hi: 'अभी ऑर्डर करें', hl: 'Abhi order karein', en: 'Order now' },
  orderToday: { hi: 'आज ऑर्डर करें', hl: 'Aaj order karein', en: 'Order today' },
  noOrderToday: { hi: 'आज ऑर्डर नहीं', hl: 'Aaj order nahi', en: 'No order today' },
  bannerNow: { hi: 'अभी टैंकर मँगवाइए।', hl: 'Abhi tanker mangwaiye.', en: 'Order a tanker now.' },
  bannerToday: { hi: 'आज टैंकर मँगवाइए।', hl: 'Aaj tanker mangwaiye.', en: 'Order a tanker today.' },
  bannerCalm: { hi: 'आज ऑर्डर की ज़रूरत नहीं।', hl: 'Aaj order ki zaroorat nahi.', en: 'No order needed today.' },
  chambers: { hi: 'क्या मँगवाना है', hl: 'Kya mangwana hai', en: 'What to order' },
  stockHeading: { hi: 'स्टॉक और बचे दिन', hl: 'Stock aur bache din', en: 'Stock and days left' },
  fuel: { hi: 'ईंधन', hl: 'Fuel', en: 'Fuel' },
  stock: { hi: 'स्टॉक', hl: 'Stock', en: 'Stock' },
  daysLeft: { hi: 'बचे दिन', hl: 'Bache din', en: 'Days left' },
  noDays: {
    hi: 'बिक्री के दिन अभी कम हैं',
    hl: 'Bikri ke din abhi kam hain',
    en: 'not enough days of sales yet',
  },
  atMinimum: { hi: 'न्यूनतम पर', hl: 'Minimum par', en: 'At the minimum' },
  next4: { hi: 'अगले 4 दिन', hl: 'Agle 4 din', en: 'Next 4 days' },
  noOrder: { hi: 'ऑर्डर नहीं', hl: 'Order nahi', en: 'No order' },
  depotClosed: { hi: 'डिपो बंद', hl: 'Depot band', en: 'Depot closed' },
  copy: { hi: 'कॉपी', hl: 'Copy', en: 'Copy' },
  copied: { hi: 'कॉपी हुआ', hl: 'Copy hua', en: 'Copied' },
  copyAll: { hi: 'सभी ऑर्डर लाइनें कॉपी करें', hl: 'Saari order lines copy karein', en: 'Copy all order lines' },
  onTheWay: { hi: 'रास्ते में', hl: 'Raaste mein', en: 'On the way' },
  empty: { hi: 'खाली', hl: 'Khali', en: 'Empty' },
  tank: { hi: 'टंकी', hl: 'Tanki', en: 'Tank' },
  notFull: { hi: 'पूरा टैंकर नहीं', hl: 'Poora tanker nahi', en: 'Not a full tanker' },
  noTankerYet: { hi: 'अभी कोई टैंकर तय नहीं है।', hl: 'Abhi koi tanker tay nahi hai.', en: 'No tanker is planned yet.' },
  creditEnough: { hi: 'क्रेडिट काफ़ी है', hl: 'Credit kaafi hai', en: 'Credit is enough' },
  moreLabel: { hi: 'और देखें', hl: 'Aur dekhein', en: 'More details' },
  moreBody: {
    hi: '"लगभग" का मतलब है कि टंकी का आकार या इनवॉइस की मात्रा अनुमान से ली गई है। प्लान सुबह की रीडिंग से बनता है।',
    hl: '"Lagbhag" ka matlab hai ki tanki ka size ya invoice ki matra andaaze se li gayi hai. Plan subah ki reading se banta hai.',
    en: '"About" means the tank size or the invoice litres are an estimate. The plan is made from the morning reading.',
  },
  chamberCol: { hi: 'खाना', hl: 'Khana', en: 'Chamber' },
  litresCol: { hi: 'लीटर', hl: 'Litre', en: 'Litres' },
} satisfies Record<string, Words>;

function t(w: Words, lang: Lang): string {
  return sayWords(w, lang);
}

// ── pure helpers ────────────────────────────────────────────────────────────

/** Petrol first, then XP, diesel, XG, then the rest in the order given. */
const FUEL_ORDER = ['MS', 'XP', 'HSD', 'XG'];
function fuelRank(key: string): number {
  const i = FUEL_ORDER.indexOf(key.trim().toUpperCase());
  return i === -1 ? FUEL_ORDER.length : i;
}
function sortedFuels(keys: readonly string[]): string[] {
  return keys.map((k, i) => ({ k, i })).sort((a, b) => fuelRank(a.k) - fuelRank(b.k) || a.i - b.i).map((x) => x.k);
}

/** A plan older than two days is not today's: the tile goes quiet and no alert is raised from it. */
export function planIsOld(data: LoadPlanData, now: number = Date.now()): boolean {
  const today = istDay(now);
  return today !== '' && daysBetween(data.planDay, today) > 2;
}

interface Load {
  trucks: number;
  byProduct: Array<{ product: string; litres: number }>;
}

/** What the order is, in total: tankers and litres per fuel. */
export function orderLoad(data: LoadPlanData): Load | null {
  if (!data.order || data.order.trucks.length === 0) return null;
  const sums = new Map<string, number>();
  for (const truck of data.order.trucks) {
    for (const c of truck.chambers) {
      if (!c.product) continue;
      sums.set(c.product, (sums.get(c.product) ?? 0) + c.litres);
    }
  }
  const byProduct = sortedFuels([...sums.keys()]).map((product) => ({ product, litres: sums.get(product) ?? 0 }));
  return { trucks: data.order.trucks.length, byProduct };
}

function loadWords(load: Load, lang: Lang): string {
  return load.byProduct.map((p) => `${fuelName(p.product, lang)} ${litres(p.litres)}`).join(', ');
}

function tankersWords(n: number, lang: Lang): string {
  return lang === 'hi' ? `${n} टैंकर` : lang === 'hl' ? `${n} tanker` : `${n} tanker${n === 1 ? '' : 's'}`;
}

function rupees(n: number, lang: Lang): string {
  void lang;
  return `₹${indian(Math.round(n))}`;
}

function dayList(days: readonly string[], lang: Lang): string {
  return joinList(days.map((d) => dayWithWeekday(d, lang)), lang);
}

/** Why the plan says "now" when it does: the fuels running out or the closed depot. */
function urgentReason(data: LoadPlanData, lang: Lang): string {
  const v = data.verdict;
  if (v.code === 'ORDER_NOW_RUNNING_OUT' && v.products.length > 0) {
    const names = joinList(sortedFuels(v.products).map((p) => fuelName(p, lang)), lang);
    const many = v.products.length > 1;
    return lang === 'hi'
      ? `${names} खत्म होने वाला है।`
      : lang === 'hl'
        ? `${names} khatam hone wala hai.`
        : `${names} ${many ? 'are' : 'is'} running out.`;
  }
  if (v.code === 'ORDER_NOW_DEPOT_CLOSED' && v.closedDays.length > 0) {
    const days = dayList(v.closedDays, lang);
    return lang === 'hi' ? `डिपो ${days} को बंद है।` : lang === 'hl' ? `Depot ${days} ko band hai.` : `The depot is closed on ${days}.`;
  }
  return '';
}

/** The banner's words, following the snapshot's severity. */
export function bannerWords(data: LoadPlanData, lang: Lang): string {
  if (data.severity === 'urgent') return [t(W.bannerNow, lang), urgentReason(data, lang)].filter(Boolean).join(' ');
  if (data.severity === 'order_today') return t(W.bannerToday, lang);
  const next = data.verdict.nextOrderOn;
  if (data.verdict.code === 'NEXT_ORDER' && next) {
    const d = dayWords(next, lang);
    return `${t(W.bannerCalm, lang)} ${
      lang === 'hi' ? `अगला ऑर्डर ${d} को।` : lang === 'hl' ? `Agla order ${d} ko.` : `Next order on ${d}.`
    }`;
  }
  if (data.verdict.code === 'NONE_IN_WINDOW' && data.verdict.horizonDays > 0) {
    const n = data.verdict.horizonDays;
    return lang === 'hi'
      ? `अगले ${n} दिन ऑर्डर की ज़रूरत नहीं।`
      : lang === 'hl'
        ? `Agle ${n} din order ki zaroorat nahi.`
        : `No order needed in the next ${n} days.`;
  }
  return t(W.bannerCalm, lang);
}

function severityStatus(s: LoadPlanData['severity']): ReportStatusKey {
  return s === 'urgent' ? 'problem' : s === 'order_today' ? 'attention' : 'ok';
}

function planLine(data: LoadPlanData, lang: Lang): string {
  const d = dayWords(data.planDay, lang);
  return lang === 'hi' ? `${d} का प्लान` : lang === 'hl' ? `${d} ka plan` : `Plan of ${d}`;
}

function timingLine(data: LoadPlanData, lang: Lang): string {
  const o = data.order;
  if (!o) return '';
  const arriveDay = o.arriveDate ?? o.arriveOn;
  const time = o.arriveTime ? clockWords(o.arriveTime, lang) : '';
  const parts: string[] = [];
  if (lang === 'hi') {
    parts.push(`ऑर्डर ${dayWords(o.orderOn, lang)}।`);
    if (o.loadOn) parts.push(`डिपो से लोडिंग ${dayWords(o.loadOn, lang)}।`);
    parts.push(`पहुँचेगा लगभग ${time ? `${time}, ` : ''}${dayWords(arriveDay, lang)}।`);
  } else if (lang === 'hl') {
    parts.push(`Order ${dayWords(o.orderOn, lang)}.`);
    if (o.loadOn) parts.push(`Depot se loading ${dayWords(o.loadOn, lang)}.`);
    parts.push(`Pahunchega lagbhag ${time ? `${time}, ` : ''}${dayWords(arriveDay, lang)}.`);
  } else {
    parts.push(`Order ${dayWords(o.orderOn, lang)}.`);
    if (o.loadOn) parts.push(`Loads at the depot ${dayWords(o.loadOn, lang)}.`);
    parts.push(`Arrives about ${time ? `${time}, ` : ''}${dayWords(arriveDay, lang)}.`);
  }
  return parts.join(' ');
}

/** One line for IndianOil's order form: "25 Nov: Petrol 4,000 L, Diesel 8,000 L". */
function dayOrderLine(cell: LoadPlanData['projection'][number], lang: Lang): string {
  // A day with no tanker has no litres: older stored copies lost the empty object, so it may be missing.
  const byProduct = cell.litresByProduct ?? {};
  const keys = sortedFuels(Object.keys(byProduct));
  const items = keys.map((k) => `${fuelName(k, lang)} ${litres(byProduct[k] ?? 0)}`);
  return `${dayWords(cell.date, lang)}: ${items.join(', ')}`;
}

/** The order lines for every day with a tanker, one per line: what the "Copy order lines" button copies. */
export function orderLinesText(data: LoadPlanData, lang: Lang): string {
  return data.projection
    .filter((c) => !c.depotClosed && c.tankers > 0)
    .map((c) => dayOrderLine(c, lang))
    .join('\n');
}

type Chamber = LoadPlanSnapTruck['chambers'][number];

function chamberIsEstimated(data: LoadPlanData, c: Chamber): boolean {
  if (c.tankNo === null) return false;
  return data.pools.some((p) => p.tanks.some((tk) => tk.tankNo === c.tankNo && tk.estimated));
}

// ── drawing ─────────────────────────────────────────────────────────────────

/** The lorry from the side, its tank split into chambers. Numbers are repeated as text in the list under it. */
function Lorry({ truck, label }: { truck: LoadPlanSnapTruck; label: string }): ReactElement {
  const Wd = 328;
  const tankX = 66;
  const tankW = Wd - tankX - 4;
  const n = Math.max(1, truck.chambers.length);
  const cw = tankW / n;
  const ink = 'var(--kind-tanker-ink)';
  return (
    <svg viewBox={`0 0 ${Wd} 134`} className="block h-auto w-full" role="img" aria-label={label}>
      <title>{label}</title>
      {/* cab */}
      <path d="M4 100V58Q4 48 14 48H38L60 70V100Z" style={{ fill: 'var(--kind-tanker-soft)', stroke: ink }} strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 56H36L50 70H14Z" style={{ fill: 'var(--color-surface)', stroke: ink }} strokeWidth="2" strokeLinejoin="round" />
      {/* tank body */}
      <rect x={tankX} y="30" width={tankW} height="70" rx="14" style={{ fill: 'var(--color-surface)', stroke: ink }} strokeWidth="3" />
      {/* chassis and wheels */}
      <line x1="4" y1="100" x2={Wd - 4} y2="100" style={{ stroke: ink }} strokeWidth="3" />
      {[30, 118, 262, 298].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="108" r="10" style={{ fill: 'var(--color-text)' }} />
          <circle cx={cx} cy="108" r="4" style={{ fill: 'var(--color-surface)' }} />
        </g>
      ))}
      {truck.chambers.map((c, i) => {
        const x = tankX + i * cw;
        const cx = x + cw / 2;
        const empty = !c.product;
        const col = c.product ? fuelColor(c.product) : 'var(--color-text-muted)';
        const letters = c.product ? fuelLetters(c.product).slice(0, 4) : '';
        const chipW = Math.max(26, 9 + letters.length * 7);
        return (
          <g key={i}>
            <rect
              x={x + 3}
              y="34"
              width={cw - 6}
              height="62"
              rx="7"
              style={{ fill: empty ? 'none' : col, stroke: col }}
              fillOpacity={empty ? 0 : 0.2}
              strokeWidth="2.5"
              strokeDasharray={empty ? '5 4' : undefined}
            />
            {!empty ? (
              <g>
                <rect x={cx - chipW / 2} y="8" width={chipW} height="17" rx="8.5" style={{ fill: col }} />
                <text x={cx} y="20.5" fontSize="11" fontWeight="800" textAnchor="middle" fill="#fff">
                  {letters}
                </text>
              </g>
            ) : null}
            <text
              x={cx}
              y="71"
              fontSize={cw < 50 ? 11 : 13}
              fontWeight="800"
              textAnchor="middle"
              style={{ fill: 'var(--color-text)' }}
            >
              {empty ? '–' : indian(c.litres)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A small lorry icon for a strip cell. */
function MiniLorry(): ReactElement {
  return (
    <svg width="34" height="20" viewBox="0 0 40 24" aria-hidden="true" focusable="false">
      <path d="M2 18V9q0-2 2-2h5l4 4v7z" style={{ fill: 'var(--kind-tanker-soft)', stroke: 'var(--kind-tanker-ink)' }} strokeWidth="2" strokeLinejoin="round" />
      <rect x="14" y="5" width="24" height="13" rx="4" style={{ fill: 'var(--color-surface)', stroke: 'var(--kind-tanker-ink)' }} strokeWidth="2" />
      <circle cx="9" cy="20" r="2.6" style={{ fill: 'var(--color-text)' }} />
      <circle cx="30" cy="20" r="2.6" style={{ fill: 'var(--color-text)' }} />
    </svg>
  );
}

function ChamberList({ data, truck, label, lang }: { data: LoadPlanData; truck: LoadPlanSnapTruck; label: string; lang: Lang }): ReactElement {
  return (
    <table className="w-full border-collapse text-body leading-relaxed text-text">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr className="text-left text-body text-text-muted">
          <th scope="col" className="py-1 pr-2 font-semibold">{t(W.chamberCol, lang)}</th>
          <th scope="col" className="py-1 pr-2 font-semibold">{t(W.fuel, lang)}</th>
          <th scope="col" className="py-1 text-right font-semibold">{t(W.litresCol, lang)}</th>
        </tr>
      </thead>
      <tbody>
        {truck.chambers.map((c, i) => {
          const about = c.product && chamberIsEstimated(data, c) ? (lang === 'hi' ? 'लगभग ' : lang === 'hl' ? 'lagbhag ' : 'about ') : '';
          return (
            <tr key={i} className="border-t border-border">
              <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                {i + 1}
                {c.tankNo !== null && c.product ? (
                  <span className="ml-1 text-body font-normal text-text-muted">
                    ({t(W.tank, lang)} {c.tankNo})
                  </span>
                ) : null}
              </th>
              <td className="py-1.5 pr-2">
                {c.product ? (
                  <span className="inline-flex items-center gap-1.5">
                    <FuelSwatch fuelKey={c.product} />
                    {fuelName(c.product, lang)}
                  </span>
                ) : (
                  <span className="text-text-muted">{t(W.empty, lang)}</span>
                )}
              </td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{c.product ? `${about}${litres(c.litres)}` : '–'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StockTable({ data, lang }: { data: LoadPlanData; lang: Lang }): ReactElement | null {
  if (data.pools.length === 0) return null;
  const horizon = Math.max(data.verdict.horizonDays || 0, 7);
  const productCount = new Map<string, number>();
  for (const p of data.pools) productCount.set(p.product, (productCount.get(p.product) ?? 0) + 1);
  const pools = [...data.pools].sort((a, b) => fuelRank(a.product) - fuelRank(b.product));
  return (
    <div className="space-y-2">
      <h3 className="text-subheading leading-relaxed text-text">{t(W.stockHeading, lang)}</h3>
      <table className="w-full border-collapse text-body leading-snug text-text">
        <caption className="sr-only">{t(W.stockHeading, lang)}</caption>
        <thead>
          <tr className="text-left text-body text-text-muted">
            <th scope="col" className="py-1 pr-2 font-semibold">{t(W.fuel, lang)}</th>
            <th scope="col" className="py-1 pr-2 text-right font-semibold">{t(W.stock, lang)}</th>
            <th scope="col" className="py-1 font-semibold">{t(W.daysLeft, lang)}</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((p) => {
            const tanks = (productCount.get(p.product) ?? 0) > 1 && p.tankNos.length > 0 ? ` · ${t(W.tank, lang)} ${p.tankNos.join(', ')}` : '';
            const frac = p.daysLeft === null ? 0 : Math.min(1, p.daysLeft / horizon);
            return (
              <tr key={p.key} className="border-t border-border align-top" data-pool={p.key}>
                <th scope="row" className="py-2 pr-2 text-left font-semibold">
                  <span className="inline-flex flex-wrap items-center gap-x-1.5">
                    <FuelSwatch fuelKey={p.product} />
                    {fuelName(p.product, lang)}
                    <span className="text-body font-normal text-text-muted">{tanks}</span>
                  </span>
                </th>
                <td className="whitespace-nowrap py-2 pr-2 text-right font-semibold tabular-nums">{litres(p.stockL)}</td>
                <td className="py-2">
                  {p.daysLeft === null ? (
                    <span className="text-body leading-snug text-text-muted">{t(W.noDays, lang)}</span>
                  ) : (
                    <div>
                      <div className="font-semibold tabular-nums">
                        {indian(p.daysLeft, 1)} {lang === 'hi' ? 'दिन' : lang === 'hl' ? 'din' : 'days'}
                      </div>
                      <div aria-hidden="true" className="mt-1 h-2 w-full min-w-[56px] overflow-hidden rounded-full border border-border-strong">
                        <div className="h-full" style={{ width: `${Math.max(4, frac * 100)}%`, background: 'var(--kind-tanker-ink)' }} />
                      </div>
                      {p.runOutOn ? (
                        <div className="mt-0.5 text-body font-normal text-text-muted">
                          {lang === 'hi' ? `खत्म: ${dayWords(p.runOutOn, lang)}` : lang === 'hl' ? `Khatam: ${dayWords(p.runOutOn, lang)}` : `Runs out ${dayWords(p.runOutOn, lang)}`}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {p.atLine ? (
                    <div className="mt-1 flex items-center gap-1 text-subheading text-status-attention-ink">
                      <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="shrink-0">
                        <polygon points="10,2 18.5,17 1.5,17" style={{ fill: 'var(--status-attention)' }} />
                        <path d="M10 7.5v4.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
                        <circle cx="10" cy="14.4" r="1" fill="#fff" />
                      </svg>
                      {t(W.atMinimum, lang)}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Strip({ data, lang }: { data: LoadPlanData; lang: Lang }): ReactElement | null {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (data.projection.length === 0) return null;
  const flash = (key: string): void => {
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  };
  const copy = async (key: string, text: string): Promise<void> => {
    if (await copyText(text)) flash(key);
  };
  const anyOrder = data.projection.some((c) => !c.depotClosed && c.tankers > 0);
  return (
    <div className="space-y-2">
      <h3 className="text-subheading leading-relaxed text-text">{t(W.next4, lang)}</h3>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(76px,1fr))] gap-2">
        {data.projection.map((c) => {
          const byProduct = c.litresByProduct ?? {};
          const keys = sortedFuels(Object.keys(byProduct));
          const hasOrder = !c.depotClosed && c.tankers > 0;
          return (
            <li
              key={c.date}
              data-date={c.date}
              data-cell={c.depotClosed ? 'closed' : hasOrder ? 'order' : 'none'}
              className="flex min-w-0 flex-col rounded-md border border-border bg-surface p-1.5 text-center"
            >
              <div className="text-subheading leading-snug text-text">{weekdayAndDate(c.date, lang)}</div>
              <div className="flex min-h-[64px] flex-1 flex-col items-center justify-center gap-0.5 py-1">
                {c.depotClosed ? (
                  <div
                    className="w-full rounded px-1 py-2 text-cta leading-snug text-text"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(135deg, var(--color-border-strong) 0 2px, transparent 2px 8px)',
                    }}
                  >
                    <span className="rounded bg-surface px-1">{t(W.depotClosed, lang)}</span>
                  </div>
                ) : hasOrder ? (
                  <>
                    <div className="flex items-center gap-1">
                      <MiniLorry />
                      <span className="text-subheading tabular-nums text-text">×{c.tankers}</span>
                    </div>
                    {keys.map((k) => (
                      <div key={k} className="text-subheading leading-snug tabular-nums text-text">
                        {fuelLetters(k)} {indian(byProduct[k] ?? 0)}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-body leading-snug text-text-muted">{t(W.noOrder, lang)}</div>
                )}
              </div>
              {hasOrder ? (
                <button
                  type="button"
                  onClick={() => void copy(c.date, dayOrderLine(c, lang))}
                  aria-label={`${t(W.copy, lang)} ${dayWords(c.date, lang)}`}
                  className="mt-1 inline-flex min-h-[48px] w-full items-center justify-center gap-1 rounded-md border border-border-strong bg-surface text-cta text-text"
                >
                  {copied === c.date ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                  {copied === c.date ? t(W.copied, lang) : t(W.copy, lang)}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {anyOrder ? (
        <button
          type="button"
          onClick={() => void copy('all', orderLinesText(data, lang))}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-cta text-text"
        >
          {copied === 'all' ? <Check aria-hidden="true" className="h-5 w-5" /> : <Copy aria-hidden="true" className="h-5 w-5" />}
          {copied === 'all' ? t(W.copied, lang) : t(W.copyAll, lang)}
        </button>
      ) : null}
    </div>
  );
}

function OnTheWay({ data, lang }: { data: LoadPlanData; lang: Lang }): ReactElement | null {
  if (data.inTransit.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-subheading leading-relaxed text-text">{t(W.onTheWay, lang)}</h3>
      <ul className="space-y-1 text-body leading-relaxed text-text">
        {data.inTransit.map((x, i) => {
          const about = x.estimated ? (lang === 'hi' ? 'लगभग ' : lang === 'hl' ? 'lagbhag ' : 'about ') : '';
          const inv = lang === 'hi' ? `इनवॉइस ${dayWords(x.invoiceDate, lang)}` : `invoice ${dayWords(x.invoiceDate, lang)}`;
          return (
            <li key={`${x.product}${i}`} className="flex flex-wrap items-center gap-x-1.5">
              <FuelSwatch fuelKey={x.product} />
              <span className="font-semibold tabular-nums">
                {about}
                {litres(x.litres)}
              </span>
              <span>{fuelName(x.product, lang)},</span>
              <span className="text-text-muted">
                {inv}
                {x.vehicleNo ? `, ${x.vehicleNo}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CreditLine({ data, lang }: { data: LoadPlanData; lang: Lang }): ReactElement | null {
  const c = data.credit;
  // Nothing is said when the figure is unknown, and nothing at all for a manager (no block).
  if (!c || c.shortByRs === null) return null;
  const short = c.shortByRs > 0;
  const text = short
    ? lang === 'hi'
      ? `ऑर्डर से पहले लगभग ${rupees(c.shortByRs, lang)} जमा करें`
      : lang === 'hl'
        ? `Order se pehle lagbhag ${rupees(c.shortByRs, lang)} jama karein`
        : `Deposit about ${rupees(c.shortByRs, lang)} before ordering`
    : t(W.creditEnough, lang);
  const avail =
    c.availableRs !== null
      ? lang === 'hi'
        ? `उपलब्ध: ${rupees(c.availableRs, lang)}`
        : lang === 'hl'
          ? `Available: ${rupees(c.availableRs, lang)}`
          : `Available: ${rupees(c.availableRs, lang)}`
      : null;
  return (
    <Callout status={short ? 'attention' : 'ok'} testId="credit-line">
      <p className="font-semibold">{text}</p>
      {avail ? <p className="text-body text-text-muted">{avail}</p> : null}
    </Callout>
  );
}

function Overlay({ data, lang }: OverlayProps<'load_plan'>): ReactElement {
  const old = planIsOld(data);
  const trucks = data.order?.trucks ?? [];
  const status = severityStatus(data.severity);
  return (
    <div className="space-y-5 p-4" data-kind="load_plan" data-severity={data.severity}>
      <div className="space-y-1">
        <Callout status={status} testId="severity-banner">
          <p className="text-heading leading-relaxed">{bannerWords(data, lang)}</p>
        </Callout>
        <p className="pt-1 text-body leading-relaxed text-text-muted">{planLine(data, lang)}</p>
      </div>
      {old ? (
        <Callout status="waiting" testId="old-plan">
          <p>
            {lang === 'hi'
              ? `यह ${dayWords(data.planDay, lang)} का प्लान है। ऑर्डर देने से पहले तारीख़ देख लें।`
              : lang === 'hl'
                ? `Yeh ${dayWords(data.planDay, lang)} ka plan hai. Order dene se pehle tareekh dekh lein.`
                : `This is the plan of ${dayWords(data.planDay, lang)}. Check the date before you order.`}
          </p>
        </Callout>
      ) : null}
      <section className="space-y-3">
        <h3 className="text-subheading leading-relaxed text-text">{t(W.chambers, lang)}</h3>
        {trucks.length === 0 ? (
          <p className="text-body leading-relaxed text-text-muted">{t(W.noTankerYet, lang)}</p>
        ) : (
          trucks.map((truck, i) => {
            const label =
              trucks.length > 1
                ? lang === 'hi'
                  ? `टैंकर ${i + 1} / ${trucks.length}`
                  : lang === 'hl'
                    ? `Tanker ${i + 1} / ${trucks.length}`
                    : `Tanker ${i + 1} of ${trucks.length}`
                : lang === 'hi'
                  ? 'टैंकर'
                  : 'Tanker';
            return (
              <div key={i} className="space-y-2 rounded-lg border border-border bg-surface p-3" data-truck={i + 1}>
                {trucks.length > 1 ? <div className="text-subheading text-text">{label}</div> : null}
                <div className="rounded-md bg-kind-tanker-soft p-2">
                  <Lorry
                    truck={truck}
                    label={`${label}: ${truck.chambers
                      .map((c) => (c.product ? `${fuelName(c.product, lang)} ${litres(c.litres)}` : t(W.empty, lang)))
                      .join(', ')}`}
                  />
                </div>
                <ChamberList data={data} truck={truck} label={label} lang={lang} />
                {!truck.full ? <p className="text-body leading-snug text-text-muted">{t(W.notFull, lang)}</p> : null}
              </div>
            );
          })
        )}
        {timingLine(data, lang) ? <p className="text-body leading-relaxed text-text">{timingLine(data, lang)}</p> : null}
      </section>
      <StockTable data={data} lang={lang} />
      <Strip data={data} lang={lang} />
      <OnTheWay data={data} lang={lang} />
      <CreditLine data={data} lang={lang} />
      <More label={t(W.moreLabel, lang)}>
        <p>{t(W.moreBody, lang)}</p>
      </More>
    </div>
  );
}

/** The mini signature: a lorry with three chambers. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  const ink = 'var(--kind-tanker-ink)';
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <path d="M2 20V11q0-2 2-2h5l4 4v7z" style={{ fill: 'var(--kind-tanker-soft)', stroke: ink }} strokeWidth="2" strokeLinejoin="round" />
      <rect x="13" y="5" width="25" height="15" rx="4" style={{ fill: 'var(--color-surface)', stroke: ink }} strokeWidth="2" />
      <path d="M21 5v15M29.5 5v15" style={{ stroke: ink }} strokeWidth="1.6" />
      <circle cx="8" cy="23" r="3" style={{ fill: 'var(--color-text)' }} />
      <circle cx="31" cy="23" r="3" style={{ fill: 'var(--color-text)' }} />
    </svg>
  );
}

function tile(data: LoadPlanData, lang: Lang): KindTile | null {
  if (planIsOld(data)) {
    return {
      value: planLine(data, lang),
      sub: lang === 'hi' ? 'नया प्लान आने तक इसे न मानें' : lang === 'hl' ? 'Naya plan aane tak ise na maanein' : 'Too old to act on',
      status: 'waiting',
    };
  }
  const load = orderLoad(data);
  const value =
    data.severity === 'urgent' ? t(W.orderNow, lang) : data.severity === 'order_today' ? t(W.orderToday, lang) : t(W.noOrderToday, lang);
  let sub: string | undefined;
  if (load) {
    sub = `${tankersWords(load.trucks, lang)}: ${loadWords(load, lang)}`;
  } else if (data.verdict.nextOrderOn) {
    const d = dayWords(data.verdict.nextOrderOn, lang);
    sub = lang === 'hi' ? `अगला ऑर्डर ${d}` : lang === 'hl' ? `Agla order ${d}` : `Next order ${d}`;
  } else if (data.verdict.code === 'NONE_IN_WINDOW' && data.verdict.horizonDays > 0) {
    const n = data.verdict.horizonDays;
    sub = lang === 'hi' ? `अगले ${n} दिन ऑर्डर नहीं` : lang === 'hl' ? `Agle ${n} din order nahi` : `No order in the next ${n} days`;
  }
  return { value, ...(sub ? { sub } : {}), status: severityStatus(data.severity) };
}

function alert(data: LoadPlanData, lang: Lang): KindAlert | null {
  if (data.severity === 'calm' || planIsOld(data)) return null;
  if (data.severity === 'urgent') {
    return { headline: t(W.bannerNow, lang).replace(/[।.]$/, ''), line: urgentReason(data, lang) || planLine(data, lang), severity: 'problem' };
  }
  const load = orderLoad(data);
  return {
    headline: t(W.bannerToday, lang).replace(/[।.]$/, ''),
    line: load ? `${tankersWords(load.trucks, lang)}: ${loadWords(load, lang)}` : planLine(data, lang),
    severity: 'attention',
  };
}

function headline(data: LoadPlanData, lang: Lang): string {
  const load = orderLoad(data);
  if (data.severity === 'urgent') {
    const reason = urgentReason(data, lang).replace(/[।.]$/, '');
    return `${t(W.orderNow, lang)}${reason ? `: ${reason}` : ''}`;
  }
  if (data.severity === 'order_today') {
    return `${t(W.orderToday, lang)}${load ? `: ${tankersWords(load.trucks, lang)}` : ''}`;
  }
  const next = data.verdict.nextOrderOn;
  const base = lang === 'hi' ? 'ऑर्डर की ज़रूरत नहीं' : lang === 'hl' ? 'Order ki zaroorat nahi' : 'No order needed';
  if (next) {
    const d = dayWords(next, lang);
    return `${base}; ${lang === 'hi' ? `अगला ${d}` : lang === 'hl' ? `agla ${d}` : `next ${d}`}`;
  }
  return base;
}

function share(data: LoadPlanData, lang: Lang): string {
  const title = lang === 'hi' ? 'अगला टैंकर प्लान' : lang === 'hl' ? 'Agla tanker plan' : 'Next tanker plan';
  const lines = [`${title} · ${data.outletCode} · ${planLine(data, lang)}`, bannerWords(data, lang)];
  const timing = timingLine(data, lang);
  if (timing) lines.push(timing);
  (data.order?.trucks ?? []).forEach((truck, i, all) => {
    const label = all.length > 1 ? (lang === 'hi' ? `टैंकर ${i + 1}` : `Tanker ${i + 1}`) : lang === 'hi' ? 'टैंकर' : 'Tanker';
    const items = truck.chambers.filter((c) => c.product).map((c) => `${fuelName(c.product as string, lang)} ${litres(c.litres)}`);
    lines.push(`${label}: ${items.join(', ')}`);
  });
  const order = orderLinesText(data, lang);
  if (order) lines.push('', order);
  // The credit block is the owner's money: it is never part of the shared text.
  return lines.join('\n');
}

/** The sentence the "Order now" button types in the chat: what the plan says to order, as the dealer would say it. */
export function orderSentence(load: Load, lang: Lang): string {
  const items = loadWords(load, lang);
  return lang === 'hi' ? `${items} का ऑर्डर लगा दीजिए` : lang === 'hl' ? `${items} ka order laga dijiye` : `Please place an order for ${items}`;
}

/**
 * "Order now": opens the chat with the order typed in the message box, NOT sent. The dealer reads it,
 * changes a litre figure if they like, and taps send themselves; the app never orders fuel by a tap
 * on a report. Only for the owner (a manager's fuel request is passed to the owners by the chat),
 * only when the plan says to order, and not from a plan that is more than two days old.
 */
function actions(data: LoadPlanData, _report: unknown, ctx: ReportActionContext): ReportAction[] {
  if (!ctx.isOwner || data.severity === 'calm' || planIsOld(data, ctx.now())) return [];
  const load = orderLoad(data);
  if (!load || load.byProduct.length === 0) return [];
  return [
    {
      id: 'order-now',
      icon: ShoppingCart,
      label: W.orderNow,
      run: () => ctx.draftInChat(orderSentence(load, ctx.lang)),
    },
  ];
}

export const view: KindView<'load_plan'> = {
  kind: 'load_plan',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
  actions,
};
