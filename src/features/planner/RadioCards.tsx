import * as React from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { cn } from '@/lib/cn';

/**
 * A row of large radio choices, the way the sign-up's site-type choice looks: a
 * fieldset with a visible legend, each choice a 48px card with the native radio
 * inside its label (so the whole card is the tap target, and a keyboard or screen
 * reader gets a real radio group). The chosen card is marked by its border AND its
 * filled radio, never by colour alone; an error is said in words under the group.
 */
export function RadioCards<V extends string>({
  legend,
  options,
  value,
  error,
  register,
  columns = 2,
}: {
  legend: string;
  options: ReadonlyArray<{ value: V; label: string }>;
  value: string;
  error?: string;
  register: UseFormRegisterReturn;
  columns?: 1 | 2;
}) {
  const errorId = React.useId();
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1.5 text-subheading text-text">{legend}</legend>
      {/* Two to a row on a phone; one to a row when large text would squeeze the words. */}
      <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]' : 'grid-cols-1')}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-focus-ring',
              value === o.value
                ? 'border-brand bg-brand-soft'
                : error
                  ? 'border-danger bg-surface'
                  : 'border-border-strong bg-surface',
            )}
          >
            <input type="radio" value={o.value} className="h-5 w-5 shrink-0 accent-brand" {...register} />
            <span className="min-w-0 text-body font-medium text-text">{o.label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="text-meta text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
