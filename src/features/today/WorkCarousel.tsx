import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import type { NeedsMeItem } from '@/features/glance/needsMe';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { TodayTask } from '@dk/shared/types';

import type { PhotoState } from './useInlinePhoto';
import { WorkCard } from './WorkCard';

export interface WorkCarouselProps {
  items: NeedsMeItem[];
  /** The id of the section heading ("Needs you"), which names the slider for a screen reader. */
  labelledBy: string;
  photoFor: (task: TodayTask) => PhotoState | undefined;
  onPhoto: (task: TodayTask, file: File) => void;
  onRetry: (task: TodayTask) => boolean;
  onOpenTask: (task: TodayTask) => void;
  onOpenItem: (item: NeedsMeItem) => void;
  /** The kind's own line for an alert row. */
  detailFor?: (item: NeedsMeItem) => string | undefined;
}

/**
 * "Needs you", one card at a time (owner, 25 Nov 2026: two upload boxes stacked took the whole
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
export function WorkCarousel({ items, labelledBy, photoFor, onPhoto, onRetry, onOpenTask, onOpenItem, detailFor }: WorkCarouselProps) {
  const t = useT();
  const lang = useLang();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const count = items.length;
  const last = Math.max(0, count - 1);
  const at = Math.min(index, last);

  // The row opens on its FIRST card, the most urgent one, and goes back to it when the words change
  // language (the cards re-flow, so an old scroll offset would point at another card). The position
  // is the `index` state: the scroll offset only reports where a swipe ended.
  React.useLayoutEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = 0;
    setIndex(0);
  }, [lang]);

  // A card left (its photo went) or the order changed: the dealer stays on the card they were reading
  // when it is still there; if that one left, the next one slides into its place.
  const ids = items.map((i) => i.id);
  const idsKey = ids.join('|');
  const held = React.useRef<{ id: string | undefined; at: number }>({ id: ids[0], at: 0 });
  React.useLayoutEffect(() => {
    const el = trackRef.current;
    const keep = held.current.id !== undefined ? ids.indexOf(held.current.id) : -1;
    const next = keep >= 0 ? keep : Math.min(held.current.at, Math.max(0, ids.length - 1));
    if (el && el.clientWidth > 0) el.scrollLeft = next * el.clientWidth;
    setIndex(next);
    // `ids` is read through `idsKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  React.useEffect(() => {
    held.current = { id: ids[Math.min(index, last)], at: Math.min(index, last) };
  });

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
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-surface shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div
            key={item.id}
            role="group"
            aria-roledescription={t('today.work.slide')}
            aria-label={t('today.work.position', { n: i + 1, total: count })}
            data-testid="today-work-slide"
            className="w-full shrink-0 snap-start snap-always"
          >
            <WorkCard
              as="div"
              item={item}
              photo={item.task ? photoFor(item.task) : undefined}
              onPhoto={onPhoto}
              onRetry={onRetry}
              onOpenTask={onOpenTask}
              onOpenItem={onOpenItem}
              detail={detailFor?.(item)}
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
                {items.map((item, i) => (
                  <span
                    key={item.id}
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
      className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface text-text transition-colors duration-150 active:bg-surface-2 disabled:border-border disabled:text-text-subtle"
    >
      <Icon className="size-5 rtl:rotate-180" strokeWidth={2} aria-hidden />
    </button>
  );
}
