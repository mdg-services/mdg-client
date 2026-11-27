import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { DeltaChip, type DeltaChipProps } from './DeltaChip';
import { MiniBars, type MiniBarsProps } from './MiniBars';
import { StatusPill } from './StatusPill';
import type { Status } from './types';

export interface StatTileProps {
  label: string;
  /** The number, as `<Num>`. It wraps and never shrinks. */
  value: ReactNode;
  unit?: string;
  delta?: DeltaChipProps;
  /** A 14px line: may name the fuel or the day. */
  caption?: string;
  bars?: MiniBarsProps;
  /** For several fuels: one row each, in place of one big value. */
  rows?: { label: string; value: string; status?: Status }[];
  /** Shown as a status pill only when it is not `ok`. */
  status?: Status;
  /** "today 7:05 am", "from yesterday". */
  asOf?: string;
  /** Makes the whole tile one tap target. */
  onPress?: () => void;
  /** Built from the words and including the status word. */
  ariaLabel: string;
  className?: string;
}

/**
 * One number and what it means. When `onPress` is given the whole tile is one button (at least
 * 44px by its own size); otherwise it is a labelled group. The value is `display` size, or `title`
 * where there are several rows, and is never scaled down to fit: it wraps instead.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  caption,
  bars,
  rows,
  status,
  asOf,
  onPress,
  ariaLabel,
  className,
}: StatTileProps) {
  const body = (
    <>
      <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-meta font-medium text-text-muted">{label}</span>
        {status && status !== 'ok' ? <StatusPill status={status} /> : null}
      </span>
      {rows && rows.length > 0 ? (
        <span className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <span key={r.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5">
              <span className="min-w-0 break-words text-body text-text">{r.label}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-body font-semibold text-text">{r.value}</span>
                {r.status && r.status !== 'ok' ? <StatusPill status={r.status} /> : null}
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="break-words text-display text-text">{value}</span>
          {unit ? <span className="text-meta text-text-muted">{unit}</span> : null}
        </span>
      )}
      {delta ? <DeltaChip {...delta} /> : null}
      {bars ? <MiniBars {...bars} className="mt-1" /> : null}
      {caption ? <span className="break-words text-meta text-text-muted">{caption}</span> : null}
      {asOf ? <span className="break-words text-meta text-text-subtle">{asOf}</span> : null}
    </>
  );
  const base =
    'flex min-h-11 w-full flex-col items-stretch gap-1.5 rounded-xl border border-border bg-surface p-3 text-left shadow-sm';
  if (!onPress) {
    return (
      <div role="group" aria-label={ariaLabel} className={cn(base, className)}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onPress}
      className={cn(base, 'active:bg-surface-2', className)}
    >
      {body}
    </button>
  );
}
