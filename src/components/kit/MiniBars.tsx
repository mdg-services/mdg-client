import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/fmt';
import { useT } from '@/lib/i18n';

export interface MiniBarsProps {
  /** Up to 14 bars, oldest first. `null` is a day with no number: a hollow stub marked "none". */
  data: { label: string; value: number | null }[];
  /** The bar for today: outlined and tagged "today". */
  todayIndex?: number;
  /** A dashed line at this value. */
  average?: number;
  /** One spoken sentence: "Last 14 days, highest 24,100 litres on 20 November". */
  summary: string;
  className?: string;
}

/**
 * A small bar chart in plain `div`s: no library, heights as percentages of a rem-sized box. It is
 * one image to a screen reader, whose name is `summary`; the same numbers sit in a visually hidden
 * table beside it. A missing day is a hollow stub with the word "none", never a bar of zero.
 */
export function MiniBars({ data, todayIndex, average, summary, className }: MiniBarsProps) {
  const t = useT();
  const bars = data.slice(-14);
  const offset = data.length - bars.length;
  const values = bars.map((b) => b.value).filter((v): v is number => v !== null);
  const top = Math.max(1, ...values, average ?? 0);
  const showLabels = bars.length <= 7;
  const today = todayIndex !== undefined ? todayIndex - offset : -1;
  return (
    <div className={cn('flex flex-col', className)}>
      <div role="img" aria-label={summary} className="relative">
        <div className="relative flex h-20 items-end gap-1">
          {average !== undefined ? (
            <div
              aria-hidden
              className="absolute inset-x-0 border-t-2 border-dashed border-text-muted"
              style={{ bottom: `${Math.min(100, (average / top) * 100)}%` }}
            />
          ) : null}
          {bars.map((b, i) => {
            const isToday = i === today;
            return (
              <div
                key={`${b.label}-${i}`}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                {b.value === null ? (
                  <div className="h-2 w-full rounded-sm border-2 border-dashed border-border-strong" />
                ) : (
                  <div
                    className={cn(
                      'w-full rounded-sm',
                      isToday ? 'border-2 border-brand bg-surface' : 'bg-brand',
                    )}
                    style={{ height: `${Math.max(4, (b.value / top) * 100)}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-start gap-1">
          {bars.map((b, i) => (
            <div
              key={`${b.label}-t-${i}`}
              className="min-w-0 flex-1 text-center text-micro text-text-muted"
            >
              {b.value === null ? (
                <span className="break-words">{t('kit.bars.none')}</span>
              ) : i === today ? (
                <span className="break-words font-semibold text-text">{t('kit.day.today')}</span>
              ) : showLabels ? (
                <span className="break-words">{b.label}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {/* The wrapper is what is hidden: a bare `table.sr-only` keeps its table layout, so a long caption
          or cell stretched the page sideways at large text even though it was not drawn. */}
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
            {bars.map((b, i) => (
              <tr key={`${b.label}-r-${i}`}>
                <th scope="row">{b.label}</th>
                <td>{b.value === null ? t('kit.bars.none') : fmtInt(b.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
