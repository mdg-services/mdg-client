import { ExternalLink, Play } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { richText } from '@/lib/linkify';
import type { Lang } from '@/store/lang';
import { serviceLabel } from '@dk/shared';
import type { ReportDataOf } from '@dk/shared/types';

import { sayWords, type KindAlert, type KindTile, type KindView, type OverlayProps, type Words } from '../types';

import { GlyphBox, Note, dayWords, istParts, leading } from './_supplyKit';

/**
 * News from MDG (ADR 0056): the LETTER. A paper letter with an envelope flap is the one
 * "someone is writing to you" picture, so the dealer knows it is MDG talking. On the flap
 * sits the tone glyph: a star-burst for NEW, a bell for NOTICE, a triangle with a thicker
 * border for IMPORTANT. The tone is a shape and a word, never only a colour.
 *
 * The title and the text are the one place free text is shown: the admin wrote them in
 * Hinglish and every reader sees them as written. `*bold*` marks become real bold, links
 * become 48 px buttons that open in the browser, and a guide video that went with the news
 * opens in the app's own player. A long text scrolls under the shell's pinned header.
 */

type Data = ReportDataOf<'announcement'>;
type Tone = Data['tone'];

const TONE_WORD: Record<Tone, Words> = {
  new: { hi: 'नया', hl: 'Naya', en: 'New' },
  notice: { hi: 'सूचना', hl: 'Soochna', en: 'Notice' },
  important: { hi: 'ज़रूरी', hl: 'Zaroori', en: 'Important' },
};

const W = {
  from: { hi: 'MDG की तरफ़ से', hl: 'MDG ki taraf se', en: 'From MDG' } satisfies Words,
  gotIt: {
    hi: 'यह ज़रूरी है। कृपया इसे पूरा पढ़ लें।',
    hl: 'Yeh zaroori hai. Kripya ise poora padh lein.',
    en: 'This one is important. Please read it all.',
  } satisfies Words,
  openLink: { hi: 'लिंक खोलें', hl: 'Link kholein', en: 'Open the link' } satisfies Words,
  opensInBrowser: { hi: 'ब्राउज़र में खुलेगा', hl: 'Browser mein khulega', en: 'opens in the browser' } satisfies Words,
  watch: { hi: 'वीडियो देखें', hl: 'Video dekhein', en: 'Watch the video' } satisfies Words,
  videoFor: (title: string): Words => ({
    hi: `वीडियो चलाएँ: ${title}`,
    hl: `Video chalayein: ${title}`,
    en: `Play the video: ${title}`,
  }),
  forService: (name: string): Words => ({
    hi: `उन पंपों के लिए जिन पर “${name}” चालू है`,
    hl: `Un pumps ke liye jin par “${name}” chalu hai`,
    en: `For outlets with ${name}`,
  }),
  sentOn: (when: string): Words => ({ hi: `भेजा: ${when}`, hl: `Bheja: ${when}`, en: `Sent ${when}` }),
  noTitle: { hi: 'MDG की सूचना', hl: 'MDG ki soochna', en: 'News from MDG' } satisfies Words,
  alertLine: {
    hi: 'MDG की ज़रूरी सूचना है। कृपया पढ़ लें।',
    hl: 'MDG ki zaroori soochna hai. Kripya padh lein.',
    en: 'MDG has something important. Please read it.',
  } satisfies Words,
  letterAria: { hi: 'MDG का पत्र', hl: 'MDG ka patr', en: 'A letter from MDG' } satisfies Words,
};

// ── links ──────────────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
/** The most link buttons under one letter. */
const MAX_LINKS = 3;

/** The distinct http/https links in the text, in order. */
export function linksIn(body: string): string[] {
  const out: string[] = [];
  const matches = body.match(URL_RE) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?]+$/, '');
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ── the letter ───────────────────────────────────────────────────────────────────

/** A twelve-point star-burst, for NEW. */
function burstPoints(r1: number, r2: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (i / 24) * 2 * Math.PI - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** The tone glyph, drawn about (0, 0) inside a disc: star-burst, bell, or triangle with a mark. */
function ToneGlyph({ tone }: { tone: Tone }): React.ReactElement {
  if (tone === 'new') {
    return <polygon points={burstPoints(19, 12)} className="fill-kind-news-ink" strokeLinejoin="round" />;
  }
  if (tone === 'notice') {
    return (
      <g className="fill-kind-news-ink">
        <path d="M-13 9H13L10.5 -1C10.5 -9 6 -14 0 -14C-6 -14 -10.5 -9 -10.5 -1Z" />
        <circle cx="0" cy="14" r="3.6" />
      </g>
    );
  }
  return (
    <g>
      <path d="M0 -17L19 14H-19Z" className="fill-kind-news-soft stroke-kind-news-ink" strokeWidth="4" strokeLinejoin="round" />
      <path d="M0 -6v11" className="stroke-kind-news-ink" strokeWidth="4" strokeLinecap="round" />
      <circle cx="0" cy="10" r="2.4" className="fill-kind-news-ink" />
    </g>
  );
}

/** The flap of the envelope, 328 x 72, with the tone glyph in a disc at its tip. */
function Flap({ tone }: { tone: Tone }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 328 78"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-testid="announcement-flap"
      data-tone={tone}
      className="block h-auto w-full"
    >
      <path
        d="M0 0H328V8L164 68L0 8Z"
        className="fill-kind-news-soft stroke-kind-news-ink"
        strokeWidth={tone === 'important' ? 3 : 1.5}
        strokeLinejoin="round"
      />
      <circle
        cx="164"
        cy="40"
        r="30"
        className="fill-surface stroke-kind-news-ink"
        strokeWidth={tone === 'important' ? 3 : 1.5}
      />
      <g transform="translate(164 40)">
        <ToneGlyph tone={tone} />
      </g>
    </svg>
  );
}

function VideoButton({ videoId, title, lang }: { videoId: string; title: string; lang: Lang }): React.ReactElement {
  const [playing, setPlaying] = React.useState(false);
  const name = title || sayWords(W.noTitle, lang);
  return (
    <>
      <button
        type="button"
        data-testid="announcement-video"
        aria-label={sayWords(W.videoFor(name), lang)}
        onClick={() => setPlaying(true)}
        className="relative block aspect-video w-full overflow-hidden rounded-xl bg-kind-news text-white active:opacity-90"
      >
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-kind-news-ink">
            <Play aria-hidden="true" className="h-7 w-7 fill-current" />
          </span>
          <span className={`text-subheading ${leading(lang)}`}>{sayWords(W.watch, lang)}</span>
        </span>
      </button>
      {playing
        ? createPortal(<GuideVideoSheet id={videoId} title={name} onClose={() => setPlaying(false)} />, document.body)
        : null}
    </>
  );
}

function Overlay({ data, lang }: OverlayProps<'announcement'>): React.ReactElement {
  const tone: Tone = data.tone === 'new' || data.tone === 'important' ? data.tone : 'notice';
  const important = tone === 'important';
  const links = linksIn(data.body ?? '').slice(0, MAX_LINKS);
  const sent = istParts(data.sentAt);
  const sentOn = sent ? dayWords(sent.day, lang) : '';
  const body = data.body ?? '';
  const service = data.serviceId ? serviceLabel(data.serviceId) : null;
  const serviceName = service ? (lang === 'hi' ? service.hi : service.en) : '';
  return (
    <div data-kind="announcement" data-tone={tone} className="flex flex-col gap-4 p-4">
      <article
        aria-label={sayWords(W.letterAria, lang)}
        data-testid="announcement-letter"
        className={`overflow-hidden rounded-xl bg-surface ${
          important ? 'border-2 border-kind-news-ink' : 'border border-border-strong'
        }`}
      >
        <Flap tone={tone} />
        <div className="flex flex-col gap-3 px-4 pb-5 pt-1">
          <p
            data-testid="announcement-tone"
            className={`flex items-center justify-center gap-2 text-center text-subheading uppercase tracking-wide text-kind-news-ink ${leading(lang)}`}
          >
            <span>{sayWords(TONE_WORD[tone], lang)}</span>
          </p>
          <h2 data-testid="announcement-title" className={`break-words text-title text-text ${leading(lang)}`}>
            {data.title}
          </h2>
          <div
            data-testid="announcement-body"
            className={`whitespace-pre-line break-words text-body text-text ${lang === 'hi' ? 'leading-[1.75]' : 'leading-[1.6]'}`}
          >
            {richText(body)}
          </div>
          {sentOn ? <p className="text-body text-text-muted">{sayWords(W.sentOn(sentOn), lang)}</p> : null}
        </div>
      </article>

      {links.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0" data-testid="announcement-links">
          {links.map((url) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${sayWords(W.openLink, lang)}: ${hostOf(url)} (${sayWords(W.opensInBrowser, lang)})`}
                className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border-strong bg-surface px-4 py-2 text-cta text-text active:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block">{sayWords(W.openLink, lang)}</span>
                  <span className="block break-all text-body font-normal text-text-muted">{hostOf(url)}</span>
                </span>
                <ExternalLink aria-hidden="true" className="h-5 w-5 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {data.videoId ? <VideoButton videoId={data.videoId} title={data.title} lang={lang} /> : null}

      {serviceName ? (
        <p className={`text-body text-text-muted ${leading(lang)}`} data-testid="announcement-target">
          {sayWords(W.forService(serviceName), lang)}
        </p>
      ) : null}

      {important && data.ackable ? (
        <Note lang={lang} tone="attention" testId="announcement-ack-hint">
          {sayWords(W.gotIt, lang)}
        </Note>
      ) : null}
    </div>
  );
}

/** The 40 x 28 mini: an envelope with its flap. */
function Glyph({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <GlyphBox size={size}>
      <rect x="4" y="5" width="32" height="20" rx="3.5" />
      <path d="M4.5 7L20 18L35.5 7" />
    </GlyphBox>
  );
}

function tile(): KindTile | null {
  return null;
}

/**
 * Only an important note knocks; every other tone is news, not an alert. There is no "Got it" button:
 * the server has no acknowledgement route for an announcement yet, so the screen asks for nothing it
 * cannot take, and the note stays an alert until it ages out of the feed's week.
 */
function alert(data: Data, lang: Lang): KindAlert | null {
  if (data.tone !== 'important' || !data.ackable) return null;
  return {
    headline: data.title || sayWords(W.noTitle, lang),
    line: sayWords(W.alertLine, lang),
    severity: 'attention',
  };
}

function headline(data: Data, lang: Lang): string {
  return data.title || sayWords(W.noTitle, lang);
}

function share(data: Data, lang: Lang): string {
  const lines = [data.title || sayWords(W.noTitle, lang)];
  if (data.body) lines.push('', data.body);
  return lines.join('\n');
}

export const view: KindView<'announcement'> = {
  kind: 'announcement',
  Overlay,
  Glyph,
  tile,
  alert,
  headline,
  share,
};
