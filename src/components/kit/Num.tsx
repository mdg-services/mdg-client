import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/fmt';

/**
 * A number that never splits across two lines (spec 3.3): "24,330" and "1,18,000" stay in one piece
 * when a sentence wraps at 200% text. Give it a number (written with Indian grouping) or text that
 * is already formatted ("24,330 L", "Rs 1,18,000").
 */
export function Num({
  value,
  children,
  className,
}: {
  value?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {value !== undefined ? fmtInt(value) : children}
    </span>
  );
}
