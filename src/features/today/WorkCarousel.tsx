import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { TodayTask } from '@dk/shared/types';

import type { PhotoState } from './useInlinePhoto';
import { WorkCard } from './WorkCard';

export interface WorkCarouselProps {
  tasks: TodayTask[];
  /** The id of the section heading ("Your work"), which names the slider for a screen reader. */
  labelledBy: string;
  photoFor: (task: TodayTask) => PhotoState | undefined;
  onPhoto: (task: TodayTask, file: File) => void;
  onRetry: (task: TodayTask) => boolean;
  onOpen: (task: TodayTask) => void;
}

/**
 * "Your work", one card at a time (owner, 25 Nov 2026: two upload boxes stacked took the whole
 * first screen). The cards sit side by side in a row the dealer swipes, each one the full width
 * and snapping into place; under it, ‹ "1 / 3" › says where they are and moves one card each way.
 *
 * - Every card stays a real, reachable card: Tab or a screen reader moves into the next one and
 *   the row scrolls to it by itself. The position line is read out when it changes.
 * - Cards are as tall as the tallest, and each card's button sits at its foot, so the button
 *   does not jump about as the dealer swipes.
 * - When a card leaves (its photo went), the next one slides into its place and the count
 *   follows; with one card left the ‹ › row goes away.
 * - The arrows scroll without animation when the phone asks for reduced motion.
 */
export function WorkCarousel({ tasks, labelledBy, photoFor, onPhoto, onRetry, onOpen }: WorkCarouselProps) {
  const t = useT();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const count = tasks.length;
  const last = Math.max(0, count - 1);
  const at = Math.min(index, last);

  // A card that leaves must not leave the count pointing past the end.
  React.useEffect(() => {
    if (index > last) setIndex(last);
  }, [index, last]);

  const onScroll = React.useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : Math.max(0, Math.min(i, count - 1))));
  }, [count]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    const next = Math.max(0, Math.min(i, last));
    setIndex(next);
    if (!el) return;
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    } else {
      el.scrollLeft = next * el.clientWidth;
    }
  };

  const position = t('today.work.position', { n: at + 1, total: count });

  return (
    <div
      role="group"
      aria-roledescription={t('today.work.slider')}
      aria-labelledby={labelledBy}
      data-testid="today-work-slider"
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tasks.map((task, i) => (
          <div
            key={task.id}
            role="group"
            aria-roledescription={t('today.work.slide')}
            aria-label={t('today.work.position', { n: i + 1, total: count })}
            data-testid="today-work-slide"
            className="w-full shrink-0 snap-start snap-always"
          >
            <WorkCard
              as="div"
              task={task}
              photo={photoFor(task)}
              onPhoto={onPhoto}
              onRetry={onRetry}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <ArrowButton side="prev" disabled={at === 0} label={t('today.work.prev')} onClick={() => goTo(at - 1)} />
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <p aria-live="polite" className="text-meta font-semibold tabular-nums text-text" data-testid="today-work-position">
              {position}
            </p>
            {count <= 8 ? (
              <span className="flex items-center gap-1.5" aria-hidden>
                {tasks.map((task, i) => (
                  <span
                    key={task.id}
                    className={cn(
                      'h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none',
                      i === at ? 'w-4 bg-text' : 'w-1.5 bg-border-strong',
                    )}
                  />
                ))}
              </span>
            ) : null}
          </div>
          <ArrowButton side="next" disabled={at === last} label={t('today.work.next')} onClick={() => goTo(at + 1)} />
        </div>
      ) : null}
    </div>
  );
}

function ArrowButton({
  side,
  disabled,
  label,
  onClick,
}: {
  side: 'prev' | 'next';
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-text transition-colors duration-150 active:bg-surface-2 disabled:border-border disabled:text-text-subtle"
    >
      <Icon className="size-5 rtl:rotate-180" strokeWidth={2} aria-hidden />
    </button>
  );
}
