import { Check, Play, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/**
 * The pieces every living card is built from (ADR 0059): the frame and its header, a
 * row's mark (tick, number, red "!", a turning ring), a pill, the foot buttons and the
 * help-video line. The fuel-order card and the setup card are both made of these, so
 * the two look like one family and a third flow costs no new design.
 *
 * Sizes come from the app's type scale only, in rem, so a phone set to large text grows
 * every line; nothing has a fixed height, and rows wrap rather than clip.
 */

/** The card itself: a white sheet on the chat's wallpaper, as wide as a picture. */
export function CardFrame({
  titleId,
  title,
  meta,
  progress,
  children,
  testId,
  className,
}: {
  titleId: string;
  title: React.ReactNode;
  /** Right of the title, small: the outlet code and the time. */
  meta?: React.ReactNode;
  /** "3 of 5 done" and a thin bar under the title. */
  progress?: { done: number; total: number; label: string } | null;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      className={cn(
        'w-full overflow-hidden rounded-lg border border-wa-divider bg-wa-in text-wa-bubble-text',
        'shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_rgba(15,23,42,0.05)]',
        className,
      )}
    >
      <header className="px-3.5 pb-2 pt-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 id={titleId} className="min-w-0 break-words text-body font-semibold">
            {title}
          </h3>
          {meta ? <span className="text-micro tabular-nums text-wa-meta">{meta}</span> : null}
        </div>
        {progress ? (
          <div className="mt-1">
            <p className="text-micro font-medium text-wa-meta">{progress.label}</p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-label={progress.label}
              className="mt-1 h-1 w-full overflow-hidden rounded-full bg-wa-divider"
            >
              <div
                className="h-full rounded-full bg-status-ok transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export type MarkKind = 'done' | 'open' | 'later' | 'problem' | 'working';

/** The round mark at a row's left: what state the row is in, never by colour alone. */
export function RowMark({ kind, n }: { kind: MarkKind; n?: number }) {
  const base = 'grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold leading-none';
  if (kind === 'done') {
    return (
      <span aria-hidden className={cn(base, 'bg-status-ok text-white flow-tick')}>
        <Check width={12} strokeWidth={3} />
      </span>
    );
  }
  if (kind === 'problem') {
    return (
      <span aria-hidden className={cn(base, 'bg-status-problem text-white')}>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M6 2.25v4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="6" cy="9.4" r="1.1" fill="currentColor" />
        </svg>
      </span>
    );
  }
  if (kind === 'working') {
    return (
      <span aria-hidden className={cn(base, 'border-2 border-wa-divider border-t-wa-accent animate-spin motion-reduce:animate-none')} />
    );
  }
  if (kind === 'open') {
    return <span aria-hidden className={cn(base, 'border-[1.5px] border-wa-accent bg-wa-in text-wa-accent-strong')}>{n ?? ''}</span>;
  }
  return <span aria-hidden className={cn(base, 'border border-wa-divider text-wa-meta')}>{n ?? ''}</span>;
}

/** A row: the mark, then whatever the row holds. A hairline between rows. */
export function RowShell({
  kind,
  n,
  stateWord,
  children,
  muted,
  testId,
  rowKey,
}: {
  kind: MarkKind;
  n?: number;
  /** Said by a screen reader before the row: "done", "now", "later". */
  stateWord: string;
  children: React.ReactNode;
  muted?: boolean;
  testId?: string;
  rowKey?: string;
}) {
  return (
    <li
      data-testid={testId}
      data-row={rowKey}
      data-state={kind}
      className={cn('flex gap-2.5 border-t border-wa-divider px-3.5 py-2', muted && 'opacity-60')}
    >
      <span className="pt-0.5">
        <RowMark kind={kind} n={n} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{stateWord}: </span>
        {children}
      </div>
    </li>
  );
}

/** One pill: outlined, or filled black when it is the answer. 36 px tall, the size of the owner's reference card. */
export function Pill({
  selected,
  disabled,
  busy,
  onClick,
  children,
  hint,
  value,
  tight = false,
}: {
  selected?: boolean;
  disabled?: boolean;
  /** This pill's tap is on its way: drawn picked, the others wait. */
  busy?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  hint?: React.ReactNode;
  value?: string;
  /** Narrower sides, for a row of short figures (a fuel's KL) that must fit with its ✎ on a 360 px phone. */
  tight?: boolean;
}) {
  const on = !!selected || !!busy;
  return (
    <button
      type="button"
      data-value={value}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 flex-col items-center justify-center rounded-full border py-1 text-center',
        tight ? 'min-w-[2.5rem] px-2.5' : 'min-w-[2.75rem] px-3',
        'text-meta font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        on
          ? 'border-wa-accent bg-wa-accent text-white'
          : 'border-wa-divider bg-wa-in text-wa-bubble-text hover:border-wa-meta',
        disabled && !on && 'opacity-45',
        busy && 'animate-pulse motion-reduce:animate-none',
      )}
    >
      <span className="leading-none">{children}</span>
      {hint ? (
        <span className={cn('mt-0.5 text-[0.6875rem] font-normal leading-none', on ? 'text-white/80' : 'text-wa-meta')}>{hint}</span>
      ) : null}
    </button>
  );
}

/** The buttons at the card's foot: one black, one outlined, side by side until the text is too big. */
export function FootButtons({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 border-t border-wa-divider px-3.5 py-2.5">{children}</div>;
}

export function FootButton({
  tone,
  onClick,
  disabled,
  busy,
  children,
  testId,
}: {
  tone: 'primary' | 'secondary';
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex min-h-10 min-w-[7rem] flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-meta font-semibold',
        'transition-[background-color,opacity,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        tone === 'primary'
          ? 'bg-wa-accent text-white disabled:opacity-50'
          : 'border border-wa-divider bg-wa-in text-wa-bubble-text disabled:opacity-50',
      )}
    >
      {busy ? (
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
      ) : null}
      {children}
    </button>
  );
}

/** The red "!" row inside the card: one plain sentence, then its small lines. */
export function ProblemRow({ text, detail }: { text: string; detail: string[] }) {
  const t = useT();
  return (
    <div role="alert" className="flex gap-2.5 border-t border-wa-divider bg-status-problem-soft px-3.5 py-2.5" data-testid="flow-problem">
      <span className="pt-0.5">
        <RowMark kind="problem" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{t('flow.stateProblem')}: </span>
        <p className="break-words text-meta font-semibold text-status-problem-ink">{text}</p>
        {detail.map((d, i) => (
          <p key={i} className="mt-0.5 break-words text-micro text-wa-bubble-text/80">
            {d}
          </p>
        ))}
      </div>
    </div>
  );
}

/** A warning line above the main button: read it, it never stops the order. */
export function WarningLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex gap-1.5 text-micro text-status-attention-ink">
      <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2} />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/**
 * The card's foot, one line: the short guide video on the left and, when there is one,
 * the quiet way out ("Rehne dijiye") on the right.
 */
export function CardFoot({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-x-2 border-t border-wa-divider px-1.5 py-0.5">{children}</div>;
}

/** The short guide video, as a link in the card's foot. */
export function VideoRow({ title, seconds, onPlay }: { title: string; seconds: number | null; onPlay: () => void }) {
  const t = useT();
  const mins = seconds ? Math.max(1, Math.round(seconds / 60)) : null;
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`${t('flow.watch')}: ${title}`}
      className="flex min-h-9 min-w-0 flex-1 basis-[11rem] items-center gap-1.5 rounded-md px-2 text-left text-micro text-wa-meta active:bg-wa-row-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring"
    >
      <Play aria-hidden width="1em" height="1em" strokeWidth={2.5} className="shrink-0 fill-current" />
      <span className="min-w-0 break-words">
        <span className="font-medium">{title}</span>
        {mins ? ` · ${t('flow.minutes', { n: mins })}` : ''}
      </span>
    </button>
  );
}
