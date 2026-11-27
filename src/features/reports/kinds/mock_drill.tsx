import {
  Bomb,
  Camera,
  Car,
  CloudLightning,
  Cross,
  Droplets,
  Flame,
  Fuel,
  ShieldAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Num, SectionCard, StatTile } from '@/components/kit';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { MockDrillData, MockDrillSnapFamily } from '@dk/shared/types';

import {
  sayWords,
  type KindView,
  type OverlayProps,
  type ReportAction,
  type ReportActionContext,
  type Words,
} from '../types';

import {
  FiledByLine,
  GlyphBox,
  Lead,
  Line,
  PhotoFrame,
  QuotedBox,
  TickPath,
  fmtClock,
  fmtDay,
  fmtMinutes,
  fmtSeconds,
  istOf,
  lineHeight,
  photoUrl,
  usePhotoViewer,
  words,
} from './_paperwork';

/**
 * Mock drill (ADR 0056): a STOPWATCH DIAL with the drill's length, above a RESPONSE-TIME
 * BAR LINE, expected seconds as a thin outline bar and actual seconds as a thick filled
 * bar, with both numbers printed. Outline against filled tells them apart without colour.
 */

type Data = MockDrillData;

const FAMILY: Record<MockDrillSnapFamily, { Icon: LucideIcon; name: Words }> = {
  fire: { Icon: Flame, name: words('आग', 'Aag', 'Fire') },
  spill: { Icon: Droplets, name: words('तेल गिरना', 'Tel girna', 'Fuel spill') },
  leak: { Icon: Fuel, name: words('रिसाव', 'Risaav', 'Leak') },
  electric: { Icon: Zap, name: words('बिजली', 'Bijli', 'Electrical') },
  vehicle: { Icon: Car, name: words('गाड़ी', 'Gaadi', 'Vehicle') },
  injury: { Icon: Cross, name: words('चोट', 'Chot', 'Injury') },
  security: {
    Icon: ShieldAlert,
    name: words('सुरक्षा ख़तरा', 'Suraksha khatra', 'Security threat'),
  },
  natural: {
    Icon: CloudLightning,
    name: words('प्राकृतिक आपदा', 'Kudrati aapda', 'Natural disaster'),
  },
  explosion: { Icon: Bomb, name: words('धमाका', 'Dhamaka', 'Explosion') },
};

/** The portal's nine response rows, by their index (siren first). */
const STEP_NAMES: readonly Words[] = [
  words('सायरन', 'Siren', 'Siren'),
  words('मुख्य नियंत्रक', 'Mukhya niyantrak', 'Chief controller'),
  words('साइट नियंत्रक', 'Site niyantrak', 'Site controller'),
  words('फायर टीम', 'Fire team', 'Fire team'),
  words('मेडिकल टीम', 'Medical team', 'Medical team'),
  words('सिक्योरिटी', 'Security', 'Security'),
  words('पड़ोसी मदद', 'Padosi madad', 'Mutual aid'),
  words('इमरजेंसी टीम', 'Emergency team', 'Emergency team'),
  words('दूसरे', 'Doosre', 'Others'),
];

const t = {
  iocSays: words('IndianOil ने लिखा', 'IndianOil ne likha', 'IndianOil says'),
  responseTitle: words(
    'कितनी देर में काम शुरू हुआ',
    'Kitni der mein kaam shuru hua',
    'How fast each step started',
  ),
  expected: words('तय समय', 'Tay samay', 'Expected'),
  actual: words('असल में', 'Asal mein', 'Actual'),
  photo1: words('फोटो 1', 'Photo 1', 'Photo 1'),
  photo2: words('फोटो 2', 'Photo 2', 'Photo 2'),
  progressTitle: words('अब तक का हाल', 'Ab tak ka haal', 'Where it stands'),
  stDone: words('हो गया', 'Ho gaya', 'Done'),
  stNow: words('अभी', 'Abhi', 'Now'),
  stNext: words('आगे', 'Aage', 'Next'),
  stLook: words('ध्यान दें', 'Dhyan dein', 'Needs a look'),
};

/** The time part of the portal's `YYYY-MM-DD HH:mm`. */
function clockOf(stamp: string | undefined): string | null {
  const m = /(\d{1,2}:\d{2})\s*$/.exec(stamp ?? '');
  return m ? m[1]! : null;
}

function drillDay(data: Data): string | null {
  return data.drillDay ?? istOf(data.filedAt ?? data.receivedAt)?.day ?? null;
}

function stepName(step: number, lang: Lang): string {
  const w = STEP_NAMES[step];
  return w
    ? sayWords(w, lang)
    : sayWords(words(`कदम ${step + 1}`, `Kadam ${step + 1}`, `Step ${step + 1}`), lang);
}

/** The response rows that were used (a row with both times 0 is a step the drill did not run). */
export function usedResponse(data: Data): NonNullable<Data['response']> {
  return [...(data.response ?? [])]
    .filter((r) => r.expectedSec > 0 || r.actualSec > 0)
    .sort((a, b) => a.step - b.step);
}

/** How many of the used steps started within the expected time: 7 of 9. Null when no step ran. */
export function stepsOnTime(
  rows: NonNullable<Data['response']>,
): { onTime: number; total: number } | null {
  if (rows.length === 0) return null;
  return { onTime: rows.filter((r) => r.actualSec <= r.expectedSec).length, total: rows.length };
}

function lead(data: Data, lang: Lang): string {
  return sayWords(
    data.stage === 'received'
      ? words(
          'हम आपकी फोटो जाँच रहे हैं। उसके बाद रिपोर्ट जमा करेंगे।',
          'Hum aapki photo jaanch rahe hain. Uske baad report jama karenge.',
          'We are checking your photos. Then we file it.',
        )
      : words(
          'हमने आपकी मॉक ड्रिल रिपोर्ट IndianOil के पोर्टल पर जमा कर दी है।',
          'Humne aapki mock drill report IndianOil ke portal par jama kar di hai.',
          "We filed your mock drill report on IndianOil's portal.",
        ),
    lang,
  );
}

// ── the dial ────────────────────────────────────────────────────────────────

const CX = 66;
const CY = 70;
const R = 58;

function polar(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function Dial({ minutes, lang }: { minutes: number | null; lang: Lang }): ReactElement {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const a = polar(major ? R - 9 : R - 5, i * 6);
    const b = polar(R - 1, i * 6);
    return (
      <line
        key={i}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="currentColor"
        strokeWidth={major ? 2.2 : 1}
        strokeLinecap="round"
      />
    );
  });
  let wedge: ReactElement | null = null;
  let hand: ReactElement | null = null;
  if (minutes !== null && minutes > 0) {
    const full = minutes % 60 === 0;
    const deg = full ? 360 : (minutes % 60) * 6;
    const end = polar(R - 12, full ? 359.99 : deg);
    const start = polar(R - 12, 0);
    wedge = full ? (
      <circle cx={CX} cy={CY} r={R - 12} className="fill-kind-paperwork" fillOpacity="0.18" />
    ) : (
      <path
        d={`M ${CX} ${CY} L ${start.x} ${start.y} A ${R - 12} ${R - 12} 0 ${deg > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`}
        className="fill-kind-paperwork"
        fillOpacity="0.18"
      />
    );
    const tip = polar(R - 14, full ? 0 : deg);
    hand = (
      <line
        x1={CX}
        y1={CY}
        x2={tip.x}
        y2={tip.y}
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    );
  }
  const spoken = minutes === null ? '' : fmtMinutes(minutes, lang);
  return (
    <svg
      role="img"
      aria-label={spoken}
      width="132"
      height="140"
      viewBox="0 0 132 140"
      focusable="false"
      className="shrink-0 text-kind-paperwork-ink"
    >
      {/* the crown and the stem of a stopwatch */}
      <rect x="57" y="1" width="18" height="7" rx="2" fill="currentColor" />
      <rect x="62" y="7" width="8" height="6" fill="currentColor" />
      <circle
        cx={CX}
        cy={CY}
        r={R}
        className="fill-kind-paperwork-soft"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      {wedge}
      {ticks}
      {hand}
      <circle cx={CX} cy={CY} r="4.5" fill="currentColor" />
      <text
        x={CX}
        y={CY + 36}
        textAnchor="middle"
        fontSize="16"
        fontWeight="800"
        fill="currentColor"
      >
        {minutes === null ? '—' : fmtMinutes(minutes, lang)}
      </text>
    </svg>
  );
}

function Scenario({ data, lang }: { data: Data; lang: Lang }): ReactElement {
  const f = FAMILY[data.scenario.family];
  return (
    <div className="min-w-0 flex-[1_1_8rem] space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-kind-paperwork text-white">
          <f.Icon aria-hidden="true" className="h-6 w-6" />
        </span>
        <span className={`text-subheading text-text ${lineHeight(lang)}`}>
          {sayWords(f.name, lang)}
        </span>
      </div>
      {data.scenario.label ? (
        <QuotedBox title={sayWords(t.iocSays, lang)} lang={lang}>
          {data.scenario.label}
        </QuotedBox>
      ) : null}
    </div>
  );
}

// ── the response bars ───────────────────────────────────────────────────────

function ResponseBars({
  rows,
  lang,
}: {
  rows: NonNullable<Data['response']>;
  lang: Lang;
}): ReactElement {
  const max = Math.max(1, ...rows.flatMap((r) => [r.expectedSec, r.actualSec]));
  const pct = (sec: number): number => (sec <= 0 ? 0.6 : Math.max(0.6, (sec / max) * 100));
  return (
    <SectionCard title={sayWords(t.responseTitle, lang)}>
      <ul className="m-0 list-none space-y-3 p-0">
        {rows.map((r) => (
          <li key={r.step} data-step={r.step}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className={`text-subheading text-text ${lineHeight(lang)}`}>
                {stepName(r.step, lang)}
              </span>
              <span className={`text-body text-text ${lineHeight(lang)}`}>
                {sayWords(
                  words(
                    `${fmtSeconds(r.actualSec, 'hi')} में (तय समय: ${fmtSeconds(r.expectedSec, 'hi')})`,
                    `${fmtSeconds(r.actualSec, 'hl')} mein (tay samay: ${fmtSeconds(r.expectedSec, 'hl')})`,
                    `In ${fmtSeconds(r.actualSec, 'en')} (expected ${fmtSeconds(r.expectedSec, 'en')})`,
                  ),
                  lang,
                )}
              </span>
            </div>
            <svg
              viewBox="0 0 100 16"
              preserveAspectRatio="none"
              width="100%"
              height="16"
              aria-hidden="true"
              focusable="false"
              className="mt-1 block text-kind-paperwork-ink"
            >
              <rect
                x="0"
                y="1"
                width={pct(r.expectedSec)}
                height="4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <rect x="0" y="7" width={pct(r.actualSec)} height="8" fill="currentColor" />
            </svg>
          </li>
        ))}
      </ul>
      <ul
        className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-body text-text"
        aria-hidden="true"
      >
        <li className="flex items-center gap-1.5">
          <svg
            width="28"
            height="10"
            viewBox="0 0 28 10"
            focusable="false"
            className="text-kind-paperwork-ink"
          >
            <rect
              x="1"
              y="2"
              width="26"
              height="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          {sayWords(t.expected, lang)}
        </li>
        <li className="flex items-center gap-1.5">
          <svg
            width="28"
            height="10"
            viewBox="0 0 28 10"
            focusable="false"
            className="text-kind-paperwork-ink"
          >
            <rect x="0" y="0" width="28" height="10" fill="currentColor" />
          </svg>
          {sayWords(t.actual, lang)}
        </li>
      </ul>
    </SectionCard>
  );
}

// ── the progress list ───────────────────────────────────────────────────────

type StepState = 'done' | 'now' | 'next' | 'look';

interface Step {
  state: StepState;
  text: string;
}

/** The four steps. The last is drawn from the portal state as it was known at sending, and says so. */
export function progressSteps(data: Data, lang: Lang): Step[] {
  const filed = data.stage === 'filed';
  const day = fmtDay(istOf(data.filedAt)?.day ?? drillDay(data), lang);
  const say = (hi: string, hl: string, en: string): string => sayWords(words(hi, hl, en), lang);
  let officer: Step;
  if (!filed) {
    officer = {
      state: 'next',
      text: say(
        'IndianOil के अफसर की मंज़ूरी',
        'IndianOil officer ki manzoori',
        "IndianOil's officer approves",
      ),
    };
  } else if (data.portalState === 'pending_approval') {
    officer = {
      state: 'now',
      text: say(
        `IndianOil के अफसर का इंतज़ार (${day} तक का हाल)`,
        `IndianOil officer ka intezaar (${day} tak ka haal)`,
        `Waiting for IndianOil's officer (as of ${day})`,
      ),
    };
  } else if (data.portalState === 'returned') {
    officer = {
      state: 'look',
      text: say(
        'IndianOil ने इसे लौटा दिया है। चैट में फोटो दोबारा भेजें।',
        'IndianOil ne ise lauta diya hai. Chat mein photo dobara bhejein.',
        'IndianOil sent it back. Please send the photos again in the chat.',
      ),
    };
  } else {
    officer = {
      state: 'next',
      text: say(
        `${day} को जमा हुई। मंज़ूरी IndianOil के हाथ में है।`,
        `${day} ko jama hui. Manzoori IndianOil ke haath mein hai.`,
        `Filed ${day}. The approval is IndianOil's.`,
      ),
    };
  }
  return [
    {
      state: 'done',
      text: say('आपकी रिपोर्ट मिल गई', 'Aapki report mil gayi', 'Your report arrived'),
    },
    {
      state: filed ? 'done' : 'now',
      text: say('हमने फोटो जाँच लीं', 'Humne photo jaanch li', 'We checked the photos'),
    },
    {
      state: filed ? 'done' : 'next',
      text: say('पोर्टल पर जमा हुई', 'Portal par jama hui', 'Filed on the portal'),
    },
    officer,
  ];
}

function StepIcon({ state }: { state: StepState }): ReactElement {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 text-kind-paperwork-ink"
    >
      {state === 'done' ? (
        <>
          <circle cx="14" cy="14" r="12" fill="currentColor" />
          <TickPath x={4} y={4} stroke="#fff" width={2.6} />
        </>
      ) : state === 'now' ? (
        <>
          <circle cx="14" cy="14" r="11" {...common} />
          <path d="M14 8v6l4 2.5" {...common} />
        </>
      ) : state === 'look' ? (
        <>
          <polygon points="14,3 26,24 2,24" {...common} />
          <path d="M14 11v6" {...common} />
          <circle cx="14" cy="20.5" r="1.2" fill="currentColor" />
        </>
      ) : (
        <circle cx="14" cy="14" r="11" {...common} strokeDasharray="3 4" />
      )}
    </svg>
  );
}

const STATE_WORD: Record<StepState, Words> = {
  done: t.stDone,
  now: t.stNow,
  next: t.stNext,
  look: t.stLook,
};

function Progress({ data, lang }: { data: Data; lang: Lang }): ReactElement {
  const steps = progressSteps(data, lang);
  return (
    <SectionCard title={sayWords(t.progressTitle, lang)}>
      <ol aria-label={sayWords(t.progressTitle, lang)} className="m-0 list-none space-y-2 p-0">
        {steps.map((s, i) => (
          <li key={i} data-state={s.state} className="flex min-h-12 items-center gap-3">
            <StepIcon state={s.state} />
            <span className={`text-body text-text ${lineHeight(lang)}`}>
              <span className="sr-only">{`${sayWords(STATE_WORD[s.state], lang)}: `}</span>
              {s.text}
            </span>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

// ── the overlay ─────────────────────────────────────────────────────────────

function Overlay({ data, report, lang }: OverlayProps<'mock_drill'>): ReactElement {
  const rows = usedResponse(data);
  const start = data.startTime ? fmtClock(data.startTime, lang) : null;
  const clear = clockOf(data.allClear);
  const present = data.personsPresent;
  const short = data.headCountShort;
  const photos = data.photos.slice(0, 2);
  const day = drillDay(data);
  const dayLabel = day ? fmtDay(day, lang) : null;
  const onTime = stepsOnTime(rows);
  const photoLabel = (i: number) => sayWords(i === 0 ? t.photo1 : t.photo2, lang);
  // The signed copies come from the report route; a tap opens the app's own picture viewer, never a new tab.
  const { open: openPhoto, viewer: photoViewer } = usePhotoViewer(
    report,
    photos.map((p, i) => ({ key: p.key, label: photoLabel(i), mime: p.mime })),
  );
  return (
    <div data-kind="mock_drill" className="space-y-4 p-4">
      <Lead lang={lang}>{lead(data, lang)}</Lead>
      <div className="flex flex-wrap items-start gap-4">
        <div className="mx-auto flex flex-col items-center sm:mx-0">
          <Dial minutes={data.durationMinutes} lang={lang} />
          <ul className={`m-0 list-none p-0 text-center text-body text-text ${lineHeight(lang)}`}>
            {start ? (
              <li>
                {sayWords(words(`शुरू: ${start}`, `Shuru: ${start}`, `Started ${start}`), lang)}
              </li>
            ) : null}
            {clear ? (
              <li>
                {sayWords(
                  words(
                    `सब ठीक: ${fmtClock(clear, lang)}`,
                    `All clear: ${fmtClock(clear, lang)}`,
                    `All clear ${fmtClock(clear, lang)}`,
                  ),
                  lang,
                )}
              </li>
            ) : null}
          </ul>
        </div>
        <Scenario data={data} lang={lang} />
      </div>
      {rows.length > 0 ? <ResponseBars rows={rows} lang={lang} /> : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
        {dayLabel ? (
          <StatTile
            label={translate(lang, 'rv2.drill.day')}
            value={dayLabel}
            ariaLabel={`${translate(lang, 'rv2.drill.day')}: ${dayLabel}`}
          />
        ) : null}
        {present !== undefined ? (
          <StatTile
            label={translate(lang, 'rv2.drill.people')}
            value={<Num value={present} />}
            caption={
              short !== undefined ? translate(lang, 'rv2.drill.short', { n: short }) : undefined
            }
            ariaLabel={`${translate(lang, 'rv2.drill.people')}: ${present}`}
          />
        ) : null}
        {onTime ? (
          <StatTile
            label={translate(lang, 'rv2.drill.onTime')}
            value={translate(lang, 'rv2.drill.onTimeValue', { a: onTime.onTime, b: onTime.total })}
            ariaLabel={`${translate(lang, 'rv2.drill.onTime')}: ${translate(lang, 'rv2.drill.onTimeValue', { a: onTime.onTime, b: onTime.total })}`}
          />
        ) : null}
      </div>
      <Line lang={lang} className="text-text-muted">
        {sayWords(
          words(
            `ड्रिल का लेवल ${data.level}`,
            `Drill ka level ${data.level}`,
            `Level ${data.level} drill`,
          ),
          lang,
        )}
      </Line>
      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <PhotoFrame
              key={p.key}
              src={photoUrl(report, p.key)}
              label={photoLabel(i)}
              size={148}
              lang={lang}
              onOpen={() => openPhoto(p.key)}
            />
          ))}
        </div>
      ) : null}
      {photoViewer}
      <Progress data={data} lang={lang} />
      {data.stage === 'filed' ? <FiledByLine lang={lang} /> : null}
    </div>
  );
}

/** The 40 x 28 mini signature: a small stopwatch. */
function Glyph({ size = 28 }: { size?: number }): ReactElement {
  return (
    <GlyphBox size={size}>
      <rect x="17" y="1" width="6" height="3" rx="1" fill="currentColor" />
      <circle cx="20" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M20 16V9.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 16l4.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M29 6.5l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </GlyphBox>
  );
}

function headline(data: Data, lang: Lang): string {
  if (data.stage === 'received') {
    return sayWords(
      words(
        'मॉक ड्रिल मिली, फोटो जाँच रहे हैं',
        'Mock drill mili, photo jaanch rahe hain',
        'Mock drill received, checking the photos',
      ),
      lang,
    );
  }
  const d = fmtDay(drillDay(data), lang);
  const len = data.durationMinutes !== null ? `, ${fmtMinutes(data.durationMinutes, lang)}` : '';
  return sayWords(
    words(
      `मॉक ड्रिल जमा, ${d}${len}`,
      `Mock drill jama, ${d}${len}`,
      `Mock drill filed, ${d}${len}`,
    ),
    lang,
  );
}

function share(data: Data, lang: Lang): string {
  const lines = [headline(data, lang)];
  const start = data.startTime ? fmtClock(data.startTime, lang) : null;
  const clear = clockOf(data.allClear);
  if (start)
    lines.push(
      sayWords(words(`शुरू: ${start}`, `Shuru: ${start}`, `Started ${start}`), lang) +
        (clear
          ? ` · ${sayWords(words(`सब ठीक: ${fmtClock(clear, lang)}`, `All clear: ${fmtClock(clear, lang)}`, `All clear ${fmtClock(clear, lang)}`), lang)}`
          : ''),
    );
  if (data.personsPresent !== undefined) {
    lines.push(
      sayWords(
        words(
          `मौजूद लोग: ${data.personsPresent}`,
          `Maujood log: ${data.personsPresent}`,
          `People present ${data.personsPresent}`,
        ),
        lang,
      ),
    );
  }
  return lines.join('\n');
}

/**
 * IndianOil sent the drill back and wants the photos again: the button opens the chat at the mock
 * drill's own box, where they are sent. A drill that is waiting or approved needs nothing from the dealer.
 */
function actions(data: MockDrillData, _report: unknown, ctx: ReportActionContext): ReportAction[] {
  if (data.portalState !== 'returned') return [];
  return [
    {
      id: 'send-photos-again',
      icon: Camera,
      label: words('फोटो दोबारा भेजें', 'Photo dobara bhejein', 'Send photos again'),
      run: () => ctx.openChatAtTask('mock_drill'),
    },
  ];
}

export const view: KindView<'mock_drill'> = {
  kind: 'mock_drill',
  Overlay,
  Glyph,
  tile: () => null,
  alert: () => null,
  headline,
  share,
  actions,
};
