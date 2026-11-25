import type { ReactElement } from 'react';

import type { Lang } from '@/store/lang';
import type { PaperExpiryData } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import { sayWords, type KindAlert, type KindView, type OverlayProps, type ReportStatusKey, type Words } from '../types';

import { GlyphBox, Lead, Line, fmtDay, fmtDays, lineHeight, words } from './_paperwork';
import { daysFromToday, istDay } from './dsr_sales/fmt';

/**
 * Papers running out (ADR 0056): TEAR-OFF CALENDAR LEAVES. Each paper is a small calendar
 * leaf with a coloured top band, a big day count and a bar; a paper that has run out has a
 * torn corner and an octagon. A row of leaves per vehicle is only this report, and the
 * big number is the answer. A paper that carries its end date is counted again from that date
 * against today (a card kept on Today for days must not say "ends in 3 days" on the day it ends in
 * one); only a paper with no date keeps the count it was sent with, and the footer then says so.
 */

type Data = PaperExpiryData;
type Item = Data['items'][number];

/**
 * The snapshot with each paper's days counted again from its own end date, against today. When every
 * paper had a date, "days counted from" is today; if any kept its sent count, the footer keeps the day
 * it was sent. `allLapsed` follows the new counts.
 */
export function liveData(data: Data, now: number = Date.now()): Data {
  if (data.items.length === 0) return data;
  let allLive = true;
  const items = data.items.map((i) => {
    const n = daysFromToday(i.validUntil, now);
    if (n === null) {
      allLive = false;
      return i;
    }
    return { ...i, daysLeft: n };
  });
  return {
    ...data,
    items,
    allLapsed: allLive ? items.every((i) => i.daysLeft < 0) : data.allLapsed,
    sentOn: allLive ? istDay(now) || data.sentOn : data.sentOn,
  };
}

/** The most vehicles drawn; the rest are counted in one line. */
export const MAX_VEHICLES = 8;

const DOC_NAMES: Record<string, Words> = {
  'road-permit': words('रोड परमिट', 'Road permit', 'Road permit'),
  'explosive-license': words('विस्फोटक लाइसेंस', 'Explosive licence', 'Explosive licence'),
  'vehicle-insurance': words('गाड़ी का बीमा', 'Gaadi ka beema', 'Insurance'),
  'fitness-license': words('फ़िटनेस सर्टिफ़िकेट', 'Fitness certificate', 'Fitness certificate'),
  'pollution-under-control': words('प्रदूषण (PUC)', 'Pollution (PUC)', 'Pollution (PUC)'),
  'calibration-certificate': words('कैलिब्रेशन सर्टिफ़िकेट', 'Calibration certificate', 'Calibration certificate'),
  'date-of-manufacture': words('निर्माण की तारीख़', 'Nirmaan ki date', 'Date of manufacture'),
};

/** The paper's name in the reader's language; an unknown one is shown as the portal wrote it. */
export function docName(item: Pick<Item, 'docType' | 'docLabel'>, lang: Lang): string {
  const known = DOC_NAMES[item.docType.replace(/-by-rto$/, '')];
  if (known) return sayWords(known, lang);
  const label = (item.docLabel || item.docType).replace(/^\s*license type\s*[-:]\s*/i, '').trim();
  return label || item.docType;
}

/** Ran out or last day = problem (octagon); within 15 days = needs a look (triangle); else info. */
export function leafStatus(daysLeft: number): ReportStatusKey {
  if (daysLeft <= 1) return 'problem';
  if (daysLeft <= 15) return 'attention';
  return 'info';
}

/** The vehicles in the order they first appear (most urgent first), each with its papers. */
export function groupByVehicle(items: Item[]): Array<{ vehicleReg: string | null; items: Item[] }> {
  const order: Array<{ vehicleReg: string | null; items: Item[] }> = [];
  for (const item of items) {
    const reg = item.vehicleReg ?? null;
    let group = order.find((g) => g.vehicleReg === reg);
    if (!group) {
      group = { vehicleReg: reg, items: [] };
      order.push(group);
    }
    group.items.push(item);
  }
  return order;
}

const t = {
  daysLeft: words('दिन बाकी', 'din baaki', 'days left'),
  dayLeft: words('दिन बाकी', 'din baaki', 'day left'),
  daysAgo: words('दिन पहले', 'din pehle', 'days ago'),
  dayAgo: words('दिन पहले', 'din pehle', 'day ago'),
  ranOut: words('खत्म हो गया', 'Khatam ho gaya', 'Ran out'),
  lastDay: words('आख़िरी दिन', 'Aakhri din', 'Last day'),
  papersLabel: words('कागज़', 'Kagaz', 'Papers'),
};

/** "Ends in 3 days", "ends today", "ran out 2 days ago" as the tail of a sentence. */
function timing(daysLeft: number, lang: Lang): string {
  if (daysLeft < 0) {
    const n = -daysLeft;
    return sayWords(words(`${n} दिन पहले खत्म हो गया`, `${n} din pehle khatam ho gaya`, `ran out ${fmtDays(n, 'en')} ago`), lang);
  }
  if (daysLeft === 0) return sayWords(words('आज खत्म हो रहा है', 'aaj khatam ho raha hai', 'ends today'), lang);
  return sayWords(words(`${daysLeft} दिन में खत्म होगा`, `${daysLeft} din mein khatam hoga`, `ends in ${fmtDays(daysLeft, 'en')}`), lang);
}

/** One item as a sentence: "Road permit of BR01GA1234 ends in 3 days." */
export function itemSentence(item: Item, lang: Lang): string {
  const name = docName(item, lang);
  const when = timing(item.daysLeft, lang);
  if (item.vehicleReg) {
    return sayWords(words(`${item.vehicleReg} का ${name} ${when}।`, `${item.vehicleReg} ka ${name} ${when}.`, `${name} of ${item.vehicleReg} ${when}.`), lang);
  }
  return sayWords(words(`${name} ${when}।`, `${name} ${when}.`, `${name} ${when}.`), lang);
}

/** How many more papers there are than the leaves drawn. */
export function hiddenCount(data: Data): number {
  const groups = groupByVehicle(data.items);
  const shown = groups.slice(0, MAX_VEHICLES).reduce((n, g) => n + g.items.length, 0);
  return data.items.length - shown + Math.max(0, data.moreCount);
}

// ── the leaf ────────────────────────────────────────────────────────────────

/** Whole-leaf outline; a lapsed paper has a torn, zig-zag bottom-right corner. */
function LeafShape({ torn }: { torn: boolean }): ReactElement {
  const d = torn
    ? 'M3,0 H97 Q100,0 100,3 V74 L93,79 L98,84 L89,89 L95,94 L84,100 H3 Q0,100 0,97 V3 Q0,0 3,0 Z'
    : 'M3,0 H97 Q100,0 100,3 V97 Q100,100 97,100 H3 Q0,100 0,97 V3 Q0,0 3,0 Z';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false" className="absolute inset-0 h-full w-full text-border-strong">
      <path d={d} className="fill-surface" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Leaf({ item, lang, big = false }: { item: Item; lang: Lang; big?: boolean }): ReactElement {
  const status = leafStatus(item.daysLeft);
  const lapsed = item.daysLeft < 0;
  const n = Math.abs(item.daysLeft);
  const name = docName(item, lang);
  const spoken = `${name}, ${lapsed ? timing(item.daysLeft, lang) : item.daysLeft === 0 ? sayWords(t.lastDay, lang) : `${n} ${sayWords(n === 1 ? t.dayLeft : t.daysLeft, lang)}`}`;
  const fill = lapsed ? 0 : Math.min(Math.max(item.daysLeft, 0), 30) / 30;
  const caption = lapsed
    ? sayWords(n === 1 ? t.dayAgo : t.daysAgo, lang)
    : item.daysLeft === 0
      ? sayWords(t.lastDay, lang)
      : sayWords(n === 1 ? t.dayLeft : t.daysLeft, lang);
  return (
    <li
      data-status={status}
      data-lapsed={lapsed ? 'yes' : 'no'}
      className={`relative flex flex-col ${big ? 'w-full max-w-[240px]' : 'w-[148px]'}`}
      style={{ minHeight: big ? 150 : 112 }}
    >
      <LeafShape torn={lapsed} />
      <span className="sr-only">{spoken}</span>
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-[6px]" aria-hidden="true">
        <div className="relative flex items-start gap-1.5 px-1.5 pb-1.5 pt-3" style={{ backgroundColor: `var(--status-${status})` }}>
          {/* the two holes a tear-off calendar hangs from */}
          <span className="absolute left-3 top-1 h-1.5 w-1.5 rounded-full bg-surface" />
          <span className="absolute right-3 top-1 h-1.5 w-1.5 rounded-full bg-surface" />
          <StatusBadge status={status} lang={lang} showWord={false} className="!h-6 !w-6 shrink-0" />
          <span className={`min-w-0 text-subheading text-white ${lineHeight(lang)}`} style={{ overflowWrap: 'break-word', hyphens: 'auto' }}>
            {name}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-1 py-1 text-center">
          {lapsed ? <span className={`text-subheading text-status-problem-ink ${lineHeight(lang)}`}>{sayWords(t.ranOut, lang)}</span> : null}
          {item.daysLeft === 0 ? (
            <span className={`text-subheading text-text ${lineHeight(lang)}`}>{sayWords(t.lastDay, lang)}</span>
          ) : (
            <>
              <span className={`${big ? 'text-5xl' : 'text-4xl'} font-semibold leading-none text-text`}>{n}</span>
              <span className={`text-body text-text ${lineHeight(lang)}`}>{caption}</span>
            </>
          )}
          {item.validUntil ? (
            <span className={`mt-0.5 text-body text-text-muted ${lineHeight(lang)}`}>
              {sayWords(words(`तक: ${fmtDay(item.validUntil, 'hi')}`, `Tak: ${fmtDay(item.validUntil, 'hl')}`, `Until ${fmtDay(item.validUntil, 'en')}`), lang)}
            </span>
          ) : null}
        </div>
        <div className="mx-2 mb-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full" style={{ width: `${Math.round(fill * 100)}%`, backgroundColor: `var(--status-${status})` }} />
        </div>
      </div>
    </li>
  );
}

function VehicleBlock({ group, lang }: { group: { vehicleReg: string | null; items: Item[] }; lang: Lang }): ReactElement {
  const outlet = group.vehicleReg === null;
  return (
    <section aria-label={group.vehicleReg ?? sayWords(t.papersLabel, lang)} data-vehicle={group.vehicleReg ?? 'outlet'} className="space-y-2">
      {outlet ? null : (
        <h3 className="inline-block rounded-md border border-border-strong bg-surface px-2 py-0.5 text-subheading tracking-wider text-text">{group.vehicleReg}</h3>
      )}
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {group.items.map((item) => (
          <Leaf key={`${item.docType}-${item.validUntil ?? item.daysLeft}`} item={item} lang={lang} big={outlet && group.items.length === 1} />
        ))}
      </ul>
    </section>
  );
}

function leadOf(data: Data, lang: Lang): string {
  const first = data.items[0];
  if (!first) {
    return sayWords(words('कोई कागज़ खत्म होने वाला नहीं है।', 'Koi kagaz khatam hone wala nahi hai.', 'No paper is running out.'), lang);
  }
  return itemSentence(first, lang);
}

function whatToDo(data: Data, lang: Lang): string {
  if (data.scope === 'tanker') {
    return sayWords(
      words(
        'अथॉरिटी से रिन्यू करवाएँ। नई तारीख़ हमें रोज़ की जाँच में दिख जाएगी। आपको कुछ अपलोड नहीं करना।',
        'Authority se renew karwayein. Nayi date hamein roz ki jaanch mein dikh jayegi. Aapko kuch upload nahi karna.',
        'Renew with the authority. We will see the new date in our daily read. Nothing to upload.',
      ),
      lang,
    );
  }
  return sayWords(
    data.askId
      ? words('कृपया नया कागज़ हमें भेज दीजिए। फाइल हम कर देंगे।', 'Kripya naya kagaz hamein bhej dijiye. File hum kar denge.', 'Please send us the new paper. We will file it.')
      : words('अथॉरिटी से रिन्यू करवाएँ, फिर नया कागज़ हमें भेज दीजिए।', 'Authority se renew karwayein, phir naya kagaz hamein bhej dijiye.', 'Renew it with the authority, then send us the new paper.'),
    lang,
  );
}

function Overlay({ data: sent, lang }: OverlayProps<'paper_expiry'>): ReactElement {
  const data = liveData(sent);
  const groups = groupByVehicle(data.items).slice(0, MAX_VEHICLES);
  const more = hiddenCount(data);
  return (
    <div data-kind="paper_expiry" className="space-y-4 p-4">
      <Lead lang={lang}>{leadOf(data, lang)}</Lead>
      {data.allLapsed && data.items.length > 1 ? (
        <Line lang={lang}>{sayWords(words('इस सूची के सभी कागज़ खत्म हो चुके हैं।', 'Is list ke sabhi kagaz khatam ho chuke hain.', 'Every paper on this list has run out.'), lang)}</Line>
      ) : null}
      <div className="space-y-4">
        {groups.map((g) => (
          <VehicleBlock key={g.vehicleReg ?? 'outlet'} group={g} lang={lang} />
        ))}
      </div>
      {more > 0 ? (
        <Line lang={lang} className="font-semibold">
          {sayWords(words(`और ${more} कागज़`, `Aur ${more} kagaz`, `and ${more} more ${more === 1 ? 'paper' : 'papers'}`), lang)}
        </Line>
      ) : null}
      {data.items.length > 0 ? <Line lang={lang}>{whatToDo(data, lang)}</Line> : null}
      <Line lang={lang} className="text-text-muted">
        {sayWords(words(`दिनों की गिनती ${fmtDay(data.sentOn, 'hi')} से`, `Din ki ginti ${fmtDay(data.sentOn, 'hl')} se`, `Days counted from ${fmtDay(data.sentOn, 'en')}`), lang)}
      </Line>
    </div>
  );
}

/** The 40 x 28 mini signature: a tear-off calendar leaf. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  return (
    <GlyphBox size={size}>
      <path d="M11 4.5h18a2 2 0 0 1 2 2V23l-3 2.5-2-2-2 2-2-2-2 2H11a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M9 10h22" stroke="currentColor" strokeWidth="5" />
      <circle cx="14.5" cy="3.5" r="1.4" fill="currentColor" />
      <circle cx="25.5" cy="3.5" r="1.4" fill="currentColor" />
      <path d="M15 17.5h10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </GlyphBox>
  );
}

function headline(sent: Data, lang: Lang): string {
  const data = liveData(sent);
  const first = data.items[0];
  if (!first) return sayWords(words('कागज़ खत्म होने वाले', 'Kagaz khatam hone wale', 'Papers running out'), lang);
  const more = data.items.length - 1 + Math.max(0, data.moreCount);
  const base = itemSentence(first, lang).replace(/[.।]$/, '');
  return more > 0 ? `${base} (${sayWords(words(`और ${more}`, `aur ${more}`, `+${more} more`), lang)})` : base;
}

/** Anything within 15 days (or already out) is worth a card; further than that is not. */
function alert(sent: Data, lang: Lang): KindAlert | null {
  const data = liveData(sent);
  const urgent = data.items.reduce<Item | null>((best, i) => (best === null || i.daysLeft < best.daysLeft ? i : best), null);
  if (!urgent || urgent.daysLeft > 15) return null;
  const name = docName(urgent, lang);
  const when = timing(urgent.daysLeft, lang);
  const head = urgent.vehicleReg ? `${urgent.vehicleReg}: ${name} ${when}` : `${name} ${when}`;
  return {
    headline: head,
    line: data.scope === 'tanker' ? sayWords(words('अथॉरिटी से रिन्यू करवाएँ। आपको कुछ अपलोड नहीं करना।', 'Authority se renew karwayein. Aapko kuch upload nahi karna.', 'Renew it with the authority. Nothing to upload.'), lang) : whatToDo(data, lang),
    severity: leafStatus(urgent.daysLeft) === 'problem' ? 'problem' : 'attention',
  };
}

function share(sent: Data, lang: Lang): string {
  const data = liveData(sent);
  const lines = [
    sayWords(words(`कागज़ खत्म होने वाले (${fmtDay(data.sentOn, 'hi')} तक का हाल)`, `Kagaz khatam hone wale (${fmtDay(data.sentOn, 'hl')} tak ka haal)`, `Papers running out (as of ${fmtDay(data.sentOn, 'en')})`), lang),
  ];
  for (const item of data.items) {
    const who = item.vehicleReg ? `${item.vehicleReg} · ` : '';
    const until = item.validUntil ? ` (${fmtDay(item.validUntil, lang)})` : '';
    lines.push(`${who}${docName(item, lang)}: ${timing(item.daysLeft, lang)}${until}`);
  }
  if (data.moreCount > 0) lines.push(sayWords(words(`और ${data.moreCount} कागज़`, `Aur ${data.moreCount} kagaz`, `and ${data.moreCount} more`), lang));
  return lines.join('\n');
}

export const view: KindView<'paper_expiry'> = {
  kind: 'paper_expiry',
  Overlay,
  Glyph,
  tile: () => null,
  alert,
  headline,
  share,
};
