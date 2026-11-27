import { StatusPill } from '@/components/kit/StatusPill';
import { STATUS_TONE, type Status } from '@/components/kit/types';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';

import { WRAP, signedL } from './parts';

/**
 * One fuel's stock variation against its allowed band, as the kit's `BandBar` draws it but with the
 * signs written the way the dealer's own sheet writes them: one real minus sign (−520) and a plus
 * (+310), the same in the picture's spoken label and in the line under it. (The kit's bar prints a
 * hyphen and drops the plus, and a dealer read "-520" and "–420" as two different things.)
 */
export function VariationBar({
  fuel,
  value,
  low,
  high,
  word,
  status,
}: {
  fuel: string;
  value: number;
  low: number;
  high: number;
  word: string;
  status: Status;
}) {
  const t = useT();
  const lang = useLang();
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  const pad = Math.max((hi - lo) * 0.25, 1);
  const min = Math.min(lo, value) - pad;
  const max = Math.max(hi, value) + pad;
  const at = (x: number) => `${Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100))}%`;
  const line = t('svc.band.line', {
    value: signedL(value, lang),
    low: signedL(lo, lang),
    high: signedL(hi, lang),
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={cn(WRAP, 'text-subheading text-text')}>{fuel}</p>
        <StatusPill status={status} word={word} />
      </div>
      <div role="img" aria-label={`${fuel}: ${line}. ${word}`} className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-border-strong" />
        <div
          className={cn(
            'absolute top-1/2 h-4 -translate-y-1/2 rounded-sm border-2',
            STATUS_TONE.ok.soft,
            STATUS_TONE.ok.border,
          )}
          style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-text" style={{ left: at(value) }}>
          <div className="absolute -left-1 -top-0.5 h-2.5 w-2.5 rotate-45 bg-text" />
        </div>
      </div>
      <p className={cn(WRAP, 'text-meta text-text-muted')}>{line}</p>
    </div>
  );
}
