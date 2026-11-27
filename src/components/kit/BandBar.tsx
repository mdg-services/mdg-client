import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';

import { Num } from './Num';
import { StatusPill } from './StatusPill';
import { STATUS_TONE, type Status } from './types';

export interface BandBarProps {
  fuel: string;
  /** Where the fuel stands now, on the same scale as `low` and `high`. */
  value: number;
  low: number;
  high: number;
  /** In words: "inside the limit". Shown with the status shape. */
  word: string;
  status: Status;
  className?: string;
}

/**
 * One fuel's variation against its allowed band. The band is the allowed stretch, the diamond with
 * a line is where the fuel stands, and the status pill says in words whether that is inside. The
 * numbers are printed too: the picture is never the only way to read it.
 */
export function BandBar({ fuel, value, low, high, word, status, className }: BandBarProps) {
  const t = useT();
  const lang = useLang();
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const pad = Math.max((hi - lo) * 0.25, 1);
  const min = Math.min(lo, value) - pad;
  const max = Math.max(hi, value) + pad;
  const at = (x: number) => `${Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100))}%`;
  const range = t('kit.band.range', { low: fmtInt(lo, lang), high: fmtInt(hi, lang) });
  const label = `${fuel}: ${fmtInt(value, lang)}. ${word}. ${range}`;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-subheading text-text">{fuel}</p>
        <StatusPill status={status} word={word} />
      </div>
      <div role="img" aria-label={label} className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-border-strong" />
        <div
          className={cn(
            'absolute top-1/2 h-4 -translate-y-1/2 rounded-sm border-2',
            STATUS_TONE.ok.soft,
            STATUS_TONE.ok.border,
          )}
          style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-text"
          style={{ left: at(value) }}
        >
          <div className="absolute -left-1 -top-0.5 h-2.5 w-2.5 rotate-45 bg-text" />
        </div>
      </div>
      <p className="text-meta text-text-muted">
        <Num value={value} /> · {range}
      </p>
    </div>
  );
}
