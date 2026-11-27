import type { ReactElement, ReactNode } from 'react';

import type { Lang } from '@/store/lang';

import { StatusShape } from '../../StatusBadge';
import type { ReportStatusKey } from '../../types';

import { fuelColor, fuelLetters, fuelName, tanksWords } from './fmt';

/**
 * Small pieces the four stock-and-sales overlays share. Plain Tailwind on the light tokens, 16 px
 * minimum text, 48 px minimum targets, every size in rem.
 */

/** The overlay's lead sentence: heading size, before any number. */
export function Lead({ children }: { children: ReactNode }): ReactElement {
  return <p className="text-heading text-text">{children}</p>;
}

/** A small swatch in the fuel's workbook colour, always beside the fuel's letters. */
export function FuelSwatch({ fuelKey }: { fuelKey: string }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{ backgroundColor: fuelColor(fuelKey) }}
    />
  );
}

/** "Diesel (HSD) · tanks 4, 6, 8" with the fuel swatch: the band over each fuel's block. */
export function FuelBand({
  fuelKey,
  tankNos,
  lang,
  trailing,
}: {
  fuelKey: string;
  tankNos?: readonly number[];
  lang: Lang;
  trailing?: ReactNode;
}): ReactElement {
  const name = fuelName(fuelKey, lang);
  const letters = fuelLetters(fuelKey);
  const tanks = tankNos ? tanksWords(tankNos, lang) : '';
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subheading leading-snug text-text">
      <FuelSwatch fuelKey={fuelKey} />
      <span>{name}</span>
      {name.toUpperCase() !== letters ? <span className="text-subheading text-text-muted">({letters})</span> : null}
      {tanks ? <span className="text-body font-normal text-text-muted">· {tanks}</span> : null}
      {trailing}
    </div>
  );
}

/**
 * A coloured line with a status shape: the shape and the words carry the meaning, the tint
 * only helps. Used for the stale-reading band, the severity banner and the "what to do" box.
 */
export function Callout({
  status,
  children,
  testId,
}: {
  status: ReportStatusKey;
  children: ReactNode;
  testId?: string;
}): ReactElement {
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
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A closed-by-default "More" row: 48 px to open, detail inside. */
export function More({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer items-center px-3.5 text-body font-medium leading-relaxed text-text">
        {label}
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-3 text-body leading-relaxed text-text-muted">{children}</div>
    </details>
  );
}
