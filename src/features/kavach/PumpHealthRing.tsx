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
 *
 * WHILE SETTLING IT SHOWS NO FIGURE AT ALL, and that is a correction, not a
 * refinement. The settling band used to change only the colour and the caption:
 * the percentage was still printed in the middle and the arc was still drawn to
 * its length, so a dealer whose programme was switched off, or still inside its
 * grace period, read MDG's number off this ring in calm blue. The whole point of
 * the settling state is that MDG has not made that statement yet, and an arc is
 * as much a statement of it as the digits are.
 */
export function PumpHealthRing({
  pct,
  settling = false,
}: {
  /**
   * Optional because the server now OMITS the percentage rather than zeroing it
   * when a dealer may not be shown it (`kavachScoreIsPublishable`). Absent and
   * settling are treated identically here: no number, no arc.
   */
  pct?: number;
  settling?: boolean;
}) {
  const t = useT();
  // Nothing is published while settling, and nothing can be published without a
  // figure to publish.
  const published = !settling && pct !== undefined;
  const band = bandFor(pct ?? 0, settling);
  const style = BANDS[band];

  // 280° sweep so a low score still reads as a dial, not an empty circle.
  const size = 140;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const sweep = 0.78; // 280/360
  const shown = published ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
  const arcLen = circ * sweep;
  const dash = published ? (shown / 100) * arcLen : 0;

  // Animate the dash up smoothly when the score changes. The dealer no longer
  // causes that change — an admin or an automation does — so the movement is a
  // report arriving, not a reward for a tap.
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
            {published ? `${shown}%` : '\u2014'}
          </span>
        </div>
      </div>
      <p className="mt-1 text-sm font-medium text-text">
        {t(style.verdictKey)}
      </p>
    </div>
  );
}
