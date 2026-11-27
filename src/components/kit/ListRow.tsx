import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface ListRowProps {
  leading?: ReactNode;
  /** The name. It wraps, and is never cut off. */
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}

/** A row in a list: at least 56px tall, the name wraps, and a tappable row ends in a chevron. */
export function ListRow({ leading, title, subtitle, trailing, onPress, disabled, className }: ListRowProps) {
  const body = (
    <>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="break-words text-body font-medium text-text">{title}</span>
        {subtitle ? <span className="break-words text-meta text-text-muted">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center text-meta text-text-muted">{trailing}</span> : null}
      {onPress ? <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" /> : null}
    </>
  );
  const base = 'flex min-h-14 w-full items-center gap-3 py-2';
  if (!onPress) return <div className={cn(base, className)}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={cn(base, 'active:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60', className)}
    >
      {body}
    </button>
  );
}
