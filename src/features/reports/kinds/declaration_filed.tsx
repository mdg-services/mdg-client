import { useId, type ReactElement } from 'react';

import type { Lang } from '@/store/lang';
import type { DeclarationFiledData, FiledPhoto } from '@dk/shared/types';

import { StatusBadge } from '../StatusBadge';
import { sayWords, type KindView, type OverlayProps } from '../types';

import {
  FiledByLine,
  GlyphBox,
  Lead,
  Line,
  PhotoFrame,
  TickPath,
  addDays,
  dayOfMonth,
  fmtDay,
  istOf,
  lineHeight,
  monthName,
  photoUrl,
  usePhotoViewer,
  words,
} from './_paperwork';

/**
 * Declaration filed (ADR 0056): a ROUND SEAL "FILED" with the date. The daily safety
 * declaration adds a 14-day tick calendar; the weekly washroom one adds its two photos.
 * The seal is the only round stamp in the app, so seal + date = "paperwork was filed".
 */

type Data = DeclarationFiledData;

const t = {
  sealTop: words('जमा हुआ', 'JAMA HUA', 'FILED'),
  sealTopPortal: words('पहले से', 'PAHLE SE', 'ON PORTAL'),
  sealBottom: words('INDIANOIL PORTAL', 'INDIANOIL PORTAL', 'INDIANOIL PORTAL'),
  badgePortal: words('पहले से थी', 'Pahle se thi', 'Already there'),
  nameSafety: words('सेफ्टी डिक्लेरेशन', 'Safety declaration', 'Safety declaration'),
  nameWashroom: words('वॉशरूम डिक्लेरेशन', 'Washroom declaration', 'Washroom declaration'),
  calendarTitle: words('पिछले 14 दिन', 'Pichhle 14 din', 'Last 14 days'),
  legendFiled: words('जमा', 'Jama', 'Filed'),
  legendMissed: words('कुछ जमा नहीं', 'Kuch jama nahi', 'No filing'),
  legendThis: words('यह रिपोर्ट', 'Yeh report', 'This report'),
  outside: words('बाहर की फोटो', 'Bahar ki photo', 'Outside photo'),
  inside: words('अंदर की फोटो', 'Andar ki photo', 'Inside photo'),
  reused: words('पिछली बार वाली ही फोटो', 'Pichhli baar wali hi photo', 'Same photos as last time'),
  noPhotos: words('इस बार की फोटो यहाँ नहीं रखी गईं।', 'Is baar ki photo yahan nahi rakhi gayi.', 'The photos for this one are not kept here.'),
};

function name(data: Data, lang: Lang): string {
  return sayWords(data.declaration === 'safety' ? t.nameSafety : t.nameWashroom, lang);
}

/** The IST day the paper was actually filed on (falls back to the day it is for). */
function filedDay(data: Data): string {
  return istOf(data.filedAt)?.day ?? data.day;
}

function lead(data: Data, lang: Lang): string {
  const d = fmtDay(data.day, lang);
  const safety = data.declaration === 'safety';
  if (data.how === 'already_on_portal') {
    return sayWords(
      words(
        'यह पहले से IndianOil के पोर्टल पर थी। MDG ने इसे जमा नहीं किया।',
        'Yeh pehle se IndianOil ke portal par thi. MDG ne ise jama nahi kiya.',
        "This was already on IndianOil's portal. MDG did not file it.",
      ),
      lang,
    );
  }
  return sayWords(
    safety
      ? words(
          `${d} की सेफ्टी डिक्लेरेशन IndianOil के पोर्टल पर जमा हो गई है।`,
          `${d} ka safety declaration IndianOil ke portal par jama ho gaya hai.`,
          `The safety declaration for ${d} is filed on IndianOil's portal.`,
        )
      : words(
          `${d} की वॉशरूम डिक्लेरेशन IndianOil के पोर्टल पर जमा हो गई है।`,
          `${d} ka washroom declaration IndianOil ke portal par jama ho gaya hai.`,
          `The washroom declaration for ${d} is filed on IndianOil's portal.`,
        ),
    lang,
  );
}

function lateLine(data: Data, lang: Lang): string | null {
  if (!data.late || data.how === 'already_on_portal') return null;
  const forDay = fmtDay(data.day, lang);
  const filed = fmtDay(filedDay(data), lang);
  return sayWords(
    words(`यह ${forDay} की थी। जमा हुई ${filed} को।`, `Yeh ${forDay} ki thi. Jama hua ${filed} ko.`, `It was for ${forDay}. It went in on ${filed}.`),
    lang,
  );
}

function everyLine(days: number, lang: Lang): string {
  return sayWords(
    days === 1
      ? words('हर दिन जमा होती है।', 'Roz jama hoti hai.', 'Filed every day.')
      : words(`हर ${days} दिन में जमा होती है।`, `Har ${days} din mein jama hoti hai.`, `Filed every ${days} days.`),
    lang,
  );
}

function filedNextLine(data: Data, lang: Lang): string {
  const filed = fmtDay(filedDay(data), lang);
  const next = data.nextDueDay ? fmtDay(data.nextDueDay, lang) : null;
  return sayWords(
    next
      ? words(`जमा: ${filed}। अगली: ${next}।`, `Jama: ${filed}. Agla: ${next}.`, `Filed ${filed}. Next ${next}.`)
      : words(`जमा: ${filed}।`, `Jama: ${filed}.`, `Filed ${filed}.`),
    lang,
  );
}

/** The 14 days ending at `day`, oldest first, each with whether a filing is on record. */
export function calendarDays(data: Data): Array<{ day: string; filed: boolean; isReportDay: boolean }> {
  const filed = new Set([...(data.recentDays ?? []), data.day]);
  return Array.from({ length: 14 }, (_, i) => {
    const day = addDays(data.day, i - 13);
    return { day, filed: filed.has(day), isReportDay: day === data.day };
  });
}

// ── the seal ────────────────────────────────────────────────────────────────

function Seal({ data, lang, size = 148 }: { data: Data; lang: Lang; size?: number }): ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const onPortal = data.how === 'already_on_portal';
  const m = /^\d{4}-(\d{2})-\d{2}/.exec(data.day);
  const month = m ? monthName(Number(m[1]), lang) : '';
  const label = sayWords(
    onPortal
      ? words(`पहले से थी, ${fmtDay(data.day, 'hi')}`, `Pahle se thi, ${fmtDay(data.day, 'hl')}`, `Already on the portal, ${fmtDay(data.day, 'en')}`)
      : words(`जमा हुआ, ${fmtDay(data.day, 'hi')}`, `Jama hua, ${fmtDay(data.day, 'hl')}`, `Filed, ${fmtDay(data.day, 'en')}`),
    lang,
  );
  const ink = onPortal ? 'text-status-info-ink' : 'text-kind-paperwork-ink';
  const dash = onPortal ? '6 5' : undefined;
  const top = `${uid}top`;
  const bottom = `${uid}bottom`;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 148 148"
      focusable="false"
      className={`mx-auto block ${ink}`}
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      <defs>
        <path id={top} d="M 28,74 A 46,46 0 0 1 120,74" />
        <path id={bottom} d="M 18,74 A 56,56 0 0 0 130,74" />
      </defs>
      <circle cx="74" cy="74" r="70" fill="none" stroke="currentColor" strokeWidth="3.5" strokeDasharray={dash} />
      <circle cx="74" cy="74" r="63" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="74" cy="74" r="40" className={onPortal ? 'fill-status-info-soft' : 'fill-kind-paperwork-soft'} stroke="currentColor" strokeWidth="1.5" />
      <text fontSize="14" fontWeight="700" letterSpacing="2.5" fill="currentColor" textAnchor="middle">
        <textPath xlinkHref={`#${top}`} startOffset="50%">
          {sayWords(onPortal ? t.sealTopPortal : t.sealTop, lang)}
        </textPath>
      </text>
      <text fontSize="10" fontWeight="700" letterSpacing="1.5" fill="currentColor" textAnchor="middle">
        <textPath xlinkHref={`#${bottom}`} startOffset="50%">
          {sayWords(t.sealBottom, lang)}
        </textPath>
      </text>
      {onPortal ? (
        <g aria-hidden="true">
          <circle cx="74" cy="50" r="2" fill="currentColor" />
          <path d="M74 54v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </g>
      ) : (
        <TickPath x={64} y={36} scale={0.5} width={4.4} />
      )}
      <text x="74" y="83" fontSize="28" fontWeight="800" fill="currentColor" textAnchor="middle">
        {dayOfMonth(data.day)}
      </text>
      <text x="74" y="99" fontSize="13" fontWeight="700" fill="currentColor" textAnchor="middle">
        {month}
      </text>
    </svg>
  );
}

// ── the 14-day calendar ─────────────────────────────────────────────────────

function Calendar({ data, lang }: { data: Data; lang: Lang }): ReactElement {
  const days = calendarDays(data);
  return (
    <section className="rounded-xl bg-kind-paperwork-soft p-3">
      <h3 className={`mb-2 text-subheading text-kind-paperwork-ink ${lineHeight(lang)}`}>{sayWords(t.calendarTitle, lang)}</h3>
      <ol aria-label={sayWords(t.calendarTitle, lang)} className="m-0 grid list-none grid-cols-7 gap-x-1 gap-y-2 p-0">
        {days.map((d) => (
          <li
            key={d.day}
            className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg"
            data-filed={d.filed ? 'yes' : 'no'}
            data-report-day={d.isReportDay ? 'yes' : undefined}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
              {d.filed ? (
                <>
                  <rect x="2" y="2" width="24" height="24" rx="6" className="fill-kind-paperwork" />
                  <TickPath x={4} y={4} scale={1} stroke="#fff" width={2.6} />
                </>
              ) : (
                <rect x="3" y="3" width="22" height="22" rx="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" className="text-text-muted" />
              )}
              {d.isReportDay ? <rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="none" strokeWidth="2" className="stroke-kind-paperwork-ink" /> : null}
            </svg>
            <span className={`text-cta text-text ${d.isReportDay ? 'underline decoration-2 underline-offset-2' : ''}`} aria-hidden="true">
              {dayOfMonth(d.day)}
            </span>
            <span className="sr-only">
              {`${fmtDay(d.day, lang)}: ${sayWords(d.filed ? t.legendFiled : t.legendMissed, lang)}${d.isReportDay ? `, ${sayWords(t.legendThis, lang)}` : ''}`}
            </span>
          </li>
        ))}
      </ol>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-body text-text" aria-hidden="true">
        <li className="flex items-center gap-1.5">
          <svg width="18" height="18" viewBox="0 0 28 28" focusable="false">
            <rect x="2" y="2" width="24" height="24" rx="6" className="fill-kind-paperwork" />
            <TickPath x={4} y={4} stroke="#fff" width={2.8} />
          </svg>
          {sayWords(t.legendFiled, lang)}
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="18" height="18" viewBox="0 0 28 28" focusable="false">
            <rect x="3" y="3" width="22" height="22" rx="6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="3 3" className="text-text-muted" />
          </svg>
          {sayWords(t.legendMissed, lang)}
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="18" height="18" viewBox="0 0 28 28" focusable="false">
            <rect x="2" y="2" width="24" height="24" rx="6" fill="none" strokeWidth="3" className="stroke-kind-paperwork-ink" />
          </svg>
          {sayWords(t.legendThis, lang)}
        </li>
      </ul>
    </section>
  );
}

// ── the washroom photos ─────────────────────────────────────────────────────

const SLOT_ORDER: Record<FiledPhoto['slot'], number> = { outside: 0, inside: 1 };

function Photos({ data, report, lang }: OverlayProps<'declaration_filed'>): ReactElement {
  const photos = [...(data.photos ?? [])].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
  const labelOf = (slot: FiledPhoto['slot']) => sayWords(slot === 'outside' ? t.outside : t.inside, lang);
  // The signed copies come from the report route; a tap opens the app's own picture viewer, never a new tab.
  const { open, viewer } = usePhotoViewer(
    report,
    photos.map((p) => ({ key: p.key, label: labelOf(p.slot), mime: p.mime })),
  );
  if (photos.length === 0) return <Line lang={lang}>{sayWords(t.noPhotos, lang)}</Line>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {photos.map((p) => (
          <PhotoFrame
            key={p.slot}
            src={photoUrl(report, p.key)}
            label={labelOf(p.slot)}
            size={156}
            lang={lang}
            onOpen={() => open(p.key)}
          />
        ))}
      </div>
      {viewer}
      {photos.some((p) => p.reused) ? <Line lang={lang} className="text-text-muted">{sayWords(t.reused, lang)}</Line> : null}
    </div>
  );
}

function Overlay(props: OverlayProps<'declaration_filed'>): ReactElement {
  const { data, lang } = props;
  const late = lateLine(data, lang);
  const onPortal = data.how === 'already_on_portal';
  const streak = data.declaration === 'safety' && data.streak && data.streak >= 2 ? data.streak : null;
  return (
    <div data-kind="declaration_filed" className="space-y-4 p-4">
      <Seal data={data} lang={lang} />
      <div className="space-y-2">
        {onPortal ? <StatusBadge status="info" lang={lang} word={sayWords(t.badgePortal, lang)} /> : null}
        <Lead lang={lang}>{lead(data, lang)}</Lead>
        {late ? <Line lang={lang}>{late}</Line> : null}
      </div>
      {data.declaration === 'safety' && data.recentDays && data.recentDays.length > 0 ? <Calendar data={data} lang={lang} /> : null}
      {streak ? (
        <p className={`text-subheading text-text ${lineHeight(lang)}`}>
          {sayWords(words(`लगातार ${streak} दिन`, `Lagaatar ${streak} din`, `${streak} days in a row`), lang)}
        </p>
      ) : null}
      {data.declaration === 'washroom' ? <Photos {...props} /> : null}
      <div className="space-y-1">
        {onPortal ? null : <Line lang={lang}>{filedNextLine(data, lang)}</Line>}
        <Line lang={lang} className="text-text-muted">{everyLine(data.everyDays, lang)}</Line>
        {data.declaration === 'washroom' && data.previousDay ? (
          <Line lang={lang} className="text-text-muted">
            {sayWords(
              words(`इससे पहले: ${fmtDay(data.previousDay, 'hi')}`, `Isse pehle: ${fmtDay(data.previousDay, 'hl')}`, `Before this: ${fmtDay(data.previousDay, 'en')}`),
              lang,
            )}
          </Line>
        ) : null}
      </div>
      {onPortal ? null : <FiledByLine lang={lang} />}
    </div>
  );
}

/** The 40 x 28 mini signature: a small round seal with a tick. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  return (
    <GlyphBox size={size}>
      <circle cx="20" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="20" cy="14" r="8.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <TickPath x={13.2} y={7.2} scale={0.68} width={2.6} />
    </GlyphBox>
  );
}

function headline(data: Data, lang: Lang): string {
  const n = name(data, lang);
  const d = fmtDay(data.day, lang);
  if (data.how === 'already_on_portal') {
    return sayWords(words(`${n}: पहले से पोर्टल पर थी, ${d}`, `${n}: pehle se portal par thi, ${d}`, `${n} was already on the portal, ${d}`), lang);
  }
  return sayWords(words(`${n} जमा, ${d}`, `${n} jama, ${d}`, `${n} filed, ${d}`), lang);
}

function share(data: Data, lang: Lang): string {
  const lines = [headline(data, lang)];
  if (data.how !== 'already_on_portal') lines.push(filedNextLine(data, lang));
  if (data.declaration === 'safety' && data.streak && data.streak >= 2) {
    lines.push(sayWords(words(`लगातार ${data.streak} दिन`, `Lagaatar ${data.streak} din`, `${data.streak} days in a row`), lang));
  }
  lines.push(sayWords(words('MDG की टीम ने IndianOil के पोर्टल पर भरा।', "MDG ki team ne IndianOil ke portal par bhara.", "Filed by MDG's team on IndianOil's portal."), lang));
  return lines.join('\n');
}

export const view: KindView<'declaration_filed'> = {
  kind: 'declaration_filed',
  Overlay,
  Glyph,
  tile: () => null,
  alert: () => null,
  headline,
  share,
};
