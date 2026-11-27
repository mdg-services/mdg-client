import type { ReactNode } from 'react';
import * as React from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { useLargeText } from '@/lib/useLargeText';

export interface SectionCardProps {
  title: string;
  count?: number;
  /** A 44px text button at the right of the title. */
  seeAll?: { label: string; onPress: () => void };
  /** `list`: rows with hairline dividers. `tinted`: the needs-you card, on a soft ground. */
  variant?: 'plain' | 'list' | 'tinted';
  /**
   * At large text the title is kept for a screen reader but not drawn, for a card whose meaning the
   * text above it already says (the Needs-you card under "2 things wait for you"). Default: always drawn.
   */
  hideTitleAtLargeText?: boolean;
  children: ReactNode;
  className?: string;
}

/** One card, one question: a title (with a count and "See all" if needed) and what answers it. */
export function SectionCard({ title, count, seeAll, variant = 'plain', hideTitleAtLargeText, children, className }: SectionCardProps) {
  const id = React.useId();
  const large = useLargeText();
  return (
    <Card
      role="region"
      aria-labelledby={id}
      className={cn(large ? 'p-2' : 'p-4', variant === 'tinted' && 'border-border-strong bg-brand-soft', className)}
    >
      <div className={cn('flex flex-wrap items-center justify-between gap-x-3', large && hideTitleAtLargeText && !seeAll && 'sr-only')}>
        <h2 id={id} className={cn('min-w-0 break-words text-text', large ? 'text-subheading' : 'text-heading')}>
          {title}
          {count !== undefined ? (
            <span className="ml-2 text-meta font-semibold text-text-muted tabular-nums">{count}</span>
          ) : null}
        </h2>
        {seeAll ? (
          <button
            type="button"
            onClick={seeAll.onPress}
            className={cn(
              '-mr-2 rounded-md px-2 text-cta text-text underline underline-offset-4 active:bg-surface-2',
              large ? 'min-h-tap' : 'min-h-11',
            )}
          >
            {seeAll.label}
          </button>
        ) : null}
      </div>
      <div className={cn(large ? 'mt-1' : 'mt-2', variant === 'list' && 'divide-y divide-border')}>{children}</div>
    </Card>
  );
}
