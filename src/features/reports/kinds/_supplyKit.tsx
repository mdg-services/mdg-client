import { ChevronDown, MessageCircle } from 'lucide-react';
import * as React from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';

import type { Lang } from '@/store/lang';
import type { ReportDetail, TodayTaskKind } from '@dk/shared/types';

import { useReportActions } from '../reportActions';
import { StatusShape } from '../StatusBadge';
import { sayWords, type ReportStatusKey, type Words } from '../types';

import { fuelColor, fuelLetters, fuelName, tanksWords } from './dsr_sales/fmt';

export { rv, rvn } from './_fmtTankerMoney';

/**
 * Small things the five "water, supply, MDG" kinds share (water_ingress, ro_supply, du_otp,
 * announcement): dates and clock times in the reader's language, the body's type
 * sizes, a calm note box, a "More" row and the button that opens the chat. Nothing here is
 * a sentence about a report: those stay in each kind's own file.
 */

/** 1,24,000 style grouping, as the dealer's own books print it. */
export function num(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

// ── dates and clocks ──────────────────────────────────────────────────────────

const MONTHS: Record<Lang, readonly string[]> = {
  hi: [
    'जनवरी',
    'फ़रवरी',
    'मार्च',
    'अप्रैल',
    'मई',
    'जून',
    'जुलाई',
    'अगस्त',
    'सितंबर',
    'अक्टूबर',
    'नवंबर',
    'दिसंबर',
  ],
  hl: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "24 Nov" (hi: "24 नवंबर"), from a `YYYY-MM-DD`. Empty when it is not a real day. */
export function dayWords(day: string | null | undefined, lang: Lang, withYear = false): string {
  const m = DAY_RE.exec(day ?? '');
  if (!m) return '';
  const month = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (month < 0 || month > 11 || d < 1 || d > 31) return '';
  const base = `${d} ${MONTHS[lang][month]}`;
  return withYear ? `${base} ${m[1]}` : base;
}

const IST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface IstParts {
  /** `YYYY-MM-DD`, the IST calendar day. */
  day: string;
  hour: number;
  minute: number;
}

/** An ISO instant read in India time. Null when it does not parse. */
export function istParts(iso: string | null | undefined): IstParts | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const parts: Record<string, string> = {};
  for (const p of IST.formatToParts(t)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: Number(parts.minute),
  };
}

/** The part of the day, for a Hindi clock ("शाम 7:05 बजे"). */
export function hindiPeriod(hour: number): string {
  if (hour < 4) return 'रात';
  if (hour < 12) return 'सुबह';
  if (hour < 16) return 'दोपहर';
  if (hour < 20) return 'शाम';
  return 'रात';
}

/** "7:05 pm" (hi: "शाम 7:05 बजे"), from a 24-hour hour and a minute. */
export function clockWords(hour: number, minute: number, lang: Lang): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, '0');
  if (lang === 'hi') return `${hindiPeriod(hour)} ${h12}:${mm} बजे`;
  return `${h12}:${mm} ${hour < 12 ? 'am' : 'pm'}`;
}

/** "24 Nov, 7:05 pm", from an instant. Empty when it does not parse. */
export function stampWords(iso: string | null | undefined, lang: Lang): string {
  const p = istParts(iso);
  if (!p) return '';
  return `${dayWords(p.day, lang)}, ${clockWords(p.hour, p.minute, lang)}`;
}

/** "7:05 pm", from an instant. Empty when it does not parse. */
export function timeWords(iso: string | null | undefined, lang: Lang): string {
  const p = istParts(iso);
  return p ? clockWords(p.hour, p.minute, lang) : '';
}

// ── type ────────────────────────────────────────────────────────────────────────

/** Devanagari needs more air than Latin: 1.7 against 1.5. */
export function leading(lang: Lang): string {
  return lang === 'hi' ? 'leading-[1.7]' : 'leading-normal';
}

/** The first sentence of an overlay: `heading` size, bold, before any figure. */
export function Lead({ lang, children }: { lang: Lang; children: React.ReactNode }): React.ReactElement {
  return (
    <p data-testid="report-lead" className={`break-words text-heading text-text ${leading(lang)}`}>
      {children}
    </p>
  );
}

/** A quiet note: an icon, then words, at body size; the tint says how loud, the icon says what. */
export function Note({
  lang,
  icon,
  tone = 'plain',
  children,
  testId,
}: {
  lang: Lang;
  icon?: React.ReactNode;
  tone?: 'plain' | 'attention' | 'waiting' | 'problem';
  children: React.ReactNode;
  testId?: string;
}): React.ReactElement {
  const tint =
    tone === 'attention'
      ? 'bg-status-attention-soft'
      : tone === 'problem'
        ? 'bg-status-problem-soft'
        : tone === 'waiting'
          ? 'bg-status-waiting-soft'
          : 'bg-surface-2';
  return (
    <div
      data-testid={testId}
      className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body text-text ${tint} ${leading(lang)}`}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** A heading for a block of rows: `subheading` size, muted. */
export function BlockTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return <h3 className="text-subheading text-text-muted">{children}</h3>;
}

/**
 * A "More" row: 3rem tall, closed until it is tapped, for detail a dealer does not need to read
 * (the portal's own words, how a figure is worked out).
 */
export function More({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <div data-testid={testId} className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-cta text-text"
      >
        <span>{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id={id} hidden={!open} className="border-t border-border px-3 py-3 text-body text-text">
        {children}
      </div>
    </div>
  );
}

/** A 3rem outlined button, for an action that sits inside the body (the shell owns the pinned one). */
export function BodyButton({
  onClick,
  children,
  icon,
  testId,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  testId?: string;
  /** A fuller name for a screen reader ("Send photo for Forecourt photo"). */
  label?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2 text-cta text-text shadow-sm active:bg-surface-2"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

// ── the way into the chat ──────────────────────────────────────────────────────

/** Where in the chat a {@link ChatButton} goes: the exact box that answers the row, when there is one. */
export interface ChatPlace {
  /** The ask's reference (`kv:<itemId>`, `doc:…`, `reg:…`): the chat opens at that ask's own box. */
  ask?: string;
  /** An open job's box (the DU OTP steps, the mock drill, the declarations): the chat opens at its newest one. */
  box?: TodayTaskKind;
}

interface ChatButtonProps extends ChatPlace {
  report: Pick<ReportDetail, 'conversationId' | 'messageId'>;
  children: React.ReactNode;
  testId?: string;
  label?: string;
  icon?: React.ReactNode;
}

function ChatButtonInRouter({ report, children, testId, label, icon }: ChatButtonProps): React.ReactElement {
  const navigate = useNavigate();
  return (
    <BodyButton
      testId={testId}
      label={label}
      icon={icon ?? <MessageCircle aria-hidden="true" className="h-5 w-5" />}
      onClick={() =>
        navigate(`/chat/${encodeURIComponent(report.conversationId)}`, {
          state: { jumpToMessageId: report.messageId },
        })
      }
    >
      {children}
    </BodyButton>
  );
}

/**
 * A button that opens the chat where the box that answers this row lives: the photo ask, the DU OTP
 * steps, the mock drill. With an overlay around it the overlay finds the exact box (the Today feed's
 * open tasks, or the thread's loaded messages) and the dealer lands ON it, not at the report message
 * with the box somewhere further down. When the box cannot be found it opens the chat at this
 * report's message, so the button never does nothing. Outside an overlay it keeps the plain
 * behaviour; with no router either (the extension's side panel) it draws nothing.
 */
export function ChatButton(props: ChatButtonProps): React.ReactElement | null {
  const ctx = useReportActions();
  const inRouter = useInRouterContext();
  if (ctx) {
    const { ask, box, report, children, testId, label, icon } = props;
    return (
      <BodyButton
        testId={testId}
        label={label}
        icon={icon ?? <MessageCircle aria-hidden="true" className="h-5 w-5" />}
        onClick={() => {
          if (ask) ctx.openChatAtAsk(ask);
          else if (box) ctx.openChatAtTask(box);
          else ctx.openChatAt(report.messageId);
        }}
      >
        {children}
      </BodyButton>
    );
  }
  return inRouter ? <ChatButtonInRouter {...props} /> : null;
}

// ── words ──────────────────────────────────────────────────────────────────────

/** A sentence for a count: `one` for 1, `many` for the rest, each given the number. */
export function plural(n: number, one: (n: number) => Words, many: (n: number) => Words, lang: Lang): string {
  return sayWords(n === 1 ? one(n) : many(n), lang);
}

/** A two-language text somebody else wrote: Hindi for Hindi, otherwise the English. */
export function twoLang(text: { en: string; hi: string }, lang: Lang): string {
  return (lang === 'hi' ? text.hi || text.en : text.en || text.hi) ?? '';
}

/**
 * A coloured box with a status shape: the shape and the words carry the meaning, the tint only
 * helps. The stale-reading band, the severity banner and the "what to do" box of the stock and
 * tanker kinds. Written here, not borrowed from the sales kinds, so the two halves never collide.
 */
export function Callout({
  status,
  children,
  testId,
}: {
  status: ReportStatusKey;
  children: React.ReactNode;
  testId?: string;
}): React.ReactElement {
  const tone: Record<ReportStatusKey, string> = {
    problem: 'bg-status-problem-soft',
    attention: 'bg-status-attention-soft',
    waiting: 'bg-status-waiting-soft',
    ok: 'bg-status-ok-soft',
    info: 'bg-surface-2',
  };
  return (
    <div
      data-testid={testId}
      data-status={status}
      className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-body leading-relaxed text-text ${tone[status]}`}
    >
      <span aria-hidden="true" data-status={status} className="mt-0.5 shrink-0">
        <StatusShape status={status} size={20} />
      </span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** A small swatch in the fuel's workbook colour, always beside the fuel's letters or name. */
export function FuelSwatch({ fuelKey }: { fuelKey: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{ backgroundColor: fuelColor(fuelKey) }}
    />
  );
}

/** "Diesel (HSD) · tanks 4, 6, 8" with the fuel swatch: the band over each fuel's block. Names wrap. */
export function FuelBand({
  fuelKey,
  tankNos,
  lang,
  trailing,
}: {
  fuelKey: string;
  tankNos?: readonly number[];
  lang: Lang;
  trailing?: React.ReactNode;
}): React.ReactElement {
  const name = fuelName(fuelKey, lang);
  const letters = fuelLetters(fuelKey);
  const tanks = tankNos ? tanksWords(tankNos, lang) : '';
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subheading leading-snug text-text">
      <FuelSwatch fuelKey={fuelKey} />
      <span className="break-words">{name}</span>
      {name.toUpperCase() !== letters ? <span className="text-subheading text-text-muted">({letters})</span> : null}
      {tanks ? <span className="break-words text-body font-normal text-text-muted">· {tanks}</span> : null}
      {trailing}
    </div>
  );
}

/** An SVG box for a Glyph: 40 x 28 at any height, drawn in the colour of the text around it. */
export function GlyphBox({
  size = 28,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}): React.ReactElement {
  const width = Math.round((size * 40) / 28);
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 40 28"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** An id that is safe inside `url(#...)`: React's own contain colons. */
export function useSvgId(prefix: string): string {
  return `${prefix}-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
