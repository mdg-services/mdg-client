import { Button } from '@/components/ui/Button';
import { StatusShape } from '@/features/reports/StatusBadge';
import { cn } from '@/lib/cn';

import type { ActionProp } from './types';

export interface EmptyCalmProps {
  text: string;
  /** The shape beside the text: a tick for "nothing to do", the circle-i for a plain fact. */
  status?: 'ok' | 'info';
  action?: ActionProp;
  className?: string;
}

/** Nothing here, said calmly: a shape, one sentence, and at most one button. Not an error. */
export function EmptyCalm({ text, status = 'info', action, className }: EmptyCalmProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-2 py-6 text-center', className)}>
      <span aria-hidden className="flex [&>svg]:h-8 [&>svg]:w-8">
        <StatusShape status={status} />
      </span>
      <p className="max-w-xs break-words text-body text-text-muted">{text}</p>
      {action ? (
        <Button variant={action.variant ?? 'secondary'} onClick={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
