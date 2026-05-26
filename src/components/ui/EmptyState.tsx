import * as React from 'react';

import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  cta?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div
          className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-text-muted"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className="text-lg font-semibold text-text">{title}</p>
      {description ? (
        <p className="max-w-xs text-sm text-text-muted">{description}</p>
      ) : null}
      {cta ? <div className="mt-2">{cta}</div> : null}
    </div>
  );
}
