import { Check, ChevronDown, Copy, Quote } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useLargeText } from '@/lib/useLargeText';
import type { Lang } from '@/store/lang';

import type { Words } from '../types';

import { fuelFamilyOfKey, fuelName, leadingFor, say, type FuelFamily } from './_fmtTankerMoney';

/**
 * Small parts the tanker and money kinds share (ADR 0056): the lead sentence, the
 * yellow number plate (tanker density and fuel order), the fuel swatch, the quiet
 * "More" row, the quoted box for IndianOil's own words, and the copy button.
 *
 * Paper things (the plate, the receipt slip, the passbook page) keep their own fixed
 * colours in dark mode too: a yellow plate and a white slip are objects, not surfaces.
 */

/** The plate's yellow with black on it is 11.6:1. It is a drawn object, never a status. */
export const PLATE_YELLOW = '#facc15';
export const PLATE_INK = '#18181b';

/** The one plain sentence an overlay opens with: `heading` size, before any figure. */
export function Lead({
  lang,
  children,
  className,
}: {
  lang: Lang;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <p
      data-testid="report-lead"
      className={cn('text-heading text-text', leadingFor(lang), className)}
    >
      {children}
    </p>
  );
}

export interface NumberPlateProps {
  /** The number as printed ("BR09GC8009"). Null or empty draws the dashed "no number" plate. */
  text: string | null | undefined;
  lang: Lang;
  /** What the dashed plate says when there is no number. */
  emptyWords: Words;
  /** `lg` is the tanker density plate; `md` the fuel order's smaller TT plate. */
  size?: 'lg' | 'md';
  /** What a screen reader hears before the number ("Tanker number"). */
  label: Words;
}

/**
 * A yellow number plate with a black border. Text, not a picture: it can be selected and
 * long-pressed, and a screen reader reads the number character by character. It wraps
 * (never scrolls sideways) when text size is doubled.
 */
export function NumberPlate({
  text,
  lang,
  emptyWords,
  size = 'lg',
  label,
}: NumberPlateProps): ReactElement {
  // At large text the plate's figures would not fit a phone, and a number broken across lines is
  // worse than a smaller plate: so the figures drop to body size and the plate keeps its shape.
  const large = useLargeText();
  const value = (text ?? '').trim();
  if (!value) {
    return (
      <div
        data-testid="number-plate-empty"
        className={cn(
          'flex min-h-16 w-full items-center justify-center rounded-xl border-[3px] border-dashed border-border-strong bg-surface-2 px-4 py-3 text-center text-cta text-text-muted',
          leadingFor(lang),
        )}
      >
        {say(emptyWords, lang)}
      </div>
    );
  }
  const big = size === 'lg';
  return (
    <div
      data-testid="number-plate"
      role="group"
      aria-label={`${say(label, lang)} ${value.split('').join(' ')}`}
      className={cn(
        'relative flex w-full items-center justify-center rounded-xl border-[3px]',
        large ? 'px-6' : 'px-5',
        big ? 'min-h-20 py-3' : 'min-h-14 py-2',
      )}
      style={{ backgroundColor: PLATE_YELLOW, borderColor: PLATE_INK, color: PLATE_INK }}
    >
      <span
        aria-hidden="true"
        className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: PLATE_INK, opacity: 0.55 }}
      />
      <span
        aria-hidden="true"
        className="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: PLATE_INK, opacity: 0.55 }}
      />
      <span
        aria-hidden="true"
        className={cn(
          'select-all break-all text-center font-mono font-semibold leading-tight',
          large ? 'whitespace-nowrap text-meta tracking-normal' : 'text-display tracking-wider',
        )}
      >
        {value}
      </span>
    </div>
  );
}

const FUEL_VAR: Record<FuelFamily, string> = {
  diesel: 'var(--fuel-diesel)',
  petrol: 'var(--fuel-petrol)',
  other: 'var(--fuel-other)',
};

/** A small swatch plus the fuel letters ("HSD"): the colour is never the only cue. */
export function FuelSwatch({
  productKey,
  className,
}: {
  productKey: string | null | undefined;
  className?: string;
}): ReactElement | null {
  const letters = (productKey ?? '').trim();
  if (!letters) return null;
  const family = fuelFamilyOfKey(letters);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-subheading text-text',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: FUEL_VAR[family] }}
      />
      {letters}
    </span>
  );
}

/** "Diesel" with its swatch and letters, e.g. for a fuel block's title. */
export function FuelTitle({
  productKey,
  lang,
  fallback,
}: {
  productKey: string | null | undefined;
  lang: Lang;
  fallback?: string;
}): ReactElement {
  const name = fuelName(productKey, lang) || fallback || '';
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-subheading text-text">
      <FuelSwatch productKey={productKey} />
      <span>{name}</span>
    </span>
  );
}

/** A small pill of fact ("Quantity 6 KL", "Tank T018"). Plain text, `cta` size. */
export function FactPill({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-border-strong bg-surface-2 px-3 text-cta text-text">
      {children}
    </span>
  );
}

/**
 * "More" row: closed by default, 3rem tall. Detail (how a figure was worked out, exact
 * amounts) sits under it so the first screen stays calm.
 */
export function MoreRow({
  title,
  lang,
  children,
}: {
  title: Words;
  lang: Lang;
  children: ReactNode;
}): ReactElement {
  return (
    <details data-testid="more-row" className="group rounded-xl border border-border bg-surface">
      <summary
        className={cn(
          'flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-cta text-text',
          leadingFor(lang),
        )}
      >
        <span>{say(title, lang)}</span>
        <ChevronDown
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className={cn('border-t border-border px-4 py-3 text-body text-text', leadingFor(lang))}>
        {children}
      </div>
    </details>
  );
}

/** IndianOil's own words, verbatim, in a labelled quote so the dealer knows they are not ours. */
export function IndianOilSays({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}): ReactElement {
  const title: Words = {
    hi: 'IndianOil का कहना है',
    hl: 'IndianOil kehta hai',
    en: 'IndianOil says',
  };
  return (
    <figure
      data-testid="indianoil-says"
      className="rounded-xl border border-border-strong bg-surface-2 px-4 py-3"
    >
      <figcaption
        className={cn(
          'flex items-center gap-2 text-subheading uppercase tracking-wide text-text-muted',
          leadingFor(lang),
        )}
      >
        <Quote aria-hidden="true" className="h-4 w-4" />
        {say(title, lang)}
      </figcaption>
      <blockquote className="mt-1 break-words text-body leading-snug text-text">
        {children}
      </blockquote>
    </figure>
  );
}

/** One quiet line with a small icon in front: body size, never smaller. */
export function IconNote({
  icon,
  children,
  lang,
}: {
  icon: ReactNode;
  children: ReactNode;
  lang: Lang;
}): ReactElement {
  return (
    <li className={cn('flex items-start gap-3 text-body text-text', leadingFor(lang))}>
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-text-muted">
        {icon}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_WORDS: Record<CopyState, Words> = {
  idle: { hi: 'कॉपी करें', hl: 'Copy karein', en: 'Copy' },
  copied: { hi: 'कॉपी हो गया', hl: 'Copy ho gaya', en: 'Copied' },
  failed: {
    hi: 'दबाकर रखें और कॉपी करें',
    hl: 'Dabaakar rakhein, phir copy',
    en: 'Press and hold to copy',
  },
};

export interface CopyButtonProps {
  /** Exactly what goes on the clipboard. */
  text: string;
  lang: Lang;
  /** Replaces the idle word ("Copy all"). */
  idleWords?: Words;
  /** What a screen reader hears ("Copy density 820.500"). */
  describe?: string;
  className?: string;
}

/**
 * A 3rem copy button. Tapping it copies `text` and, for two seconds, changes to a tick and
 * the word "Copied": the confirmation is an icon and a word, not a colour. If the phone
 * refuses the copy it says so and tells the dealer to press and hold the number instead.
 */
export function CopyButton({
  text,
  lang,
  idleWords,
  describe,
  className,
}: CopyButtonProps): ReactElement {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const label = state === 'idle' && idleWords ? say(idleWords, lang) : say(COPY_WORDS[state], lang);
  return (
    <button
      type="button"
      data-copy-state={state}
      aria-label={describe && state === 'idle' ? describe : undefined}
      onClick={() => {
        void copyText(text).then((ok) => {
          setState(ok ? 'copied' : 'failed');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setState('idle'), 2000);
        });
      }}
      className={cn(
        'inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-cta text-text shadow-sm active:bg-surface-2',
        leadingFor(lang),
        className,
      )}
    >
      {state === 'copied' ? (
        <Check aria-hidden="true" className="h-5 w-5" />
      ) : (
        <Copy aria-hidden="true" className="h-5 w-5" />
      )}
      <span aria-live="polite">{label}</span>
    </button>
  );
}
