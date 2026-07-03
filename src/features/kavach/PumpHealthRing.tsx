import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT, type MessageKey } from '@/lib/i18n';

type Band = 'good' | 'few' | 'catchup' | 'settling';

interface BandStyle {
  stroke: string;
  text: string;
  /** i18n catalog key for the one-line verdict (resolved via t()). */
  verdictKey: MessageKey;
}

const BANDS: Record<Band, BandStyle> = {
  good: {
    stroke: 'text-success',
    text: 'text-success',
    verdictKey: 'kavach.bandGood',
  },
  few: {
    stroke: 'text-warning',
    text: 'text-warning',
    verdictKey: 'kavach.bandFew',
  },
  catchup: {
    // Forward language, not a punitive red "fail" (spec §4).
    stroke: 'text-warning',
    text: 'text-warning',
    verdictKey: 'kavach.bandCatchup',
  },
  settling: {
    stroke: 'text-info',
    text: 'text-info',
    verdictKey: 'kavach.bandSettling',
  },
};

function bandFor(pct: number, settling: boolean): Band {
  if (settling) return 'settling';
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'few';
  return 'catchup';
}

/**
 * "Pump health" — one friendly, coarse-banded dial. Color = state, never a
 * scary gradient meter. During settling-in it shows a calm "Getting started"
 * state and never a red fail (spec §4, uxDesign §1.3 / §1.8).
 */
export function PumpHealthRing({
  pct,
  settling = false,
}: {
  pct: number;
  settling?: boolean;
}) {
  const t = useT();
  const band = bandFor(pct, settling);
  const style = BANDS[band];

  // 280° sweep so a low score still reads as a dial, not an empty circle.
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const sweep = 0.78; // 280/360
  const shown = Math.max(0, Math.min(100, Math.round(pct)));
  const arcLen = circ * sweep;
  const dash = (shown / 100) * arcLen;

  // Animate the dash up smoothly when the score changes (e.g. after mark-done).
  const [animDash, setAnimDash] = React.useState(0);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setAnimDash(dash));
    return () => window.cancelAnimationFrame(id);
  }, [dash]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          // Rotate so the 280° arc opens at the bottom, gap centered downward.
          style={{ transform: 'rotate(126deg)' }}
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className="text-surface-2"
            stroke="currentColor"
            strokeDasharray={`${arcLen} ${circ}`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={cn(style.stroke, 'transition-[stroke-dasharray] duration-700 ease-out')}
            stroke="currentColor"
            strokeDasharray={`${animDash} ${circ}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn('text-3xl font-semibold tracking-tight', style.text)}
          >
            {shown}%
          </span>
        </div>
      </div>
      <p className="mt-1 text-sm font-medium text-text">
        {t(style.verdictKey)}
      </p>
    </div>
  );
}
