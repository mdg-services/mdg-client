import type { ReactNode } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { Num } from '@/components/kit/Num';
import { StatusPill } from '@/components/kit/StatusPill';
import type { Status } from '@/components/kit/types';
import { cn } from '@/lib/cn';
import { fmtDay, fmtInt, fmtLitres, fmtTime } from '@/lib/fmt';
import { translate, type TFunction, type TVars } from '@/lib/i18n';
import type { PluralBase } from '@/lib/messages/_plural';
import type { Lang } from '@/store/lang';
import type { TodayReport } from '@dk/shared/types';

/**
 * What every "Right now" panel is handed: the reader's words and clock, who he is, and the reports
 * the page holds (the Today feed's plus the loaded history, readable by him, each once).
 */
export interface PanelCtx {
  serviceId: string;
  lang: Lang;
  now: Date;
  isOwner: boolean;
  t: TFunction;
  tn: (base: PluralBase, n: number, vars?: TVars) => string;
  reports: readonly TodayReport[];
  navigate: NavigateFunction;
}

/** A panel's drawing, with the time its figures are "as of" (the newest report it read). */
export interface PanelOut {
  content: ReactNode;
  asOf?: string;
  /** The card's own name when "Right now" would say less ("Sold yesterday"). */
  title?: string;
}

/**
 * Words wrap anywhere. `break-words` alone does not shrink a word's minimum width, so in a column
 * that is as wide as its widest word a long word still pushed the page sideways at 200% text.
 */
export const WRAP = 'min-w-0 [overflow-wrap:anywhere]';

export const PanelStack = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-4">{children}</div>
);

export const PanelHeading = ({ children }: { children: ReactNode }) => (
  <h3 className="break-words text-subheading text-text">{children}</h3>
);

export const Fact = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={`break-words text-body text-text ${className ?? ''}`}>{children}</p>
);

export const Small = ({ children }: { children: ReactNode }) => (
  <p className="break-words text-meta text-text-muted">{children}</p>
);

export const PanelList = ({ children, label }: { children: ReactNode; label?: string }) => (
  <ul {...(label ? { 'aria-label': label } : {})} className="divide-y divide-border">
    {children}
  </ul>
);

/** One line of a panel: an optional status (shape and word), one sentence, and a small line under it. */
export function PanelRow({
  status,
  word,
  text,
  meta,
}: {
  status?: Status | 'stopped';
  word?: string;
  text: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <li className="flex min-h-11 flex-col items-start gap-1 py-2">
      {status ? <StatusPill status={status} {...(word ? { word } : {})} /> : null}
      <span className={cn(WRAP, 'text-body text-text')}>{text}</span>
      {meta ? <span className={cn(WRAP, 'text-meta text-text-muted')}>{meta}</span> : null}
    </li>
  );
}

/** Litres as a number that never splits across lines. */
export const L = ({ n, lang }: { n: number; lang: Lang }) => <Num>{fmtLitres(n, lang)}</Num>;

/** "today 7:05 am", "Tue 24 Nov 9:10 am": an instant on the dealer's clock. */
export function stamp(iso: string, lang: Lang, now: Date): string {
  return `${fmtDay(iso, lang, now)} ${fmtTime(iso, lang)}`;
}

/**
 * A big litres figure: the number on one line, the unit beside it when it fits and below it when it
 * does not. The number never splits and never runs off the edge (it was one `whitespace-nowrap`
 * run of "14,640 लीटर", cut at 200% text).
 */
export function LitresBig({ n, lang }: { n: number; lang: Lang }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-text">
      <Num value={n} className="text-display" />
      <span className="text-heading">{translate(lang, 'kit.unit.litres')}</span>
    </p>
  );
}

/**
 * A bar with a number and ONE low line. Below the line the bar says so in a shape and words
 * (`below`), never by the bar alone. The line itself is named once by the caller, not on every bar.
 */
export function CoverBar({
  value,
  max,
  lowAt,
  text,
  below,
  belowWord,
}: {
  value: number;
  max: number;
  lowAt: number;
  text: string;
  below: boolean;
  belowWord: string;
}) {
  const span = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / span) * 100));
  const markPct = Math.min(100, Math.max(0, (lowAt / span) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(Math.max(value, 0), max)}
        aria-valuetext={below ? `${text}, ${belowWord}` : text}
        className="relative h-3 w-full overflow-hidden rounded-md bg-surface-2"
      >
        <div className="h-full rounded-md bg-brand" style={{ width: `${pct}%` }} />
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-text"
          style={{ left: `${markPct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={cn(WRAP, 'text-meta text-text')}>{text}</p>
        {below ? <StatusPill status="attention" word={belowWord} /> : null}
      </div>
    </div>
  );
}

/** Whole litres with a real minus sign and a plus: "−520 L", "+310 L" (unit word of the reader's language). */
export function signedL(n: number, lang: Lang): string {
  const r = Math.round(n);
  const body = fmtInt(Math.abs(r), lang);
  const sign = r < 0 ? '\u2212' : r > 0 ? '+' : '';
  return `${sign}${body} ${translate(lang, 'kit.unit.litres')}`;
}
