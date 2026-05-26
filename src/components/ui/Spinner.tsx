import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';

export function Spinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Loader2
      width={size}
      height={size}
      strokeWidth={1.75}
      className={cn('animate-spin', className)}
      aria-label="Loading"
    />
  );
}
