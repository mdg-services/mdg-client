import { Check } from 'lucide-react';

import {
  densityDayLabel,
  densityDayNumber,
  densityWindow,
} from '@/hooks/api/useDensity';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { TtDensityMeView } from '@dk/shared/types';

/**
 * The seven days a dealer can still fill in — today and the six before it.
 *
 * Seven, not thirty, and days older than that are not shown at all rather than
 * shown and refused. A week is what a person can honestly reconstruct from a
 * paper register they are holding; past that, a photograph of an old page stops
 * being evidence that the test happened that day and becomes evidence only that
 * the page exists.
 *
 * A sent day opens its photo. A day still to do starts the camera for THAT day,
 * which is the only way a dealer catches up on Friday's page on Sunday.
 */
export function DensityWeekStrip({
  view,
  onPickDay,
  onViewPhoto,
}: {
  view: TtDensityMeView;
  /** Start the capture flow for one day. */
  onPickDay: (businessDate: string) => void;
  /** Show the photo already on file for one day. */
  onViewPhoto: (businessDate: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const days = densityWindow(view);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {t('density.weekTitle')}
      </h2>

      <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
        {/* The weekday letters sit above rather than inside the cells: three
            lines of text will not fit in 44px, and 44px is the floor. */}
        <div
          className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-text-subtle"
          aria-hidden
        >
          {days.map((day) => (
            <span key={day.businessDate}>
              {densityDayLabel(lang, day.businessDate, 'initial')}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const sent = day.status === 'MARKED';
            const label = `${densityDayLabel(lang, day.businessDate, 'full')} — ${
              sent
                ? day.byAdmin
                  ? t('density.adminAdded')
                  : t('density.legendSent')
                : t('density.legendTodo')
            }`;
            return (
              <button
                key={day.businessDate}
                type="button"
                aria-label={label}
                disabled={!sent && !day.markable}
                onClick={() =>
                  sent
                    ? onViewPhoto(day.businessDate)
                    : onPickDay(day.businessDate)
                }
                className={cn(
                  'flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border text-[11px] font-medium',
                  'disabled:opacity-50',
                  sent
                    ? 'border-transparent bg-success-soft text-success'
                    : day.isToday
                      ? 'border-border-strong bg-surface text-text'
                      : 'border-dashed border-border bg-surface text-text-subtle',
                  // MDG filled this one in. Marked, never scolded, and never
                  // offered a Replace button — an admin correction is not the
                  // dealer's problem to fix.
                  sent && day.byAdmin && 'ring-1 ring-inset ring-border-strong',
                  !sent && day.markable && 'active:bg-surface-2',
                )}
              >
                {sent ? (
                  <Check width={14} strokeWidth={2.25} aria-hidden />
                ) : (
                  <span className="text-text-subtle" aria-hidden>
                    ·
                  </span>
                )}
                <span className="tabular-nums leading-none">
                  {densityDayNumber(day.businessDate)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-text-subtle">
          <span className="inline-flex items-center gap-1">
            <Check width={12} strokeWidth={2.25} className="text-success" />
            {t('density.legendSent')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>·</span>
            {t('density.legendTodo')}
          </span>
        </div>
      </div>
    </section>
  );
}
