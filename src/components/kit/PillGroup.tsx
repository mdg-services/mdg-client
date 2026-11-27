import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useLargeText } from '@/lib/useLargeText';

export interface PillGroupProps<T extends string> {
  /** Names the group for a screen reader ("Show"). */
  label: string;
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  className?: string;
}

/**
 * The switch: one choice of a few, drawn as a row of pills. A labelled radio group: each segment is
 * at least 44px tall, says its choice in words, and the one chosen has a raised, bolder look
 * as well as `aria-checked`. Left and right arrows move the choice. At large text (140% or more) the
 * segments stack in a column, each the full width with its count on the same line: in a row, "Services"
 * and "Today / This month / Last month" were cut in the middle of a word at 200% (photos). A word is
 * never split: `break-words` is only the fallback for a word wider than the whole bar.
 */
export function PillGroup<T extends string>({ label, value, options, onChange, className }: PillGroupProps<T>) {
  const t = useT();
  const large = useLargeText();
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: number) => {
    const next = (from + step + options.length) % options.length;
    const target = options[next];
    if (!target) return;
    onChange(target.id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex w-full gap-1 rounded-lg bg-surface-2 p-1', large ? 'flex-col' : 'flex-wrap', className)}
    >
      {options.map((o, i) => {
        const on = o.id === value;
        const name = o.count !== undefined ? t('kit.pill.withCount', { label: o.label, n: o.count }) : o.label;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={name}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-center text-cta',
              large ? 'min-h-tap w-full' : 'min-h-11 flex-1',
              on ? 'bg-surface text-text shadow-sm' : 'text-text-muted active:bg-surface',
            )}
          >
            <span className="min-w-0 break-words hyphens-none">{o.label}</span>
            {o.count !== undefined ? (
              <span className="shrink-0 text-meta font-semibold tabular-nums">{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
