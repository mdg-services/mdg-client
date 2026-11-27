import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { fmtPoints } from '@/lib/staff';
import { useLargeText } from '@/lib/useLargeText';

export interface PointsBar {
  /** The whole day, for the screen reader's table: "Fri 20 Nov". */
  label: string;
  /** What is printed under the bar: the day of the month, "20". */
  tick: string;
  value: number;
}

/**
 * One warrior's points for each of the last days, as bars (his own page, spec 4.7). It replaces the
 * shared `MiniBars` here because that chart drew today as an EMPTY outlined bar with no number, which
 * a pump owner reads as "zero", and it squeezed the word "today" into one narrow column so it broke
 * in the middle.
 *
 *  - Today is the same solid bar as every other day, and its number is printed above it.
 *  - A day with no points is a thin line, not a bar, so a quiet day never looks like a tall one.
 *  - Only every third day carries a label (every fourth at large text), a day of the month, so
 *    nothing is squeezed. The last label is the word "today", never split, and it sits against the
 *    right edge so a long word grows leftwards into the empty columns.
 *
 * Like the shared chart it is one picture to a screen reader (named by `summary`), and the same
 * numbers sit in a visually hidden table beside it.
 */
export function PointsBars({
  data,
  summary,
  className,
}: {
  data: PointsBar[];
  summary: string;
  className?: string;
}) {
  const t = useT();
  const large = useLargeText();
  const last = data.length - 1;
  const top = Math.max(1, ...data.map((b) => b.value));
  const step = large ? 4 : 3;
  return (
    <div className={cn('flex flex-col', className)}>
      <div role="img" aria-label={summary}>
        <div className="flex h-28 items-end gap-1">
          {data.map((b, i) => {
            const isToday = i === last;
            // Tallest bar at 78% of the box, so today's number always has room above it.
            const height = b.value > 0 ? Math.max(6, (b.value / top) * 78) : 0;
            return (
              <div
                key={`${b.label}-${i}`}
                className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                {isToday ? (
                  <span
                    data-testid="today-points"
                    className="absolute right-0 whitespace-nowrap text-meta font-semibold tabular-nums text-text"
                    style={{ bottom: `calc(${height}% + 0.25rem)` }}
                  >
                    {fmtPoints(b.value)}
                  </span>
                ) : null}
                {b.value > 0 ? (
                  <div className="w-full rounded-sm bg-brand" style={{ height: `${height}%` }} />
                ) : (
                  <div className="h-0.5 w-full rounded-sm bg-border-strong" />
                )}
              </div>
            );
          })}
        </div>
        <div
          aria-hidden
          className="mt-1 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }}
        >
          {data.map((b, i) => {
            const isToday = i === last;
            if (!isToday && (last - i) % step !== 0) return <span key={`${b.label}-${i}`} />;
            return (
              <span
                key={`${b.label}-${i}`}
                className={cn(
                  'whitespace-nowrap text-meta',
                  isToday
                    ? 'justify-self-end font-semibold text-text'
                    : 'justify-self-center text-text-muted',
                )}
              >
                {isToday ? t('kit.day.today') : b.tick}
              </span>
            );
          })}
        </div>
      </div>
      {/* The wrapper is what is hidden: a bare `table.sr-only` keeps its table layout, so its long caption
          and cells poke past the right edge and widen the page (the same fix as in MiniBars). */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">{t('kit.bars.tableDay')}</th>
              <th scope="col">{t('kit.bars.tableValue')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((b, i) => (
              <tr key={`${b.label}-r-${i}`}>
                <th scope="row">{b.label}</th>
                <td>{fmtPoints(b.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
