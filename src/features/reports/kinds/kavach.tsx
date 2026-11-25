import { Camera, Check, Clock, Hourglass, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import type { Lang } from '@/store/lang';
import type { KavachAsk, ReportDataOf } from '@dk/shared/types';

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
  BlockTitle,
  ChatButton,
  GlyphBox,
  Lead,
  More,
  Note,
  dayWords,
  leading,
  num,
  stampWords,
  twoLang,
  useSvgId,
} from './_supplyKit';

/**
 * Kavach score (ADR 0056): the SHIELD. It fills from the bottom to the score, with a ring
 * of small dots around it, and the camera rows for whatever the dealer must send come first,
 * because this is the only place the dealer sees the list. A shield is MDG's own mark, so it
 * wears brand black.
 *
 * Three states, never a 0% that is not a verdict:
 *  - scored and publishable: the number, a tier in WORDS (no red alarm: a low score is as
 *    likely to be our queue as the dealer);
 *  - scored but withheld (settling in): an hourglass and no number at all;
 *  - not scored yet: an empty outline with a question mark.
 */

type Data = ReportDataOf<'kavach'>;
type Pending = Data['pending'][number];

export type KavachState = 'score' | 'settling' | 'unscored';

/** Which of the three states the snapshot is in. A withheld score never reads as a number. */
export function stateOf(data: Data): KavachState {
  if (!data.scored) return 'unscored';
  if (data.scorePublishable && typeof data.pct === 'number' && Number.isFinite(data.pct)) return 'score';
  return 'settling';
}

/** The score, held between 0 and 100, rounded. Only meaningful in the `score` state. */
function pctOf(data: Data): number {
  return Math.max(0, Math.min(100, Math.round(data.pct ?? 0)));
}

/** The tier, in words only. The same cut-offs the picture used to print. */
function tierWords(pct: number): Words {
  if (pct >= 90) return { hi: 'बहुत बढ़िया', hl: 'Bahut badhiya', en: 'Excellent' };
  if (pct >= 75) return { hi: 'ठीक है', hl: 'Theek hai', en: 'Good' };
  if (pct >= 50) return { hi: 'ध्यान दें', hl: 'Dhyaan dijiye', en: 'Needs attention' };
  return { hi: 'काम बाक़ी है', hl: 'Kaam baaki hai', en: 'Work outstanding' };
}

const PENDING_WORD: Record<Pending['status'], Words> = {
  EXPIRED: { hi: 'ख़त्म हो गया', hl: 'Khatam ho gaya', en: 'Expired' },
  EXPIRING_SOON: { hi: 'जल्द ख़त्म', hl: 'Jaldi khatam', en: 'Ends soon' },
  NOT_YET_VERIFIED: { hi: 'अभी जाँचा नहीं', hl: 'Abhi jaancha nahi', en: 'Not checked yet' },
  SOS_FLAGGED: { hi: 'SOS', hl: 'SOS', en: 'SOS' },
};

const W = {
  scoreLead: (pct: number): Words => ({
    hi: `आज आपका कवच स्कोर ${pct}% है।`,
    hl: `Aaj aapka Kavach score ${pct}% hai.`,
    en: `Your Kavach score is ${pct}% today.`,
  }),
  settlingLead: {
    hi: 'हम आपके पंप को जाँच रहे हैं। जाँच पूरी होने पर स्कोर यहाँ दिखेगा।',
    hl: 'Hum aapke pump ko jaanch rahe hain. Jaanch poori hone par score yahan dikhega.',
    en: 'We are checking your pump. The score will show here when we are done.',
  } satisfies Words,
  unscoredLead: {
    hi: 'अभी कोई अंक नहीं। हमने जाँच शुरू नहीं की है।',
    hl: 'Abhi koi score nahi. Humne jaanch shuru nahi ki hai.',
    en: 'No score yet. We have not started checking.',
  } satisfies Words,
  asksTitle: (n: number): Words => ({
    hi: `हमें आपसे ${n} फ़ोटो चाहिए`,
    hl: `Humein aapse ${n} photo chahiye`,
    en: `We need ${n} ${n === 1 ? 'photo' : 'photos'} from you`,
  }),
  points: (n: number): Words => ({
    hi: `${num(n)} अंक`,
    hl: `${num(n)} ank`,
    en: n === 1 ? '1 point' : `${num(n)} points`,
  }),
  sendPhoto: { hi: 'फ़ोटो भेजें', hl: 'Photo bhejein', en: 'Send photo' } satisfies Words,
  sendPhotoFor: (what: string): Words => ({
    hi: `फ़ोटो भेजें: ${what}`,
    hl: `Photo bhejein: ${what}`,
    en: `Send photo for ${what}`,
  }),
  resend: {
    hi: 'फ़ोटो दोबारा भेजें, पिछली ठीक नहीं थी।',
    hl: 'Photo dobara bhejiye, pichhli theek nahi thi.',
    en: 'Please send the photo again.',
  } satisfies Words,
  unchecked: (n: number): Words => ({
    hi: `हमने अभी ${n} चीज़ें जाँची नहीं हैं।`,
    hl: `Humne abhi ${n} cheezein jaanchi nahi hain.`,
    en: `We have not checked ${n} ${n === 1 ? 'item' : 'items'} yet.`,
  }),
  pendingTitle: { hi: 'अभी बाकी', hl: 'Abhi baaki', en: 'Still pending' } satisfies Words,
  more: (n: number): Words => ({ hi: `और ${n}`, hl: `aur ${n}`, en: `and ${n} more` }),
  seeAll: { hi: 'चैट में सब देखें', hl: 'Chat mein sab dekhein', en: 'See all in chat' } satisfies Words,
  allChecked: {
    hi: 'सब कुछ जाँचा हुआ है। शाबाश!',
    hl: 'Sab kuch jaancha hua hai. Shabaash!',
    en: 'Everything is checked. Well done.',
  } satisfies Words,
  moreTitle: { hi: 'अंक कैसे गिने गए', hl: 'Ank kaise gine gaye', en: 'How the points were counted' } satisfies Words,
  moreBody: (valid: number, total: number): Words => ({
    hi: `जाँचे गए ${num(total)} अंकों में से ${num(valid)} पूरे हैं।`,
    hl: `Jaanche gaye ${num(total)} ank mein se ${num(valid)} poore hain.`,
    en: `${num(valid)} of the ${num(total)} points we counted are complete.`,
  }),
  checkedAt: (when: string): Words => ({
    hi: `जाँच का समय: ${when}`,
    hl: `Jaanch ka time: ${when}`,
    en: `Checked ${when}`,
  }),
  noScoreShield: { hi: 'अभी अंक नहीं', hl: 'Abhi score nahi', en: 'No score yet' } satisfies Words,
  settlingShield: { hi: 'जाँच जारी है', hl: 'Jaanch jaari hai', en: 'Being checked' } satisfies Words,
  title: { hi: 'कवच स्कोर', hl: 'Kavach score', en: 'Kavach score' } satisfies Words,
  tileSettling: { hi: 'हम आपके पंप को जाँच रहे हैं', hl: 'Hum aapke pump ko jaanch rahe hain', en: 'We are checking your pump' } satisfies Words,
  tileSettlingShort: { hi: 'जाँच जारी', hl: 'Jaanch jaari', en: 'Checking' } satisfies Words,
  tileUnscored: { hi: 'अभी अंक नहीं', hl: 'Abhi score nahi', en: 'Not scored yet' } satisfies Words,
  photosNeeded: (n: number): Words => ({
    hi: `${n} फ़ोटो चाहिए`,
    hl: `${n} photo chahiye`,
    en: n === 1 ? '1 photo needed' : `${n} photos needed`,
  }),
  uncheckedShort: (n: number): Words => ({
    hi: `${n} अभी जाँचे नहीं`,
    hl: `${n} abhi jaanche nahi`,
    en: `${n} not checked yet`,
  }),
  scoreShort: (pct: number): Words => ({ hi: `${pct}%`, hl: `${pct}%`, en: `${pct}%` }),
};

// ── the shield ─────────────────────────────────────────────────────────────────

const SHIELD = 'M90 8L160 32V96C160 146 128 178 90 194C52 178 20 146 20 96V32Z';
const RING_DOTS = 20;

/**
 * The shield, 176 px, filling from the bottom to `pct`, in a ring of twenty dots (a dot
 * stands for a twentieth of the score; decorative). `state` picks the number, the hourglass
 * or the question mark. The number sits on a plain plate so it reads on black and on the
 * empty hatched part alike.
 */
function Shield({
  state,
  pct,
  allChecked,
}: {
  state: KavachState;
  pct: number;
  allChecked: boolean;
}): React.ReactElement {
  const clipId = useSvgId('kv-clip');
  const level = state === 'score' ? pct : 0;
  const top = 194 - (186 * level) / 100;
  const lit = state === 'score' ? Math.round((pct / 100) * RING_DOTS) : 0;
  const dots = Array.from({ length: RING_DOTS }, (_, i) => {
    const a = (i / RING_DOTS) * 2 * Math.PI - Math.PI / 2;
    return { x: 120 + 108 * Math.cos(a), y: 112 + 108 * Math.sin(a), on: i < lit };
  });
  return (
    <svg
      viewBox="0 0 240 228"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-testid="kavach-shield"
      data-state={state}
      data-level={level}
      className="mx-auto block h-auto w-44 max-w-full"
    >
      <g data-testid="kavach-dots">
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="4.5"
            data-on={d.on ? 'true' : 'false'}
            className={d.on ? 'fill-kind-kavach-ink' : 'fill-none stroke-kind-kavach-ink'}
            strokeWidth="1.6"
            opacity={d.on ? 1 : 0.45}
          />
        ))}
      </g>
      <g transform="translate(30 14)">
        <defs>
          <clipPath id={clipId}>
            <path d={SHIELD} />
          </clipPath>
        </defs>
        <path d={SHIELD} className="fill-kind-kavach-soft" />
        <g clipPath={`url(#${clipId})`}>
          {/* the empty part is hatched, a pattern and not a colour */}
          <path
            d="M0 40L60 -20M0 80L100 -20M0 120L140 -20M0 160L180 -20M0 200L200 0M40 200L200 40M80 200L200 80M120 200L200 120"
            className="stroke-kind-kavach-ink"
            strokeWidth="2"
            opacity="0.18"
            fill="none"
          />
          {level > 0 ? (
            <rect x="0" y={top} width="180" height={200 - top} className="fill-kind-kavach-ink" data-testid="kavach-fill" />
          ) : null}
        </g>
        <path d={SHIELD} fill="none" className="stroke-kind-kavach-ink" strokeWidth="7" strokeLinejoin="round" />
        {state === 'score' ? (
          <>
            <rect x="34" y="72" width="112" height="62" rx="14" className="fill-surface stroke-kind-kavach-ink" strokeWidth="3" />
            <text x="90" y="118" textAnchor="middle" fontSize="42" fontWeight="800" className="fill-text">
              {pct}%
            </text>
          </>
        ) : state === 'settling' ? (
          <>
            <rect x="48" y="62" width="84" height="84" rx="16" className="fill-surface stroke-kind-kavach-ink" strokeWidth="3" />
            <path d="M68 76H112L90 104Z M90 104L112 132H68Z" className="fill-kind-kavach-ink" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <rect x="48" y="62" width="84" height="84" rx="16" className="fill-surface stroke-kind-kavach-ink" strokeWidth="3" />
            <text x="90" y="124" textAnchor="middle" fontSize="60" fontWeight="800" className="fill-kind-kavach-ink">
              ?
            </text>
          </>
        )}
      </g>
      {allChecked ? (
        <g data-testid="kavach-tick">
          <circle cx="204" cy="44" r="20" className="fill-status-ok" />
          <path d="M194 44l7 7 14-15" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
    </svg>
  );
}

// ── rows ───────────────────────────────────────────────────────────────────────

function AskRow({
  ask,
  lang,
  report,
}: {
  ask: KavachAsk;
  lang: Lang;
  report: OverlayProps<'kavach'>['report'];
}): React.ReactElement {
  const label = twoLang(ask.label, lang) || ask.code;
  return (
    <li
      data-testid="kavach-ask"
      data-ask={ask.itemId}
      data-state={ask.state}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3"
    >
      <div className={`flex items-start gap-3 ${leading(lang)}`}>
        <Camera aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-kind-kavach-ink" />
        <div className="min-w-0">
          <p className="break-words text-subheading text-text">{label}</p>
          <p className="text-body text-text-muted">{sayWords(W.points(ask.points), lang)}</p>
          {ask.state === 'rejected' ? (
            <p className="mt-1 flex items-start gap-1.5 text-subheading text-status-attention-ink">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{sayWords(W.resend, lang)}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <ChatButton
          report={report}
          ask={`kv:${ask.itemId}`}
          testId={`kavach-send-${ask.itemId}`}
          label={sayWords(W.sendPhotoFor(label), lang)}
          icon={<Camera aria-hidden="true" className="h-5 w-5" />}
        >
          {sayWords(W.sendPhoto, lang)}
        </ChatButton>
      </div>
    </li>
  );
}

function PendingIcon({ status }: { status: Pending['status'] }): React.ReactElement {
  const cls = 'h-4 w-4 shrink-0';
  if (status === 'EXPIRED' || status === 'SOS_FLAGGED') return <TriangleAlert aria-hidden="true" className={cls} />;
  if (status === 'EXPIRING_SOON') return <Clock aria-hidden="true" className={cls} />;
  return <Hourglass aria-hidden="true" className={cls} />;
}

function PendingRow({ item, lang }: { item: Pending; lang: Lang }): React.ReactElement {
  const label = twoLang(item.label, lang) || item.code;
  return (
    <li
      data-testid="kavach-pending"
      data-status={item.status}
      className={`flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 ${leading(lang)}`}
    >
      <p className="break-words text-subheading text-text">{label}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-text-muted">
        <span>{sayWords(W.points(item.points), lang)}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-text">
          <PendingIcon status={item.status} />
          {sayWords(PENDING_WORD[item.status], lang)}
        </span>
      </p>
    </li>
  );
}

function leadText(data: Data, lang: Lang): string {
  const s = stateOf(data);
  if (s === 'score') return sayWords(W.scoreLead(pctOf(data)), lang);
  return sayWords(s === 'settling' ? W.settlingLead : W.unscoredLead, lang);
}

function isAllChecked(data: Data): boolean {
  return (
    stateOf(data) === 'score' &&
    (data.asks ?? []).length === 0 &&
    (data.pending ?? []).length === 0 &&
    data.pendingOverflow === 0 &&
    data.unverifiedCount === 0
  );
}

function Overlay({ data, report, lang }: OverlayProps<'kavach'>): React.ReactElement {
  const state = stateOf(data);
  const pct = pctOf(data);
  const asks = data.asks ?? [];
  const pending = data.pending ?? [];
  const allChecked = isAllChecked(data);
  const checked = stampWords(data.computedAt, lang) || dayWords(data.businessDate, lang);
  const tier = state === 'score' ? sayWords(tierWords(pct), lang) : '';
  return (
    <div data-kind="kavach" data-state={state} className="flex flex-col gap-4 p-4">
      <Lead lang={lang}>{leadText(data, lang)}</Lead>

      {asks.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label={sayWords(W.asksTitle(asks.length), lang)} data-testid="kavach-asks">
          <BlockTitle>{sayWords(W.asksTitle(asks.length), lang)}</BlockTitle>
          <ul className="flex list-none flex-col gap-2 p-0">
            {asks.map((a) => (
              <AskRow key={a.itemId || a.code} ask={a} lang={lang} report={report} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col items-center gap-1">
        <Shield state={state} pct={pct} allChecked={allChecked} />
        {state === 'score' ? (
          <p className={`text-center text-subheading text-text ${leading(lang)}`} data-testid="kavach-tier">
            {tier}
          </p>
        ) : (
          <p className={`text-center text-subheading text-text ${leading(lang)}`}>
            {sayWords(state === 'settling' ? W.settlingShield : W.noScoreShield, lang)}
          </p>
        )}
      </div>

      {data.unverifiedCount > 0 ? (
        <Note
          lang={lang}
          tone="attention"
          icon={<Hourglass aria-hidden="true" className="h-5 w-5 text-status-attention-ink" />}
          testId="kavach-unchecked"
        >
          {sayWords(W.unchecked(data.unverifiedCount), lang)}
        </Note>
      ) : null}

      {allChecked ? (
        <Note
          lang={lang}
          tone="plain"
          icon={<Check aria-hidden="true" className="h-5 w-5 text-status-ok-ink" />}
          testId="kavach-all-checked"
        >
          <span className="font-semibold">{sayWords(W.allChecked, lang)}</span>
        </Note>
      ) : null}

      {pending.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label={sayWords(W.pendingTitle, lang)}>
          <BlockTitle>{sayWords(W.pendingTitle, lang)}</BlockTitle>
          <ul className="flex list-none flex-col gap-2 p-0">
            {pending.map((p) => (
              <PendingRow key={p.code} item={p} lang={lang} />
            ))}
          </ul>
          {data.pendingOverflow > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-subheading text-text" data-testid="kavach-overflow">
                {sayWords(W.more(data.pendingOverflow), lang)}
              </p>
              <ChatButton report={report} testId="kavach-see-all">
                {sayWords(W.seeAll, lang)}
              </ChatButton>
            </div>
          ) : null}
        </section>
      ) : null}

      {checked ? <p className="text-body text-text-muted">{sayWords(W.checkedAt(checked), lang)}</p> : null}

      {state === 'score' && typeof data.validPoints === 'number' && typeof data.totalPoints === 'number' ? (
        <More label={sayWords(W.moreTitle, lang)}>
          <p className={leading(lang)}>{sayWords(W.moreBody(data.validPoints, data.totalPoints), lang)}</p>
        </More>
      ) : null}
    </div>
  );
}

/** The 40 x 28 mini: a shield filled to about half. */
function Glyph({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <GlyphBox size={size}>
      <path d="M20 2L32 6V14C32 20 27 24 20 27C13 24 8 20 8 14V6Z" strokeWidth="2.4" />
      <path d="M8 15H32C32 21 27 24.5 20 27C13 24.5 8 21 8 15Z" fill="currentColor" stroke="none" />
    </GlyphBox>
  );
}

function tile(data: Data, lang: Lang): KindTile | null {
  const state = stateOf(data);
  const asks = (data.asks ?? []).length;
  if (state === 'unscored') {
    return {
      value: sayWords(W.tileUnscored, lang),
      sub: asks > 0 ? sayWords(W.photosNeeded(asks), lang) : undefined,
      status: 'info',
    };
  }
  if (state === 'settling') {
    // A short word is the big value; the sentence is the small line (a sentence at figure size
    // wraps to four lines in a half-width tile).
    const sentence = sayWords(W.tileSettling, lang);
    return {
      value: sayWords(W.tileSettlingShort, lang),
      sub: asks > 0 ? `${sentence} · ${sayWords(W.photosNeeded(asks), lang)}` : sentence,
      status: 'waiting',
    };
  }
  const pct = pctOf(data);
  const parts: string[] = [];
  if (asks > 0) parts.push(sayWords(W.photosNeeded(asks), lang));
  else {
    parts.push(sayWords(tierWords(pct), lang));
    if (data.unverifiedCount > 0) parts.push(sayWords(W.uncheckedShort(data.unverifiedCount), lang));
  }
  const status: ReportStatusKey = pct >= 90 ? 'ok' : 'waiting';
  return { value: `${pct}%`, sub: parts.join(' · '), status };
}

/** Kavach never raises an alert: a photo ask is a task, and a low score is as likely to be our queue as the dealer. */
function alert(): KindAlert | null {
  return null;
}

function headline(data: Data, lang: Lang): string {
  const state = stateOf(data);
  const asks = (data.asks ?? []).length;
  const base =
    state === 'score'
      ? `${sayWords(W.title, lang)} ${pctOf(data)}%`
      : state === 'settling'
        ? sayWords(W.tileSettling, lang)
        : sayWords(W.tileUnscored, lang);
  return asks > 0 ? `${base} · ${sayWords(W.photosNeeded(asks), lang)}` : base;
}

function share(data: Data, lang: Lang): string {
  const lines = [sayWords(W.title, lang), leadText(data, lang)];
  const asks = data.asks ?? [];
  if (asks.length > 0) {
    lines.push(sayWords(W.asksTitle(asks.length), lang));
    for (const a of asks) lines.push(`- ${twoLang(a.label, lang) || a.code} (${sayWords(W.points(a.points), lang)})`);
  }
  if (data.unverifiedCount > 0) lines.push(sayWords(W.unchecked(data.unverifiedCount), lang));
  return lines.join('\n');
}

/**
 * "Send photo": the first thing MDG waits for (a photo sent back comes first), opening the chat at
 * that ask's own box, where the dealer picks the photo. Nothing is offered when nothing is asked.
 */
function actions(data: ReportDataOf<'kavach'>, _report: unknown, ctx: ReportActionContext): ReportAction[] {
  const first = data.asks.find((a) => a.state === 'rejected') ?? data.asks[0];
  if (!first) return [];
  return [
    {
      id: 'send-photo',
      icon: Camera,
      label: W.sendPhoto,
      run: () => ctx.openChatAtAsk(`kv:${first.itemId}`),
    },
  ];
}

export const view: KindView<'kavach'> = {
  kind: 'kavach',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
  actions,
};
