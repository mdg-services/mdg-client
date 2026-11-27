import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { StatusPill } from '@/components/kit/StatusPill';
import type { Status } from '@/components/kit/types';
import { cn } from '@/lib/cn';
import { useLargeText } from '@/lib/useLargeText';

/**
 * The two row shapes of My pump and the quiet Settings page. They are the kit's `ListRow` and
 * `InsightRow` with one difference both pages need at 200% text: the arrow at the right is left out
 * and the picture at the left is held to 1.5rem, so the sentence keeps the whole width (beside a
 * 40px arrow and a 40px picture it was squeezed to four lines). The whole row is still ONE button, 44px
 * or taller, and a screen reader reads its words, not the arrow: no tap gets harder.
 */

/** A row that opens a page: a picture, a name, a line of small print. */
export function NavRow({
  leading,
  title,
  subtitle,
  onPress,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const large = useLargeText();
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn('flex w-full items-center gap-3 py-2 text-left active:bg-surface-2', large ? 'min-h-tap' : 'min-h-14')}
    >
      {leading ? <span className="flex w-6 shrink-0 items-center justify-center">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words text-body font-medium text-text">{title}</span>
        {subtitle ? <span className="break-words text-meta text-text-muted">{subtitle}</span> : null}
      </span>
      {large ? null : <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />}
    </button>
  );
}

/** A "How things stand" row: a shape and a word, one sentence, the small print, the whole row a button. */
export function StandRow({
  status,
  text,
  meta,
  onPress,
}: {
  status: Status;
  text: string;
  meta?: string;
  onPress: () => void;
}) {
  const large = useLargeText();
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn('flex w-full items-center gap-3 py-2 text-left active:bg-surface-2', large ? 'min-h-tap' : 'min-h-14')}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <StatusPill status={status} />
        <span className="break-words text-body text-text">{text}</span>
        {meta ? <span className="break-words text-meta text-text-muted">{meta}</span> : null}
      </span>
      {large ? null : <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />}
    </button>
  );
}
