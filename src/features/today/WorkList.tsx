import * as React from 'react';

import type { NeedsMeItem } from '@/features/glance/needsMe';
import { useT } from '@/lib/i18n';
import { tn } from '@/lib/messages/_plural';
import type { TodayTask } from '@dk/shared/types';

import type { PhotoState } from './useInlinePhoto';
import { WorkCard } from './WorkCard';

/** How many rows show before "N more" (spec 4.1). */
export const WORK_LIST_LIMIT = 4;

export interface WorkListProps {
  items: NeedsMeItem[];
  /** The id of the section heading ("Needs you"), which names the list for a screen reader. */
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
 * "Needs you" as a list (the other layout of Q1): up to four rows, each with its shape and word, what
 * and which service, how long it has waited and one button; the rest behind "N more". The rows are the
 * same cards the slider shows, so a photo ask is answered inside its row exactly as in the slider.
 */
export function WorkList({ items, labelledBy, photoFor, onPhoto, onRetry, onOpenTask, onOpenItem, detailFor }: WorkListProps) {
  const t = useT();
  const [all, setAll] = React.useState(false);
  const shown = all ? items : items.slice(0, WORK_LIST_LIMIT);
  const hidden = items.length - WORK_LIST_LIMIT;
  return (
    <div data-testid="today-work-list">
      <ul
        aria-labelledby={labelledBy}
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        {shown.map((item) => (
          <WorkCard
            key={item.id}
            as="li"
            item={item}
            photo={item.task ? photoFor(item.task) : undefined}
            onPhoto={onPhoto}
            onRetry={onRetry}
            onOpenTask={onOpenTask}
            onOpenItem={onOpenItem}
            detail={detailFor?.(item)}
          />
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-md px-4 text-cta text-text underline underline-offset-4 active:bg-surface-2"
        >
          {all ? t('today.less') : tn('kit.more', hidden)}
        </button>
      ) : null}
    </div>
  );
}
