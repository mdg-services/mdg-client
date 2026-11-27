import { ArrowLeftRight } from 'lucide-react';
import { useId, type ReactElement } from 'react';

import { Num, SectionCard, StatTile, type DeltaChipProps } from '@/components/kit';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { DsrLedgerRow, DsrSalesBlock, DsrSalesData, DsrSnapReceiptSource } from '@dk/shared/types';

import { sayWords, type KindTile, type KindView, type OverlayProps, type Words } from '../types';

import {
  dayWords,
  dayWithWeekday,
  indian,
  joinList,
  lastWeekday,
  litres,
  MINUS,
  fuelColor,
  fuelLetters,
  fuelName,
} from './dsr_sales/fmt';
import { FuelBand, Lead, More } from './dsr_sales/ui';

/**
 * Daily sales (DSR), ADR 0056 §2: the ruled ledger table, the dealer's own DSR book, with a
 * band of colour per fuel, a pinned Date column and a 3-box glance strip over each fuel.
 * This is the only report in the app with rows and columns of numbers.
 *
 * The sales sheet never carries a verdict: nothing here says "short", "over" or "within
 * limit". A corrected copy says it is corrected and nothing else (the figures that changed
 * were variation figures). Yesterday not worked out yet is drawn as "--", never as 0.
 */

// ── words ───────────────────────────────────────────────────────────────────

const W = {
  sold: { hi: 'बिक्री', hl: 'Bikri', en: 'Sold' },
  stockMorning: { hi: 'आज सुबह का स्टॉक', hl: 'Aaj subah ka stock', en: 'Stock this morning' },
  received: { hi: 'आया माल', hl: 'Aaya maal', en: 'Received' },
  notWorkedOut: { hi: 'अभी निकली नहीं', hl: 'Abhi nikli nahi', en: 'Not worked out yet' },
  noCompare: {
    hi: 'तुलना के लिए अभी दिन कम हैं',
    hl: 'Compare ke liye abhi din kam hain',
    en: 'Not enough weeks to compare yet',
  },
  viaPortal: { hi: 'पोर्टल के रिकॉर्ड से', hl: 'Portal ke record se', en: 'from the portal record' },
  byHand: { hi: 'हाथ से भरा गया', hl: 'Haath se bhara gaya', en: 'entered by hand' },
  fromDip: { hi: 'टंकी डिप से निकाला', hl: 'Tanki dip se nikala', en: 'worked out from the tank dip' },
  byHandShort: { hi: 'हाथ से', hl: 'haath se', en: 'by hand' },
  fromDipShort: { hi: 'डिप से', hl: 'dip se', en: 'from dip' },
  revisedBox: {
    hi: 'यह सुधारी हुई कॉपी है। पुरानी कॉपी की जगह इसे देखें।',
    hl: 'Yeh sudhari hui copy hai. Purani copy ki jagah ise dekhein.',
    en: 'This is a corrected copy. Use this one in place of the earlier copy.',
  },
  jumpTo: { hi: 'ईंधन चुनें', hl: 'Fuel chunein', en: 'Jump to a fuel' },
  scrollHint: { hi: 'साइड में सरकाकर देखें', hl: 'Side mein sarkakar dekhein', en: 'Scroll sideways to see all columns' },
  // table
  date: { hi: 'तारीख़', hl: 'Tareekh', en: 'Date' },
  dip: { hi: 'डिप', hl: 'Dip', en: 'Dip' },
  water: { hi: 'पानी', hl: 'Paani', en: 'Water' },
  opening: { hi: 'शुरू का स्टॉक', hl: 'Shuru ka stock', en: 'Opening stock' },
  receipt: { hi: 'आया माल', hl: 'Aaya maal', en: 'Received' },
  totalStock: { hi: 'कुल स्टॉक', hl: 'Kul stock', en: 'Total stock' },
  testing: { hi: 'टेस्टिंग', hl: 'Testing', en: 'Testing' },
  salesCol: { hi: 'बिक्री', hl: 'Bikri', en: 'Sales' },
  month: { hi: 'इस महीने', hl: 'Is mahine', en: 'This month' },
  remarks: { hi: 'टिप्पणी', hl: 'Tippani', en: 'Remarks' },
  reportDay: { hi: 'रिपोर्ट का दिन', hl: 'Report ka din', en: 'Report day' },
  openDay: { hi: 'चालू दिन', hl: 'Chalu din', en: 'Open day' },
  newMonth: { hi: 'नया महीना', hl: 'Naya mahina', en: 'New month' },
  openNote: {
    hi: 'चालू दिन की बिक्री अगली रीडिंग पर निकलती है।',
    hl: 'Chalu din ki bikri agli reading par nikalti hai.',
    en: 'Sales for the open day are worked out on the next reading.',
  },
  moreLabel: { hi: 'और देखें', hl: 'Aur dekhein', en: 'More details' },
  legendReceipt: {
    hi: 'आया माल: "हाथ से" यानी किसी ने खुद भरा। "डिप से" यानी हमने टंकी की डिप से निकाला। बाकी पोर्टल के रिकॉर्ड से है।',
    hl: 'Aaya maal: "haath se" yaani kisi ne khud bhara. "dip se" yaani humne tanki ki dip se nikala. Baaki portal ke record se hai.',
    en: 'Received: "by hand" means someone typed it in. "from dip" means we worked it out from the tank dip. Anything else is from the portal record.',
  },
  legendTank: {
    hi: 'T4 का मतलब टंकी 4।',
    hl: 'T4 ka matlab tanki 4.',
    en: 'T4 means tank 4.',
  },
  legendRemarks: {
    hi: 'टिप्पणी वैसी ही दिखाई गई है जैसी लिखी गई थी।',
    hl: 'Tippani waisi hi dikhai gayi hai jaisi likhi gayi thi.',
    en: 'Remarks are shown as they were typed.',
  },
  retired: { hi: 'बंद नोज़ल (मीटर रुका हुआ)', hl: 'Band nozzle (meter ruka hua)', en: 'Retired nozzles (meter stopped)' },
  carriedOn: { hi: 'तक का', hl: 'tak ka', en: 'as of' },
} satisfies Record<string, Words>;

function t(w: Words, lang: Lang): string {
  return sayWords(w, lang);
}

// ── pure helpers (also used by the variation view) ──────────────────────────

export interface SalesProduct {
  key: string;
  tankNos: number[];
  retiredNozzles?: number[];
  sales: DsrSalesBlock;
}

/** True when this fuel's sales are worked out and shown: a closed day and a litre figure. */
export function isSold(sales: DsrSalesBlock): sales is DsrSalesBlock & { soldL: number } {
  return sales.state === 'closed' && sales.soldL !== null;
}

/** The change against the same weekday last week, as a whole percent; null when there is nothing honest to compare. */
export function weekCompare(sales: DsrSalesBlock): { pct: number; lastDay: string } | null {
  const last = sales.sameWeekdayLastWeek;
  if (!isSold(sales) || !last || !(last.soldL > 0)) return null;
  return { pct: Math.round(((sales.soldL - last.soldL) / last.soldL) * 100), lastDay: last.day };
}

/** "+6% vs last Monday" in the reader's language; null when there is no comparison. */
export function compareWords(sales: DsrSalesBlock, lang: Lang): string | null {
  const c = weekCompare(sales);
  if (!c) return null;
  const when = lastWeekday(c.lastDay, lang);
  if (c.pct === 0) {
    return lang === 'hi' ? `${when} जितनी` : lang === 'hl' ? `${when} jitni` : `same as ${when}`;
  }
  const n = `${c.pct > 0 ? '+' : MINUS}${Math.abs(c.pct)}%`;
  return lang === 'hi' ? `${when} से ${n}` : lang === 'hl' ? `${when} se ${n}` : `${n} vs ${when}`;
}

function receiptSourceWords(src: DsrSnapReceiptSource | null, lang: Lang): string | null {
  if (src === 'manual') return t(W.byHand, lang);
  if (src === 'inferred') return t(W.fromDip, lang);
  if (src === 'iras') return t(W.viaPortal, lang);
  return null;
}

/** The IST day a product's sales are for: the closed day, or the last closed row of the ledger. */
function salesDayOf(sales: DsrSalesBlock): string | null {
  return sales.closedDay ?? null;
}

/** "10,430 L of Diesel" per fuel, as one sentence per distinct day. */
function leadSentences(products: readonly SalesProduct[], lang: Lang): string[] {
  const sold = products.filter((p) => isSold(p.sales));
  const pending = products.filter((p) => !isSold(p.sales));
  const out: string[] = [];
  const days = [...new Set(sold.map((p) => salesDayOf(p.sales) ?? ''))].sort();
  for (const day of days) {
    const group = sold.filter((p) => (salesDayOf(p.sales) ?? '') === day);
    const dayText = day ? dayWords(day, lang) : '';
    const items = group.map((p) => {
      const l = litres(p.sales.soldL as number);
      const f = fuelName(p.key, lang);
      return lang === 'en' ? `${l} of ${f}` : `${f} ${l}`;
    });
    const list = joinList(items, lang);
    if (lang === 'hi') out.push(`${dayText ? `${dayText} को ` : ''}आपने ${list} बेचा।`);
    else if (lang === 'hl') out.push(`${dayText ? `${dayText} ko ` : ''}aapne ${list} becha.`);
    else out.push(`${dayText ? `On ${dayText} you` : 'You'} sold ${list}.`);
  }
  if (pending.length > 0) {
    const names = joinList(pending.map((p) => fuelName(p.key, lang)), lang);
    out.push(
      lang === 'hi'
        ? `${names} की बिक्री अभी निकली नहीं है। हम ठीक कर रहे हैं।`
        : lang === 'hl'
          ? `${names} ki bikri abhi nikli nahi hai. Hum theek kar rahe hain.`
          : `Sales for ${names} are not worked out yet. We are fixing it.`,
    );
  }
  return out;
}

/** The one plain sentence an overlay opens with. */
export function salesLead(products: readonly SalesProduct[], lang: Lang): string {
  return leadSentences(products, lang).join(' ');
}

/** Plain-text lines for a WhatsApp share, one per fuel. */
export function salesShareLines(products: readonly SalesProduct[], lang: Lang): string[] {
  return products.map((p) => {
    const head = `${fuelName(p.key, lang)} (${fuelLetters(p.key)})`;
    const parts: string[] = [];
    parts.push(`${t(W.sold, lang)}: ${isSold(p.sales) ? litres(p.sales.soldL) : t(W.notWorkedOut, lang)}`);
    if (p.sales.stockNowL !== null) parts.push(`${t(W.stockMorning, lang)}: ${litres(p.sales.stockNowL)}`);
    if (p.sales.receiptL !== null) parts.push(`${t(W.received, lang)}: ${litres(p.sales.receiptL)}`);
    return `${head}: ${parts.join(' · ')}`;
  });
}

// ── drawing ─────────────────────────────────────────────────────────────────

/**
 * The sheet's own column words, as the dealer's printed DSR and the shared card carry them
 * (the manager fills in the same table by hand). English and Hinglish headings are set in
 * capitals by the stylesheet, the way the sheet prints them.
 */
const SHEET = {
  date: { hi: 'दिनांक', hl: 'Tareekh', en: 'Date' },
  tank: { hi: 'टैंक', hl: 'Tank', en: 'Tank' },
  dip: { hi: 'डिप', hl: 'Dip', en: 'Dip' },
  waterDip: { hi: 'पानी डिप', hl: 'Water dip', en: 'Water dip' },
  stock: { hi: 'स्टॉक', hl: 'Stock', en: 'Stock' },
  openingStock: { hi: 'शुरुआती स्टॉक', hl: 'Opening stock', en: 'Opening stock' },
  receipt: { hi: 'आवक', hl: 'Receipt', en: 'Receipt' },
  totalStock: { hi: 'कुल स्टॉक', hl: 'Total stock', en: 'Total stock' },
  meter: { hi: 'शुरुआती मीटर रीडिंग', hl: 'Opening meter reading', en: 'Opening meter reading' },
  testing: { hi: 'टेस्टिंग', hl: 'Testing', en: 'Testing' },
  sales: { hi: 'बिक्री', hl: 'Bikri', en: 'Sales' },
  cumulative: { hi: 'कुल बिक्री', hl: 'Kul bikri', en: 'Cumulative sales' },
  thisMonth: { hi: 'इस माह', hl: 'is mahine', en: 'this month' },
  remarks: { hi: 'टिप्पणी', hl: 'Remarks', en: 'Remarks' },
  today: { hi: 'आज', hl: 'Aaj', en: 'Today' },
  legendOpen: {
    hi: '— आज की बिक्री कल की रीडिंग से तय होगी',
    hl: '— Aaj ki bikri kal ki reading se tay hogi',
    en: '— today’s sales close on tomorrow’s reading',
  },
  legendManual: { hi: 'रसीद हाथ से भरी गई', hl: 'Receipt haath se bhari gayi', en: 'receipt entered by hand' },
  legendInferred: {
    hi: 'पोर्टल पर रसीद नहीं थी, टंकी की डिप बढ़ने से आँकी गई',
    hl: 'Portal par receipt nahi thi, tank ki dip badhne se aanki gayi',
    en: 'no receipt on the portal; read from the rise in the tank dip',
  },
  legendLegacy: {
    hi: 'एक ही डिप वाली पंक्ति टंकीवार रीडिंग से पहले की है',
    hl: 'Ek dip wali line tank-wise reading se pehle ki hai',
    en: 'a row with one dip predates per-tank readings',
  },
} satisfies Record<string, Words>;

interface LedgerProps {
  product: SalesProduct;
  lang: Lang;
}

function num(n: number | null | undefined, decimals = 0): string {
  return n === null || n === undefined ? '—' : indian(n, decimals);
}

/** The tank columns the sheet prints: one group per tank when the fuel spans several. */
function tankColumns(product: SalesProduct): { tankNos: number[]; perTank: boolean } {
  const seen: number[] = [...product.tankNos];
  for (const r of product.sales.rows) for (const tk of r.tanks ?? []) if (!seen.includes(tk.tankNo)) seen.push(tk.tankNo);
  const perTank = seen.length > 1 && product.sales.rows.some((r) => (r.tanks?.length ?? 0) > 0);
  return { tankNos: seen, perTank };
}

/**
 * The DSR sheet, exactly as the manager writes it and the card printed it: Date | Tank (Dip,
 * Water dip[, Stock]) | Opening stock | Receipt | Total stock | Opening meter reading (1…N) |
 * Testing | Sales | Cumulative sales (this month) | Remarks. The Date column is pinned; the
 * rest scrolls sideways.
 */
function Ledger({ product, lang }: LedgerProps): ReactElement | null {
  const rows = [...product.sales.rows].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (rows.length === 0) return null;
  const nozzles = [...new Set(rows.flatMap((r) => r.pumps.map((p) => p.nozzleNo)))].sort((a, b) => a - b);
  const pumpCount = Math.max(1, nozzles.length);
  const cols = tankColumns(product);
  const tankName = (nos: readonly number[]): string =>
    nos.length === 0 ? t(SHEET.tank, lang) : `${t(SHEET.tank, lang)} ${nos.join('/')}`;
  const anyManual = rows.some((r) => r.receiptSource === 'manual');
  const anyInferred = rows.some((r) => r.receiptSource === 'inferred');
  const anyLegacy = cols.perTank && rows.some((r) => !r.tanks || r.tanks.length === 0);
  const caption = `${fuelName(product.key, lang)} (${fuelLetters(product.key)}), ${
    lang === 'hi' ? 'रोज़ाना बिक्री रिपोर्ट' : lang === 'hl' ? 'roz ki bikri report' : 'daily sales report'
  }`;
  // Headings: the sheet's words, small capitals in English and Hinglish, never below 14 px.
  const caps = lang === 'hi' ? '' : 'uppercase tracking-[0.04em]';
  const th = `whitespace-nowrap border-b border-l border-border bg-surface-2 px-3 py-2 text-center text-meta font-semibold leading-snug text-text-muted ${caps}`;
  const dipHeads = (key: string, withStock: boolean): ReactElement[] => [
    <th key={`${key}d`} scope="col" className={th}>{t(SHEET.dip, lang)}</th>,
    <th key={`${key}w`} scope="col" className={th}>{t(SHEET.waterDip, lang)}</th>,
    ...(withStock ? [<th key={`${key}s`} scope="col" className={th}>{t(SHEET.stock, lang)}</th>] : []),
  ];
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-border-strong bg-surface">
        <div role="region" tabIndex={0} aria-label={caption} className="overflow-x-auto focus-visible:outline-none">
          <table className="w-max min-w-full border-collapse text-body leading-snug">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className={`${th} sticky left-0 z-20 min-w-24 border-l-0 text-left`}>
                  {t(SHEET.date, lang)}
                </th>
                {cols.perTank ? (
                  cols.tankNos.map((no) => (
                    <th key={no} colSpan={3} scope="colgroup" className={th}>
                      {tankName([no])}
                    </th>
                  ))
                ) : (
                  <th colSpan={2} scope="colgroup" className={th}>
                    {tankName(cols.tankNos)}
                  </th>
                )}
                <th rowSpan={2} scope="col" className={th}>{t(SHEET.openingStock, lang)}</th>
                <th rowSpan={2} scope="col" className={th}>{t(SHEET.receipt, lang)}</th>
                <th rowSpan={2} scope="col" className={th}>{t(SHEET.totalStock, lang)}</th>
                <th colSpan={pumpCount} scope="colgroup" className={th}>{t(SHEET.meter, lang)}</th>
                <th rowSpan={2} scope="col" className={th}>{t(SHEET.testing, lang)}</th>
                <th rowSpan={2} scope="col" className={th}>{t(SHEET.sales, lang)}</th>
                <th rowSpan={2} scope="col" className={th}>
                  {t(SHEET.cumulative, lang)}
                  <span className="block normal-case tracking-normal">({t(SHEET.thisMonth, lang)})</span>
                </th>
                <th rowSpan={2} scope="col" className={`${th} min-w-[10rem]`}>{t(SHEET.remarks, lang)}</th>
              </tr>
              <tr>
                {cols.perTank ? cols.tankNos.flatMap((no) => dipHeads(String(no), true)) : dipHeads('one', false)}
                {Array.from({ length: pumpCount }, (_, i) => (
                  <th key={`p${i}`} scope="col" className={th}>
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <LedgerRow
                  key={row.day}
                  row={row}
                  nozzles={nozzles}
                  pumpCount={pumpCount}
                  cols={cols}
                  newMonth={i > 0 && row.newMonth}
                  lang={lang}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-surface to-transparent"
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-meta leading-snug text-text-muted">
        <ArrowLeftRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t(W.scrollHint, lang)}
      </p>
      {rows.some((r) => r.open) || anyManual || anyInferred || anyLegacy ? (
        <ul className="mt-1 space-y-0.5 text-meta leading-snug text-text-muted">
          {rows.some((r) => r.open) ? <li>{t(SHEET.legendOpen, lang)}</li> : null}
          {anyManual ? (
            <li>
              <Mark letter="M" /> {t(SHEET.legendManual, lang)}
            </li>
          ) : null}
          {anyInferred ? (
            <li>
              <Mark letter="D" /> {t(SHEET.legendInferred, lang)}
            </li>
          ) : null}
          {anyLegacy ? <li>{t(SHEET.legendLegacy, lang)}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** The sheet's small M / D beside a receipt typed by hand or read from the dip. */
function Mark({ letter }: { letter: 'M' | 'D' }): ReactElement {
  return <sup className="ml-0.5 text-micro font-semibold text-text-muted">{letter}</sup>;
}

function LedgerRow({
  row,
  nozzles,
  pumpCount,
  cols,
  newMonth,
  lang,
}: {
  row: DsrLedgerRow;
  nozzles: number[];
  pumpCount: number;
  cols: { tankNos: number[]; perTank: boolean };
  newMonth: boolean;
  lang: Lang;
}): ReactElement {
  // A month starting inside the sheet is ruled off, so the cumulative dropping back reads as a new month.
  const rule = newMonth ? 'border-t-2 border-t-text' : 'border-t border-border';
  const cell = `whitespace-nowrap border-l border-border px-3 py-2.5 text-right align-top tabular-nums ${rule}`;
  // A totaliser reading is a serial number on the dispenser, not a quantity: printed as the
  // dispenser shows it (1234567), never grouped as 12,34,567.
  const reading = (i: number): string => {
    const no = nozzles[i];
    const r = no === undefined ? undefined : row.pumps.find((x) => x.nozzleNo === no)?.reading;
    return r === null || r === undefined ? '—' : String(Math.round(r));
  };
  const byTank = new Map((row.tanks ?? []).map((tk) => [tk.tankNo, tk]));
  const legacy = cols.perTank && byTank.size === 0;
  const tankCells = cols.perTank
    ? cols.tankNos.flatMap((no, i) => {
        const tk = byTank.get(no);
        // A row from before per-tank readings puts its single dip under the first tank.
        const dip = tk ? tk.dip : legacy && i === 0 ? row.dip : null;
        const water = tk ? tk.waterDip : legacy && i === 0 ? row.waterDip : null;
        return [
          <td key={`${no}d`} className={cell}>{num(dip, 1)}</td>,
          <td key={`${no}w`} className={cell}>{num(water, 1)}</td>,
          <td key={`${no}s`} className={cell}>{num(tk?.stockL ?? null)}</td>,
        ];
      })
    : [
        <td key="d" className={cell}>{num(row.dip, 1)}</td>,
        <td key="w" className={cell}>{num(row.waterDip, 1)}</td>,
      ];
  const mark = row.receiptSource === 'manual' ? <Mark letter="M" /> : row.receiptSource === 'inferred' ? <Mark letter="D" /> : null;
  return (
    <tr className={row.open ? 'bg-surface-2' : 'bg-surface'} data-day={row.day} data-open={row.open ? 'true' : undefined}>
      <th
        scope="row"
        className={`sticky left-0 z-10 min-w-24 bg-inherit px-3 py-2.5 text-left align-top font-semibold text-text ${rule}`}
      >
        <div className="whitespace-nowrap">{dayWords(row.day, lang)}</div>
        {row.open ? (
          <div className={`text-meta font-semibold text-text-muted ${lang === 'hi' ? '' : 'uppercase tracking-[0.04em]'}`}>
            {t(SHEET.today, lang)}
          </div>
        ) : null}
        {newMonth ? <div className="text-meta font-medium text-text-muted">{t(W.newMonth, lang)}</div> : null}
      </th>
      {tankCells}
      <td className={cell}>{num(row.openingStockL)}</td>
      <td className={cell}>
        {num(row.receiptL)}
        {mark}
      </td>
      <td className={`${cell} font-semibold`}>{num(row.totalStockL)}</td>
      {Array.from({ length: pumpCount }, (_, i) => (
        <td key={`p${i}`} className={cell}>
          {reading(i)}
        </td>
      ))}
      <td className={cell}>{num(row.testingL)}</td>
      <td className={`${cell} font-semibold`}>{row.open || row.soldL === null ? '—' : num(row.soldL)}</td>
      <td className={cell}>{row.open || row.monthToDateL === null ? '—' : num(row.monthToDateL)}</td>
      <td className={`min-w-[10rem] max-w-[16rem] whitespace-normal border-l border-border px-3 py-2.5 text-left align-top ${rule}`}>
        {row.remarks ?? ''}
      </td>
    </tr>
  );
}

/** The 14 closed days of one fuel as bars, with the sentence a screen reader gets instead of the picture. */
function trendOf(product: SalesProduct, lang: Lang): { bars: NonNullable<Parameters<typeof StatTile>[0]['bars']>; average: number } | null {
  const days = product.sales.trend.filter((d) => Number.isFinite(d.soldL)).slice(-14);
  if (days.length < 2) return null;
  const average = days.reduce((n, d) => n + d.soldL, 0) / days.length;
  const high = days.reduce((a, d) => (d.soldL > a.soldL ? d : a), days[0]!);
  const low = days.reduce((a, d) => (d.soldL < a.soldL ? d : a), days[0]!);
  const summary = translate(lang, 'rv2.sales.barsSummary', {
    n: days.length,
    fuel: fuelName(product.key, lang),
    high: litres(high.soldL),
    highDay: dayWords(high.day, lang),
    low: litres(low.soldL),
    lowDay: dayWords(low.day, lang),
    avg: litres(average),
  });
  return {
    average,
    bars: {
      data: days.map((d) => ({ label: dayWithWeekday(d.day, lang), value: d.soldL })),
      average,
      summary,
    },
  };
}

/** The change against the same weekday last week, as the kit's delta chip; null when there is nothing honest to compare. */
function deltaOf(sales: DsrSalesBlock, lang: Lang): DeltaChipProps | null {
  const c = weekCompare(sales);
  if (!c) return null;
  const against = lastWeekday(c.lastDay, lang);
  if (c.pct === 0) return { dir: 'same', against };
  return { dir: c.pct > 0 ? 'up' : 'down', n: Math.abs(c.pct), unit: '%', against };
}

/**
 * One fuel's block: the fuel's band, the day's sales as one big number with the change against last
 * week and the 14 days as bars, three smaller figures, then the dealer's own sheet in a card.
 */
function FuelSales({ product, lang }: { product: SalesProduct; lang: Lang }): ReactElement {
  const s = product.sales;
  const sold = isSold(s);
  const day = s.closedDay ? dayWords(s.closedDay, lang) : '';
  const delta = sold ? deltaOf(s, lang) : null;
  const trend = trendOf(product, lang);
  const unit = translate(lang, 'kit.unit.litres');
  const fuel = fuelName(product.key, lang);
  const soldLabel = day ? (lang === 'hi' ? `${day} की बिक्री` : lang === 'hl' ? `${day} ki bikri` : `Sold ${day}`) : t(W.sold, lang);
  const recvLabel = day ? (lang === 'hi' ? `${day} को आया` : lang === 'hl' ? `${day} ko aaya` : `Received ${day}`) : t(W.received, lang);
  const note = sold ? (delta ? undefined : t(W.noCompare, lang)) : t(W.notWorkedOut, lang);
  const caption = [note, trend ? translate(lang, 'rv2.sales.avgCaption', { n: trend.bars.data.length, avg: litres(trend.average) }) : null]
    .filter(Boolean)
    .join(' · ');
  const aria = (label: string, value: string): string => `${fuel}, ${label}: ${value}`;
  const num = (n: number | null): { node: ReactElement | string; spoken: string } =>
    n === null ? { node: '—', spoken: '—' } : { node: <Num value={Math.round(n)} />, spoken: litres(n) };
  const soldVal = num(sold ? s.soldL : null);
  const stockVal = num(s.stockNowL);
  const recvVal = num(s.receiptL);
  const monthVal = num(s.monthToDateL);
  return (
    <div className="space-y-3">
      <FuelBand fuelKey={product.key} tankNos={product.tankNos} lang={lang} />
      <StatTile
        label={soldLabel}
        value={soldVal.node}
        unit={sold ? unit : undefined}
        delta={delta ?? undefined}
        bars={sold && trend ? trend.bars : undefined}
        caption={caption || undefined}
        ariaLabel={aria(soldLabel, soldVal.spoken)}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
        <StatTile
          label={t(W.stockMorning, lang)}
          value={stockVal.node}
          unit={s.stockNowL !== null ? unit : undefined}
          ariaLabel={aria(t(W.stockMorning, lang), stockVal.spoken)}
        />
        <StatTile
          label={recvLabel}
          value={recvVal.node}
          unit={s.receiptL !== null ? unit : undefined}
          caption={s.receiptL !== null ? (receiptSourceWords(s.receiptSource, lang) ?? undefined) : undefined}
          ariaLabel={aria(recvLabel, recvVal.spoken)}
        />
        {s.monthToDateL !== null ? (
          <StatTile
            label={translate(lang, 'rv2.sales.month')}
            value={monthVal.node}
            unit={unit}
            caption={day ? translate(lang, 'rv2.sales.monthCaption', { day }) : undefined}
            ariaLabel={aria(translate(lang, 'rv2.sales.month'), monthVal.spoken)}
          />
        ) : null}
      </div>
      {s.rows.length > 0 ? (
        <SectionCard title={translate(lang, 'rv2.sales.sheetTitle', { fuel })}>
          <Ledger product={product} lang={lang} />
        </SectionCard>
      ) : null}
    </div>
  );
}

/**
 * The sales body for a list of fuels: lead sentence, optional fuel jump control, one block
 * per fuel and the "More" legend. Exported so the variation view can show its sales sheet.
 */
export function SalesSheet({
  products,
  lang,
  revised = false,
  showLead = true,
}: {
  products: readonly SalesProduct[];
  lang: Lang;
  revised?: boolean;
  showLead?: boolean;
}): ReactElement {
  const uid = useId().replace(/:/g, '');
  const anchor = (i: number): string => `${uid}-fuel-${i}`;
  const retired = products.filter((p) => (p.retiredNozzles?.length ?? 0) > 0);
  const hasRemarks = products.some((p) => p.sales.rows.some((r) => r.remarks));
  return (
    <div className="space-y-5">
      {showLead ? <Lead>{salesLead(products, lang)}</Lead> : null}
      {revised ? (
        <p className="rounded-md border border-border bg-surface-2 p-3 text-body leading-relaxed text-text">{t(W.revisedBox, lang)}</p>
      ) : null}
      {products.length >= 3 ? (
        <nav aria-label={t(W.jumpTo, lang)} className="flex flex-wrap gap-2">
          {products.map((p, i) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                const el = document.getElementById(anchor(i));
                if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="inline-flex min-h-12 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-cta text-text"
            >
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: fuelColor(p.key) }} />
              {fuelName(p.key, lang)}
            </button>
          ))}
        </nav>
      ) : null}
      {products.map((p, i) => (
        <section key={p.key} id={anchor(i)} className="scroll-mt-4">
          <FuelSales product={p} lang={lang} />
        </section>
      ))}
      {hasRemarks || retired.length > 0 ? (
        <More label={t(W.moreLabel, lang)}>
          {hasRemarks ? <p>{t(W.legendRemarks, lang)}</p> : null}
          {retired.map((p) => (
            <p key={p.key}>
              {t(W.retired, lang)}: {fuelName(p.key, lang)} {p.retiredNozzles!.join(', ')}
            </p>
          ))}
        </More>
      ) : null}
    </div>
  );
}

/** The sales sheet's products from a snapshot. */
function productsOf(data: DsrSalesData): SalesProduct[] {
  return data.products.map((p) => ({
    key: p.key,
    tankNos: p.tankNos,
    ...(p.retiredNozzles ? { retiredNozzles: p.retiredNozzles } : {}),
    sales: p.sales,
  }));
}

function Overlay({ data, lang }: OverlayProps<'dsr_sales'>): ReactElement {
  return (
    <div className="space-y-5 p-4" data-kind="dsr_sales">
      <SalesSheet products={productsOf(data)} lang={lang} revised={data.revised} />
    </div>
  );
}

/** The mini signature: a ruled grid with a filled header row. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="36" height="24" rx="3" fill="none" stroke="var(--kind-dsr-ink)" strokeWidth="2" />
      <path d="M2 5a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v4H2z" fill="var(--kind-dsr-ink)" />
      <path d="M2 17h36M14 9v17M26 9v17" stroke="var(--kind-dsr-ink)" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function tile(data: DsrSalesData, lang: Lang): KindTile | null {
  const products = productsOf(data);
  if (products.length === 0) return null;
  const sold = products.filter((p) => isSold(p.sales));
  if (sold.length === 0) {
    return { value: '--', sub: t(W.notWorkedOut, lang) + (lang === 'en' ? '. We are fixing it' : lang === 'hi' ? '। हम ठीक कर रहे हैं' : '. Hum theek kar rahe hain'), status: 'waiting' };
  }
  const value =
    sold.length === 1
      ? litres(sold[0]!.sales.soldL as number)
      : sold.map((p) => `${fuelName(p.key, lang)} ${litres(p.sales.soldL as number)}`).join(' · ');
  const parts: string[] = [];
  if (sold.length === 1) {
    parts.push(fuelName(sold[0]!.key, lang));
    const c = compareWords(sold[0]!.sales, lang);
    if (c) parts.push(c);
  } else {
    const withCmp = sold.filter((p) => weekCompare(p.sales));
    if (withCmp.length > 0) {
      const sample = weekCompare(withCmp[0]!.sales)!;
      const when = lastWeekday(sample.lastDay, lang);
      const each = withCmp
        .map((p) => `${fuelName(p.key, lang)} ${weekCompare(p.sales)!.pct >= 0 ? '+' : MINUS}${Math.abs(weekCompare(p.sales)!.pct)}%`)
        .join(', ');
      parts.push(lang === 'hi' ? `${when} से ${each}` : lang === 'hl' ? `${when} se ${each}` : `${each} vs ${when}`);
    }
  }
  const pending = products.filter((p) => !isSold(p.sales));
  if (pending.length > 0) {
    const names = joinList(pending.map((p) => fuelName(p.key, lang)), lang);
    parts.push(lang === 'hi' ? `${names}: अभी निकली नहीं` : lang === 'hl' ? `${names}: abhi nikli nahi` : `${names}: not worked out yet`);
  }
  const day = sold[0]!.sales.closedDay;
  const sub = [day ? dayWords(day, lang) : null, ...parts].filter(Boolean).join(' · ');
  return { value, sub, status: pending.length > 0 ? 'waiting' : 'info' };
}

function headline(data: DsrSalesData, lang: Lang): string {
  const products = productsOf(data);
  const sold = products.filter((p) => isSold(p.sales));
  if (sold.length === 0) {
    return lang === 'hi' ? 'बिक्री अभी निकली नहीं है' : lang === 'hl' ? 'Bikri abhi nikli nahi hai' : 'Sales not worked out yet';
  }
  const list = sold.map((p) => `${fuelName(p.key, lang)} ${litres(p.sales.soldL as number)}`).join(', ');
  return lang === 'hi' ? `बिक्री: ${list}` : lang === 'hl' ? `Bikri: ${list}` : `Sold: ${list}`;
}

function share(data: DsrSalesData, lang: Lang): string {
  const title = lang === 'hi' ? 'रोज़ की बिक्री (DSR)' : lang === 'hl' ? 'Roz ki bikri (DSR)' : 'Daily sales (DSR)';
  const first = data.products.find((p) => p.sales.closedDay)?.sales.closedDay ?? data.businessDate;
  const head = `${title} · ${data.outletCode} · ${dayWords(first, lang)}`;
  return [head, ...salesShareLines(productsOf(data), lang)].join('\n');
}

export const view: KindView<'dsr_sales'> = {
  kind: 'dsr_sales',
  Overlay,
  Glyph,
  tile,
  // The sales sheet judges nothing, so it never raises a "Needs a look" card.
  alert: () => null,
  headline,
  share,
};
