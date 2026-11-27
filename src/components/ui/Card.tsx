import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * The card look (spec section 5): 12px corners, a hairline border and a hairline shadow on the
 * page's own white. It carries no padding of its own: the page puts `p-4` on it, or uses
 * `CardContent`.
 */
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface shadow-sm',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardContent({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...rest}>
      {children}
    </div>
  );
}
