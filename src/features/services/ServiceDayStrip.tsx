import { StatusShape } from '@/features/reports/StatusBadge';
import { cn } from '@/lib/cn';
import { fmtDay, weekdayLetter } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';

import type { StripDay } from './serviceHistoryModel';

/** A hollow dashed circle: nothing came that day. A shape of its own, never the tick or the triangle. */
function NoneShape() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <circle
        cx="10"
        cy="10"
        r="7.5"
        fill="none"
        stroke="var(--status-info-ink)"
        strokeWidth="2"
        strokeDasharray="3 2.5"
      />
    </svg>
  );
}

function Mark({ state }: { state: StripDay['state'] }) {
  if (state === 'came') return <StatusShape status="ok" />;
  if (state === 'look') return <StatusShape status="attention" />;
  if (state === 'wait') return <StatusShape status="info" />;
  return <NoneShape />;
}

const LEGEND = {
  came: 'svc.strip.legend.came',
  look: 'svc.strip.legend.look',
  none: 'svc.strip.legend.none',
  wait: 'svc.strip.legend.wait',
} as const;

/**
 * The last days of a service as marks: a tick when its report came, a triangle when it came and needs
 * a look, a dashed ring when it did not come, a circle with an i for today when it is not due yet.
 * Each mark carries its DATE (the day number under the weekday letter) and a spoken label, and a line
 * of words under the strip says what each shape means, so no shape stands alone. The kit's strip drew
 * 14 marks under a "30 days" heading, stopped at yesterday and explained nothing; this one includes
 * today, says how many days it shows and carries its own legend. A mark with a report is a 44px
 * button. At 200% text the marks wrap onto more rows.
 */
export function ServiceDayStrip({
  days,
  subject,
  now,
  onOpen,
}: {
  days: readonly StripDay[];
  /** What the strip is about, for the spoken label: "sales report". */
  subject: string;
  now: Date;
  onOpen: (day: StripDay) => void;
}) {
  const t = useT();
  const lang = useLang();
  const present = (['came', 'look', 'none', 'wait'] as const).filter((s) =>
    days.some((d) => d.state === s),
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="break-words text-meta font-medium text-text">
        {t('svc.strip.title', { n: days.length })}
      </p>
      <ol
        aria-label={t('kit.dayStrip.label')}
        className="grid grid-cols-[repeat(auto-fit,minmax(2.25rem,1fr))] gap-1"
      >
        {days.map((d) => {
          const date = fmtDay(d.day, lang, now);
          const label =
            d.state === 'came'
              ? t('kit.dayStrip.came', { subject, date })
              : d.state === 'look'
                ? t('kit.dayStrip.look', { subject, date })
                : d.state === 'wait'
                  ? t('svc.strip.wait', { subject, date })
                  : t('kit.dayStrip.none', { subject, date });
          const inner = (
            <>
              <Mark state={d.state} />
              <span aria-hidden className="text-meta text-text-muted">
                {weekdayLetter(d.day, lang)}
              </span>
              <span aria-hidden className="text-meta font-medium tabular-nums text-text">
                {Number(d.day.slice(8, 10))}
              </span>
            </>
          );
          const cell =
            'flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md';
          return (
            <li key={d.day} className="flex">
              {d.report ? (
                <button
                  type="button"
                  aria-label={label}
                  onClick={() => onOpen(d)}
                  className={cn(cell, 'active:bg-surface-2')}
                >
                  {inner}
                </button>
              ) : (
                <div role="img" aria-label={label} className={cell}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-text-muted">
        {present.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className="flex shrink-0 [&>svg]:h-[1.25em] [&>svg]:w-[1.25em]">
              <Mark state={s} />
            </span>
            <span className="break-words">{t(LEGEND[s])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
