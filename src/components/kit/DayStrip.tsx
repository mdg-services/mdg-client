import { StatusShape } from '@/features/reports/StatusBadge';
import { cn } from '@/lib/cn';
import { fmtDay, weekdayLetter } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';

export interface DayStripProps {
  days: { day: string; state: 'came' | 'none' | 'look'; onPress?: () => void }[];
  /** What the strip is about, for the spoken label: "sales report". Default: "report". */
  subject?: string;
  /** For tests: the clock "today" and "yesterday" are counted from. */
  now?: Date;
  className?: string;
}

/** A hollow dashed circle: nothing came that day. The shape differs from the tick and the triangle. */
function NoneShape() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="var(--status-info-ink)" strokeWidth="2" strokeDasharray="3 2.5" />
    </svg>
  );
}

/**
 * Seven to fourteen days as dots: a tick when the report came, a dashed ring when it did not, a
 * triangle when it came and needs a look, each with a day letter. Every dot has a spoken label
 * ("No sales report for Tue 18 Nov"). A dot with `onPress` is a 44px button. At 200% text the strip
 * wraps onto a second row instead of squeezing.
 */
export function DayStrip({ days, subject, now, className }: DayStripProps) {
  const t = useT();
  const lang = useLang();
  const what = subject ?? t('kit.dayStrip.subject');
  return (
    <ol
      aria-label={t('kit.dayStrip.label')}
      className={cn('grid grid-cols-[repeat(auto-fit,minmax(2rem,1fr))] gap-1', className)}
    >
      {days.map((d) => {
        const key =
          d.state === 'came' ? 'kit.dayStrip.came' : d.state === 'look' ? 'kit.dayStrip.look' : 'kit.dayStrip.none';
        const label = t(key, { subject: what, date: fmtDay(d.day, lang, now) });
        const inner = (
          <>
            {d.state === 'came' ? (
              <StatusShape status="ok" />
            ) : d.state === 'look' ? (
              <StatusShape status="attention" />
            ) : (
              <NoneShape />
            )}
            <span aria-hidden className="text-meta text-text-muted">
              {weekdayLetter(d.day, lang)}
            </span>
          </>
        );
        const cell = 'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md';
        return (
          <li key={d.day} className="flex">
            {d.onPress ? (
              <button type="button" aria-label={label} onClick={d.onPress} className={cn(cell, 'w-full active:bg-surface-2')}>
                {inner}
              </button>
            ) : (
              <div role="img" aria-label={label} className={cn(cell, 'w-full')}>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
