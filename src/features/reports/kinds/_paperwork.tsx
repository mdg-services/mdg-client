import { Camera, ZoomIn } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';

import { MediaViewer, type MediaViewerItem } from '@/features/chat/MediaViewer';
import { useT } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { ReportDetail } from '@dk/shared/types';

import { sayWords, type Words } from '../types';

/**
 * Small helpers shared by the five "paperwork" kinds (declaration filed, mock drill,
 * electrical audit, calibration claim, papers running out): date, time and money in the
 * reader's language, the lead sentence, the footer line and the photo frame. Nothing here
 * knows a kind's figures. The snapshot holds numbers and ISO dates only, so every word a
 * dealer reads is written in the kind's own file or here.
 */

/** Three languages in one call: hi (Devanagari), hl (Hinglish, Latin letters), en. */
export const words = (hi: string, hl: string, en: string): Words => ({ hi, hl, en });

// ── dates and times ─────────────────────────────────────────────────────────

const MONTHS: Record<Lang, readonly string[]> = {
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  hl: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** The month's short name in the reader's language ("Nov", "नवंबर"). */
export function monthName(month1to12: number, lang: Lang): string {
  return MONTHS[lang][month1to12 - 1] ?? '';
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** "24 Nov" / "24 नवंबर" for `YYYY-MM-DD` (a longer string is read up to the day). Anything else comes back as it was. */
export function fmtDay(iso: string | null | undefined, lang: Lang, withYear = false): string {
  const m = ISO_DAY.exec(iso ?? '');
  if (!m) return iso ?? '';
  const text = `${Number(m[3])} ${monthName(Number(m[2]), lang)}`;
  return withYear ? `${text} ${m[1]}` : text;
}

/** Just the day of the month of `YYYY-MM-DD`, as a number ("24"). */
export function dayOfMonth(iso: string): number {
  const m = ISO_DAY.exec(iso);
  return m ? Number(m[3]) : 0;
}

/** `YYYY-MM-DD` plus `n` calendar days (negative goes back). Pure calendar arithmetic, no time zone. */
export function addDays(iso: string, n: number): string {
  const m = ISO_DAY.exec(iso);
  if (!m) return iso;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The IST calendar day and `HH:mm` of an ISO instant, or null when it is not a date. */
export function istOf(instant: string | null | undefined): { day: string; time: string } | null {
  const t = Date.parse(instant ?? '');
  if (Number.isNaN(t)) return null;
  const iso = new Date(t + 330 * 60_000).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** `HH:mm` as the reader says it: "11:00 am" (en, hl) or "सुबह 11:00" (hi). */
export function fmtClock(hhmm: string | null | undefined, lang: Lang): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const clock = `${h12}:${m[2]}`;
  if (lang === 'hi') {
    const part = h < 4 ? 'रात' : h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 19 ? 'शाम' : 'रात';
    return `${part} ${clock}`;
  }
  return `${clock} ${h < 12 ? 'am' : 'pm'}`;
}

/** A day and a time of day together: "24 Nov, 2:05 pm". */
export function fmtDayTime(instant: string | null | undefined, lang: Lang): string {
  const ist = istOf(instant);
  return ist ? `${fmtDay(ist.day, lang)}, ${fmtClock(ist.time, lang)}` : '';
}

// ── numbers and money ───────────────────────────────────────────────────────

/** A whole number with Indian grouping ("1,24,000"). */
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

/** Rupees, one sign in every language, as on the rest of the app: "₹12,600". */
export function fmtRs(n: number, lang: Lang): string {
  void lang;
  return `₹${fmtNum(n)}`;
}

/** "30 min" / "30 मिनट". */
export function fmtMinutes(min: number, lang: Lang): string {
  return lang === 'hi' ? `${fmtNum(min)} मिनट` : `${fmtNum(min)} min`;
}

/** Seconds as the reader says them: "45 s", "1 min 15 s" (hi: "45 सेकंड", "1 मिनट 15 सेकंड"). */
export function fmtSeconds(sec: number, lang: Lang): string {
  const s = Math.max(0, Math.round(sec));
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  const sUnit = lang === 'hi' ? 'सेकंड' : 's';
  const mUnit = lang === 'hi' ? 'मिनट' : 'min';
  if (minutes === 0) return `${rest} ${sUnit}`;
  return rest === 0 ? `${minutes} ${mUnit}` : `${minutes} ${mUnit} ${rest} ${sUnit}`;
}

/** "1 day" / "3 days" / "3 din" / "3 दिन". */
export function fmtDays(n: number, lang: Lang): string {
  if (lang === 'hi') return `${n} दिन`;
  if (lang === 'hl') return `${n} din`;
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** "1 point" / "6 points" / "6 point" / "6 पॉइंट". */
export function fmtPoints(n: number, lang: Lang): string {
  if (lang === 'hi') return `${fmtNum(n)} पॉइंट`;
  if (lang === 'hl') return `${fmtNum(n)} point`;
  return `${fmtNum(n)} ${n === 1 ? 'point' : 'points'}`;
}

/** "1 nozzle" / "12 nozzles" / "12 nozzle" / "12 नोज़ल". */
export function fmtNozzles(n: number, lang: Lang): string {
  if (lang === 'hi') return `${fmtNum(n)} नोज़ल`;
  if (lang === 'hl') return `${fmtNum(n)} nozzle`;
  return `${fmtNum(n)} ${n === 1 ? 'nozzle' : 'nozzles'}`;
}

// ── type ────────────────────────────────────────────────────────────────────

/** Devanagari needs more air between lines than Latin (ADR 0056: 1.7 against 1.5). */
export function lineHeight(lang: Lang): string {
  return lang === 'hi' ? 'leading-[1.7]' : 'leading-normal';
}

/** The one plain sentence an overlay opens with: 20 px, bold. */
export function Lead({ lang, children }: { lang: Lang; children: ReactNode }): ReactElement {
  return <p className={`text-heading text-text ${lineHeight(lang)}`}>{children}</p>;
}

/** A supporting line: 16 px. */
export function Line({ lang, children, className = '' }: { lang: Lang; children: ReactNode; className?: string }): ReactElement {
  return <p className={`text-body text-text ${lineHeight(lang)} ${className}`}>{children}</p>;
}

const FILED_BY: Words = words(
  'MDG की टीम ने आपके लिए IndianOil के पोर्टल पर यह भरा है।',
  'MDG ki team ne aapke liye IndianOil ke portal par yeh bhara hai.',
  "Filed by MDG's team on IndianOil's portal for you.",
);

/** The foot line of a filed paper: who did the work. */
export function FiledByLine({ lang }: { lang: Lang }): ReactElement {
  return <p className={`text-body text-text-muted ${lineHeight(lang)}`}>{FILED_BY[lang]}</p>;
}

/** "IndianOil says" box: text somebody else wrote, shown as written. */
export function QuotedBox({ title, children, lang }: { title: string; children: ReactNode; lang: Lang }): ReactElement {
  return (
    <figure className="rounded-lg bg-surface-2 px-3.5 py-3">
      <figcaption className={`text-meta font-semibold text-text-muted ${lineHeight(lang)}`}>{title}</figcaption>
      <blockquote className={`text-body text-text ${lineHeight(lang)}`}>{children}</blockquote>
    </figure>
  );
}

// ── pictures ────────────────────────────────────────────────────────────────

/**
 * The signed address of one stored photo. The report route signs the photos a snapshot points at and
 * sends them as `photos` ({ key, url }); a message from before that, or a test, may carry the same
 * copy in `attachments`, matched by storage key. Undefined when the server did not sign it (the
 * frame then says so calmly).
 */
export function photoUrl(report: Pick<ReportDetail, 'attachments' | 'photos'>, key: string): string | undefined {
  const signed = (report.photos ?? []).find((p) => p.key === key);
  if (signed?.url) return signed.url;
  const found = (report.attachments ?? []).find((a) => a.storageKey === key);
  return found?.url || undefined;
}

/** One photo a kind can open full screen: its storage key and the words that name it. */
export interface ViewablePhoto {
  key: string;
  label: string;
  mime?: string | undefined;
}

/**
 * Tap a snapshot photo to read it full screen, inside the app. The viewer is the chat's own
 * `MediaViewer` (pinch, drag, Back closes it), never a new browser tab: it is drawn in the overlay
 * and holds its own history entry. Photos with no signed address are not in it.
 */
export function usePhotoViewer(
  report: Pick<ReportDetail, 'attachments' | 'photos' | 'conversationId' | 'messageId' | 'sentAt'>,
  photos: readonly ViewablePhoto[],
): { open: (key: string) => void; viewer: ReactElement | null } {
  const t = useT();
  const [viewing, setViewing] = useState<string | null>(null);
  const items = useMemo<MediaViewerItem[]>(
    () =>
      photos.flatMap((p) => {
        const url = photoUrl(report, p.key);
        if (!url) return [];
        return [
          {
            key: `${report.messageId}:${p.key}`,
            attachment: {
              storageKey: p.key,
              filename: p.label,
              contentType: p.mime || 'image/jpeg',
              size: 0,
              kind: 'image' as const,
              url,
            },
            source: { conversationId: report.conversationId, messageId: report.messageId },
            senderLabel: t('chat.senderMdg'),
            createdAt: report.sentAt,
            caption: p.label,
          },
        ];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `report` is read through the fields listed
    [photos, report.photos, report.attachments, report.messageId, report.conversationId, report.sentAt, t],
  );
  const open = useCallback((key: string) => setViewing(`${report.messageId}:${key}`), [report.messageId]);
  const close = useCallback(() => setViewing(null), []);
  const viewer =
    viewing && items.some((i) => i.key === viewing) ? (
      <MediaViewer items={items} initialKey={viewing} onClose={close} />
    ) : null;
  return { open, viewer };
}

const PHOTO_MISSING: Words = words('फोटो यहाँ नहीं दिख रही', 'Photo yahan nahi dikh rahi', 'Photo is not shown here');
const PHOTO_FAILED: Words = words('फोटो नहीं खुली', 'Photo nahi khuli', 'Photo did not open');
const OPEN_PHOTO: Words = words('बड़ा करके देखें', 'Bada karke dekhein', 'Open full screen');
const TRY_AGAIN: Words = words('फिर कोशिश करें', 'Dobara koshish', 'Try again');

export interface PhotoFrameProps {
  /** The signed address, or undefined when there is none. */
  src: string | undefined;
  /** What the picture is ("Outside photo"). Shown under it and used as its alt text. */
  label: string;
  /** Side of the square, as a number of 16-px steps (156 is 9.75rem): drawn in rem so it grows with the text. It never grows past the screen. */
  size: number;
  lang: Lang;
  /** Opens the picture full screen (`usePhotoViewer`). Without it the photo is only shown. */
  onOpen?: (() => void) | undefined;
}

/**
 * A square photo with a label under it. No address, or a picture that fails to load, shows a
 * calm box with a camera and a sentence; a failed one also gets a 3rem "Try again". With `onOpen`
 * the photo is one big button (the whole square) that opens it full screen.
 */
export function PhotoFrame({ src, label, size, lang, onOpen }: PhotoFrameProps): ReactElement {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const showImage = Boolean(src) && !failed;
  const side = `${size / 16}rem`;
  return (
    <figure className="m-0" style={{ width: side, maxWidth: '100%' }}>
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-kind-paperwork-soft"
        style={{ width: side, maxWidth: '100%', aspectRatio: '1 / 1' }}
      >
        {showImage ? (
          onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              data-testid="photo-open"
              className="relative block h-full w-full p-0 active:opacity-90"
            >
              <img
                key={attempt}
                src={src}
                alt={label}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={() => setFailed(true)}
              />
              <span className="sr-only">{`: ${sayWords(OPEN_PHOTO, lang)}`}</span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex size-8 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <ZoomIn className="h-4 w-4" />
              </span>
            </button>
          ) : (
            <img
              key={attempt}
              src={src}
              alt={label}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setFailed(true)}
            />
          )
        ) : (
          <div className="flex flex-col items-center gap-2 p-2 text-center">
            <Camera aria-hidden="true" className="h-8 w-8 text-kind-paperwork-ink" />
            <p className={`text-body text-text ${lineHeight(lang)}`}>
              {failed ? PHOTO_FAILED[lang] : PHOTO_MISSING[lang]}
            </p>
            {failed ? (
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
                className="min-h-12 rounded-lg border border-border-strong bg-surface px-3 text-cta text-text active:bg-surface-2"
              >
                {TRY_AGAIN[lang]}
              </button>
            ) : null}
          </div>
        )}
      </div>
      <figcaption className={`mt-1 text-subheading text-text ${lineHeight(lang)}`}>{label}</figcaption>
    </figure>
  );
}

// ── glyphs ──────────────────────────────────────────────────────────────────

/**
 * The 40 x 28 box every kind's mini signature is drawn in. `size` is the HEIGHT, as the
 * contract says; the width follows. Strokes use `currentColor`, so a tile sets the colour.
 */
export function GlyphBox({ size = 28, children }: { size?: number; children: ReactNode }): ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg width={width} height={size} viewBox="0 0 40 28" aria-hidden="true" focusable="false" className="text-kind-paperwork">
      {children}
    </svg>
  );
}

/** A tick on a 20-box, drawn round-ended. Used in the seal, the checklist and the calendars. */
export function TickPath({ x = 0, y = 0, scale = 1, stroke = 'currentColor', width = 2.4 }: { x?: number; y?: number; scale?: number; stroke?: string; width?: number }): ReactElement {
  return (
    <path
      d="M4 10.4l4 4 8-8.4"
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
