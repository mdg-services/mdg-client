import { Clock, Info, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { ProgressBar, SectionCard, StatusPill } from '@/components/kit';
import type { Lang } from '@/store/lang';
import type { ReportDataOf } from '@dk/shared/types';

import { statusWord } from '../StatusBadge';
import { sayWords, type KindAlert, type KindTile, type KindView, type OverlayProps, type Words } from '../types';

import {
  BlockTitle,
  GlyphBox,
  Lead,
  More,
  Note,
  clockWords,
  dayWords,
  hindiPeriod,
  leading,
  num,
  plural,
  rv,
  rvn,
  stampWords,
} from './_supplyKit';

/**
 * Water checks (ADR 0056): the DAY STRIP. The day cut into windows (usually twelve of two
 * hours), each marked with its own shape: a tick in a filled circle (done), a dashed box
 * with a cross and hatching (missed), a hollow clock (open). Colour is only the family
 * teal; the shape and the word carry the meaning, so it reads in sunlight and to a dealer
 * who cannot tell red from green.
 *
 * The wording is never an accusation: the windows are recorded by our service, a missed one
 * "closed before it was recorded", and the dealer has nothing to do. The number of windows
 * is read from the snapshot, never assumed to be twelve.
 */

type Data = ReportDataOf<'water_ingress'>;
type Slot = Data['slots'][number];

// ── words ─────────────────────────────────────────────────────────────────────

const SLOT_WORD: Record<Slot['state'], Words> = {
  recorded: { hi: 'हो गई', hl: 'Ho gayi', en: 'Done' },
  missed: { hi: 'छूट गई', hl: 'Chhoot gayi', en: 'Missed' },
  open: { hi: 'बाकी', hl: 'Baaki', en: 'Open' },
};

const W = {
  allDone: (n: number): Words => ({
    hi: `पानी की जाँच सभी ${n} बार हो गई।`,
    hl: `Paani ki jaanch saare ${n} baar ho gayi.`,
    en: `All ${n} water checks are done.`,
  }),
  someDone: (done: number, total: number): Words => ({
    hi: `पानी की जाँच ${total} में से ${done} बार हुई।`,
    hl: `Paani ki jaanch ${total} mein se ${done} baar hui.`,
    en: `Water was checked in ${done} of ${total} windows.`,
  }),
  running: (done: number, total: number): Words => ({
    hi: `अभी तक ${total} में से ${done} जाँच हुई हैं। दिन अभी पूरा नहीं हुआ।`,
    hl: `Ab tak ${total} mein se ${done} jaanch hui hain. Din abhi poora nahi hua.`,
    en: `So far ${done} of ${total}. The day is not over.`,
  }),
  noWindows: {
    hi: 'इस दिन की जाँच की सूची अभी खाली है।',
    hl: 'Is din ki jaanch ki list abhi khaali hai.',
    en: 'The list of checks for this day is empty.',
  } satisfies Words,
  missedOne: {
    hi: '1 जाँच का समय निकल गया और वह दर्ज नहीं हो पाई। जाँच अपने समय में ही दर्ज होती है, इसलिए अब वह नहीं हो सकती। आपको कुछ नहीं करना है। हम देख रहे हैं कि ऐसा क्यों हुआ।',
    hl: '1 jaanch ka time nikal gaya aur woh record nahi ho paayi. Jaanch apne time mein hi record hoti hai, isliye ab woh nahi ho sakti. Aapko kuch nahi karna. Hum dekh rahe hain ki aisa kyun hua.',
    en: '1 window closed before it was recorded. A window can only be recorded in its own time, so it cannot be done now. You do not need to do anything. We are looking at why.',
  } satisfies Words,
  missedMany: (n: number): Words => ({
    hi: `${n} जाँच का समय निकल गया और वे दर्ज नहीं हो पाईं। जाँच अपने समय में ही दर्ज होती है, इसलिए अब वे नहीं हो सकतीं। आपको कुछ नहीं करना है। हम देख रहे हैं कि ऐसा क्यों हुआ।`,
    hl: `${n} jaanch ka time nikal gaya aur woh record nahi ho paayin. Jaanch apne time mein hi record hoti hai, isliye ab woh nahi ho sakti. Aapko kuch nahi karna. Hum dekh rahe hain ki aisa kyun hua.`,
    en: `${n} windows closed before they were recorded. A window can only be recorded in its own time, so it cannot be done now. You do not need to do anything. We are looking at why.`,
  }),
  notFinal: {
    hi: 'यह आँकड़ा अभी पूरा नहीं है। दिन ख़त्म होने तक बदल सकता है।',
    hl: 'Yeh aankda abhi poora nahi hai. Din khatam hone tak badal sakta hai.',
    en: 'This is not final. It can change until the day ends.',
  } satisfies Words,
  checkFailed: (when: string): Words => ({
    hi: `पिछली जाँच पूरी नहीं हो पाई। यह सूची आख़िरी सही जाँच की है${when ? ` (${when})` : ''}।`,
    hl: `Pichhli jaanch poori nahi ho paayi. Yeh list aakhri sahi jaanch ki hai${when ? ` (${when})` : ''}.`,
    en: `The last check could not finish. This list is from the last good check${when ? ` (${when})` : ''}.`,
  }),
  staffRecorded: (n: number): Words => ({
    hi: `${n} जाँच आपके स्टाफ़ ने दर्ज की हैं, बाक़ी हमारी सेवा ने।`,
    hl: `${n} jaanch aapke staff ne record ki hain, baaki hamari seva ne.`,
    en: `${n} ${n === 1 ? 'window was' : 'windows were'} recorded by your own staff, the rest by our service.`,
  }),
  lastChecked: (when: string): Words => ({
    hi: `आख़िरी जाँच: ${when}`,
    hl: `Aakhri jaanch: ${when}`,
    en: `Last checked ${when}`,
  }),
  pumpHours: (from: string, to: string): Words => ({
    hi: `पंप का समय: ${from} से ${to}`,
    hl: `Pump ka time: ${from} se ${to}`,
    en: `Pump hours ${from} to ${to}`,
  }),
  allDay: {
    hi: 'पंप चौबीस घंटे चालू',
    hl: 'Pump chaubees ghante chalu',
    en: 'Pump open round the clock',
  } satisfies Words,
  notOnPortal: {
    hi: 'पंप का समय पोर्टल पर नहीं दिखा',
    hl: 'Pump ka time portal par nahi dikha',
    en: 'Pump hours are not on the portal',
  } satisfies Words,
  gridTitle: { hi: 'दिन के समय', hl: 'Din ke time', en: 'Time windows of the day' } satisfies Words,
  moreTitle: {
    hi: 'इंडियन ऑयल के दिए समय के नाम',
    hl: 'IndianOil ke diye time ke naam',
    en: "IndianOil's names for these windows",
  } satisfies Words,
  moreNote: {
    hi: 'पोर्टल पर यही नाम दिखते हैं।',
    hl: 'Portal par yahi naam dikhte hain.',
    en: 'These are the names on the portal.',
  } satisfies Words,
  winSoFar: { hi: 'अभी तक', hl: 'Ab tak', en: 'so far' } satisfies Words,
  tileDone: { hi: 'हुईं', hl: 'hui', en: 'done' } satisfies Words,
  tileMissed: (n: number): Words => ({
    hi: `हुईं, ${n} छूट गईं`,
    hl: `hui, ${n} chhoot gayi`,
    en: `done, ${n} missed`,
  }),
  alertHead: (n: number): Words => ({
    hi: `${n} जाँच छूट गई`,
    hl: `${n} jaanch chhoot gayi`,
    en: n === 1 ? '1 water check was missed' : `${n} water checks were missed`,
  }),
  alertLine: {
    hi: 'अब दर्ज नहीं हो सकती। आपको कुछ नहीं करना है।',
    hl: 'Ab record nahi ho sakti. Aapko kuch nahi karna.',
    en: 'It cannot be recorded now. You do not need to do anything.',
  } satisfies Words,
  title: { hi: 'पानी की जाँच', hl: 'Paani ki jaanch', en: 'Water checks' } satisfies Words,
  shareTitle: { hi: 'टंकी में पानी की जाँच', hl: 'Tanki mein paani ki jaanch', en: 'Water checks' } satisfies Words,
  slotsAria: { hi: 'जाँच के समय', hl: 'Jaanch ke time', en: 'Check windows' } satisfies Words,
};

// ── time of a window ───────────────────────────────────────────────────────────

/**
 * "12–2 am" (hi: "रात 12–2"): a window's own hours in 12-hour wording, short enough for a
 * three-across block. The service page says its windows the same way (it should call this).
 */
export function slotRange(startMin: number, endMin: number, lang: Lang): string {
  const part = (min: number): { h12: number; mm: number; hour: number } => {
    const hour = Math.floor(min / 60) % 24;
    return { h12: hour % 12 === 0 ? 12 : hour % 12, mm: min % 60, hour };
  };
  const a = part(startMin);
  const b = part(endMin);
  const show = (p: { h12: number; mm: number }): string =>
    p.mm === 0 ? String(p.h12) : `${p.h12}:${String(p.mm).padStart(2, '0')}`;
  if (lang === 'hi') {
    return `${hindiPeriod(a.hour)} ${show(a)}–${show(b)}`;
  }
  const mer = (hour: number): string => (hour < 12 ? 'am' : 'pm');
  return mer(a.hour) === mer(b.hour)
    ? `${show(a)}–${show(b)} ${mer(a.hour)}`
    : `${show(a)} ${mer(a.hour)}–${show(b)} ${mer(b.hour)}`;
}

/**
 * The range on one line at any text size, without a no-wrap class: a no-break space after the
 * time of day and a word joiner on each side of the dash, so the browser has nowhere to cut it.
 */
export function keepTogether(range: string): string {
  return range.replace(/ /g, '\u00a0').replace(/–/g, '\u2060–\u2060');
}

/** "06:00" read as a clock in the reader's language. */
function hhmmWords(hhmm: string, lang: Lang): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? clockWords(Number(m[1]) % 24, Number(m[2]), lang) : hhmm;
}

// ── numbers ────────────────────────────────────────────────────────────────────

/** The figures that are safe to print, whatever the snapshot says about itself. */
function counts(data: Data): { total: number; done: number; missed: number; open: number } {
  const slots = data.slots ?? [];
  const total = Math.max(data.totalSlots || 0, slots.length);
  const done = data.recordedSlots ?? slots.filter((s) => s.state === 'recorded').length;
  const missed = data.missedSlots ?? slots.filter((s) => s.state === 'missed').length;
  const open = data.openSlots ?? slots.filter((s) => s.state === 'open').length;
  return { total, done, missed, open };
}

function leadText(data: Data, lang: Lang): string {
  const { total, done, missed } = counts(data);
  if (total === 0) return sayWords(W.noWindows, lang);
  if (data.dayState === 'running') return sayWords(W.running(done, total), lang);
  if (missed === 0 && done >= total) return sayWords(W.allDone(total), lang);
  return sayWords(W.someDone(done, total), lang);
}

// ── pictures ───────────────────────────────────────────────────────────────────

/** The mark of one window: a ticked circle, a crossed dashed box, a hollow clock. 28 px. */
function SlotMark({ state }: { state: Slot['state'] }): React.ReactElement {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false" data-mark={state}>
      {state === 'recorded' ? (
        <>
          <circle cx="14" cy="14" r="12" className="fill-kind-water-ink" />
          <path
            d="M8.5 14.4l3.8 3.8 7.3-7.6"
            fill="none"
            className="stroke-kind-water-soft"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : state === 'missed' ? (
        <>
          <rect
            x="2.5"
            y="2.5"
            width="23"
            height="23"
            rx="5"
            fill="none"
            className="stroke-kind-water-ink"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <path
            d="M9 9l10 10M19 9L9 19"
            fill="none"
            className="stroke-kind-water-ink"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="14" cy="14" r="11.5" fill="none" className="stroke-text-muted" strokeWidth="2" />
          <path
            d="M14 8v6l4 2.5"
            fill="none"
            className="stroke-text-muted"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

/** A diagonal hatch behind a missed window: a pattern, not a colour. */
function Hatch(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 72 72"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full rounded-xl text-kind-water-ink opacity-25"
    >
      <path
        d="M0 24L24 0M0 48L48 0M0 72L72 0M24 72L72 24M48 72L72 48"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
    </svg>
  );
}

function SlotBlock({ slot, lang }: { slot: Slot; lang: Lang }): React.ReactElement {
  const range = slotRange(slot.startMin, slot.endMin, lang);
  const word = sayWords(SLOT_WORD[slot.state], lang);
  const frame =
    slot.state === 'recorded'
      ? 'border border-solid border-kind-water-ink bg-kind-water-soft'
      : slot.state === 'missed'
        ? 'border-2 border-dashed border-kind-water-ink bg-surface'
        : 'border border-solid border-border-strong bg-surface';
  return (
    <li
      aria-label={`${range}: ${word}`}
      data-state={slot.state}
      data-testid="water-slot"
      className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-center ${frame}`}
    >
      {slot.state === 'missed' ? <Hatch /> : null}
      <span className="relative">
        <SlotMark state={slot.state} />
      </span>
      <span className={`relative text-body font-semibold text-text ${leading(lang)}`}>{keepTogether(range)}</span>
      <span className={`relative text-body text-text ${leading(lang)}`}>{word}</span>
    </li>
  );
}

/**
 * How the day stands, as one of the five report shapes. A missed window is "Needs a look" even while
 * the day is still running: the report's own tag, the Reports list and Today all say so, and a card
 * that said "We are on it" under a header that said "Needs a look" gave one report two verdicts.
 */
function dayStatus(data: Data): 'ok' | 'attention' | 'waiting' {
  const { missed } = counts(data);
  return missed > 0 ? 'attention' : data.dayState === 'running' ? 'waiting' : 'ok';
}

/** "10 of 12 checks done, 2 missed": the number in words, said once, with the bar that draws it. */
export function progressText(data: Data, lang: Lang): string {
  const { total, done, missed, open } = counts(data);
  const running = data.dayState === 'running';
  const parts = [rv(lang, running ? 'rv3.water.progressSoFar' : 'rv3.water.progress', { done: num(done), total: num(total) })];
  if (missed > 0) parts.push(rvn(lang, 'rv3.water.missed', missed, { n: num(missed) }));
  if (running && open > 0) parts.push(rvn(lang, 'rv3.water.open', open, { n: num(open) }));
  return parts.join(', ');
}

function Overlay({ data, lang }: OverlayProps<'water_ingress'>): React.ReactElement {
  const slots = data.slots ?? [];
  const { missed } = counts(data);
  const running = data.dayState === 'running';
  const staffRecorded = slots.filter((s) => s.state === 'recorded' && !s.byService).length;
  const checkedAt = stampWords(data.lastCheckAt, lang);
  const hours = data.operating
    ? data.operating.allDay
      ? sayWords(W.allDay, lang)
      : sayWords(
          W.pumpHours(hhmmWords(data.operating.from, lang), hhmmWords(data.operating.to, lang)),
          lang,
        )
    : sayWords(W.notOnPortal, lang);

  return (
    <div data-kind="water_ingress" className="flex flex-col gap-3 p-4">
      <SectionCard
        title={
          dayWords(data.businessDate, lang)
            ? rv(lang, 'rv3.water.day', { day: dayWords(data.businessDate, lang) })
            : rv(lang, 'rv3.water.title')
        }
      >
        <div className="flex flex-col gap-3" data-testid="water-summary">
          {counts(data).total > 0 ? (
            <>
              <div>
                <StatusPill status={dayStatus(data)} word={statusWord(dayStatus(data), lang)} />
              </div>
              <ProgressBar value={counts(data).done} max={counts(data).total} text={progressText(data, lang)} />
            </>
          ) : null}
          <Lead lang={lang}>{leadText(data, lang)}</Lead>
        </div>
      </SectionCard>

      {slots.length > 0 ? (
        <section aria-label={sayWords(W.gridTitle, lang)} className="flex flex-col gap-3">
          <ul
            aria-label={sayWords(W.slotsAria, lang)}
            className="grid list-none gap-2 p-0 [grid-template-columns:repeat(auto-fill,minmax(7rem,1fr))]"
          >
            {slots.map((s, i) => (
              <SlotBlock key={`${s.startMin}-${i}`} slot={s} lang={lang} />
            ))}
          </ul>
        </section>
      ) : null}

      {running ? (
        <Note lang={lang} tone="waiting" icon={<Clock aria-hidden="true" className="h-5 w-5 text-status-waiting-ink" />} testId="water-not-final">
          {sayWords(W.notFinal, lang)}
        </Note>
      ) : missed > 0 ? (
        <Note lang={lang} icon={<Info aria-hidden="true" className="h-5 w-5 text-text-muted" />} testId="water-missed-note">
          {plural(missed, () => W.missedOne, W.missedMany, lang)}
        </Note>
      ) : null}

      {data.lastCheckFailed ? (
        <Note
          lang={lang}
          tone="attention"
          icon={<TriangleAlert aria-hidden="true" className="h-5 w-5 text-status-attention-ink" />}
          testId="water-check-failed"
        >
          {sayWords(W.checkFailed(checkedAt), lang)}
        </Note>
      ) : null}

      <section className="flex flex-col gap-1">
        <BlockTitle>{sayWords(W.title, lang)}</BlockTitle>
        <ul className={`list-none space-y-1 p-0 text-body text-text ${leading(lang)}`}>
          {checkedAt ? <li>{sayWords(W.lastChecked(checkedAt), lang)}</li> : null}
          <li>{hours}</li>
          {staffRecorded > 0 ? <li>{sayWords(W.staffRecorded(staffRecorded), lang)}</li> : null}
        </ul>
      </section>

      {slots.length > 0 ? (
        <More label={sayWords(W.moreTitle, lang)} testId="water-more">
          <p className="mb-2 text-text-muted">{sayWords(W.moreNote, lang)}</p>
          <ul className="list-none space-y-1 p-0">
            {slots.map((s, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-3">
                <span dir="auto">{s.label}</span>
                <span className="text-text-muted">{sayWords(SLOT_WORD[s.state], lang)}</span>
              </li>
            ))}
          </ul>
        </More>
      ) : null}
    </div>
  );
}

/** The 40 x 28 mini: the day grid, a few windows each way, in the text colour. */
function Glyph({ size = 28 }: { size?: number }): React.ReactElement {
  const cols = [2, 12, 22, 32];
  const rows = [3, 11, 19];
  // done done done done / done done missed done / done open open open
  const states: Slot['state'][][] = [
    ['recorded', 'recorded', 'recorded', 'recorded'],
    ['recorded', 'recorded', 'missed', 'recorded'],
    ['recorded', 'open', 'open', 'open'],
  ];
  return (
    <GlyphBox size={size}>
      {rows.map((y, r) =>
        cols.map((x, c) => {
          const s = states[r]![c]!;
          return s === 'recorded' ? (
            <rect key={`${r}${c}`} x={x} y={y} width="7" height="6" rx="1.5" fill="currentColor" stroke="none" />
          ) : s === 'missed' ? (
            <rect key={`${r}${c}`} x={x + 0.5} y={y + 0.5} width="6" height="5" rx="1.5" strokeWidth="1.4" strokeDasharray="2 1.4" />
          ) : (
            <rect key={`${r}${c}`} x={x + 0.5} y={y + 0.5} width="6" height="5" rx="1.5" strokeWidth="1.4" />
          );
        }),
      )}
    </GlyphBox>
  );
}

function tile(data: Data, lang: Lang): KindTile | null {
  const { total, done, missed } = counts(data);
  if (total === 0) return null;
  const running = data.dayState === 'running';
  return {
    value: `${num(done)} / ${num(total)}`,
    sub: running
      ? sayWords(W.winSoFar, lang)
      : missed > 0
        ? sayWords(W.tileMissed(missed), lang)
        : sayWords(W.tileDone, lang),
    status: missed > 0 ? 'attention' : running ? 'waiting' : 'ok',
  };
}

function alert(data: Data, lang: Lang): KindAlert | null {
  const { missed } = counts(data);
  if (data.dayState === 'running' || missed <= 0) return null;
  return {
    headline: sayWords(W.alertHead(missed), lang),
    line: sayWords(W.alertLine, lang),
    severity: 'attention',
  };
}

function headline(data: Data, lang: Lang): string {
  const { total, done, missed } = counts(data);
  if (total === 0) return sayWords(W.title, lang);
  const day = dayWords(data.businessDate, lang);
  const figure = `${num(done)} / ${num(total)}`;
  const tail =
    data.dayState === 'running'
      ? `, ${sayWords(W.winSoFar, lang)}`
      : missed > 0
        ? `, ${plural(missed, () => ({ hi: '1 छूट गई', hl: '1 chhoot gayi', en: '1 missed' }), (n) => ({ hi: `${n} छूट गईं`, hl: `${n} chhoot gayi`, en: `${n} missed` }), lang)}`
        : '';
  return `${sayWords(W.title, lang)}${day ? ` ${day}` : ''}: ${figure}${tail}`;
}

function share(data: Data, lang: Lang): string {
  const day = dayWords(data.businessDate, lang);
  const checkedAt = stampWords(data.lastCheckAt, lang);
  const lines = [`${sayWords(W.shareTitle, lang)}${day ? ` · ${day}` : ''}`, leadText(data, lang)];
  if (data.dayState !== 'running' && counts(data).missed > 0) {
    lines.push(plural(counts(data).missed, () => W.missedOne, W.missedMany, lang));
  }
  if (checkedAt) lines.push(sayWords(W.lastChecked(checkedAt), lang));
  return lines.join('\n');
}

export const view: KindView<'water_ingress'> = {
  kind: 'water_ingress',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
};
