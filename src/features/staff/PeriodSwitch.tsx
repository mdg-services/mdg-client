import * as React from 'react';

import { cn } from '@/lib/cn';
import { useLargeText } from '@/lib/useLargeText';

/**
 * The Warriors page's switch, "Today | This month | Last month". It looks and behaves exactly like the
 * shared `PillGroup` (one labelled radio group, arrows move the choice, each segment 44px or taller),
 * with one difference that matters at large text: at 140% or more the three choices stack, one per
 * row across the full width, and a word breaks only at a space. In a row of three, "पिछला महीना" at
 * 200% text was cut into "पिछ / ला / मही / ना" and the last choice fell off the screen.
 */
export function PeriodSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
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
      className={cn(
        'flex w-full gap-1 rounded-lg bg-surface-2 p-1',
        large ? 'flex-col' : 'flex-wrap',
      )}
    >
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
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
              'flex min-h-11 min-w-0 items-center justify-center rounded-md px-3 py-1 text-center text-cta',
              large ? 'w-full flex-none break-normal' : 'flex-1 break-words',
              on ? 'bg-surface text-text shadow-sm' : 'text-text-muted active:bg-surface',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
