import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useLargeText } from '@/lib/useLargeText';

import { StatusPill } from './StatusPill';
import type { ActionProp, Status } from './types';

/** An action label longer than this goes under the sentence, not beside it (about 12 characters of Devanagari or Latin). */
const LONG_ACTION_LABEL = 12;
/** A phone narrower than this (CSS px) has no room for a button beside a sentence. */
const NARROW_SCREEN_MAX = 399;

function subscribeNarrow(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mq = window.matchMedia(`(max-width: ${NARROW_SCREEN_MAX}px)`);
  mq.addEventListener?.('change', listener);
  return () => mq.removeEventListener?.('change', listener);
}
function narrowNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(`(max-width: ${NARROW_SCREEN_MAX}px)`).matches;
}

/** Is the screen narrower than 400 px, the width of a small Android phone? */
function useNarrowScreen(): boolean {
  return React.useSyncExternalStore(subscribeNarrow, narrowNow, () => false);
}

export interface InsightRowProps {
  /** Draws the status shape and its word above the sentence. */
  status?: Status;
  /** One sentence at body size. Put numbers in `<Num>` so they never split. */
  text: ReactNode;
  /** Right aligned, short. */
  value?: ReactNode;
  /** A 14px line: how old it is, where it comes from. */
  meta?: string;
  /** A 44px button on the row. */
  action?: ActionProp;
  /** Makes the whole row a button and adds a chevron. */
  onPress?: () => void;
  className?: string;
}

/**
 * The workhorse row: a status, one sentence, a value, a line of small print, and one action. At
 * least 56px tall. The status sits above the sentence rather than beside it so the sentence keeps
 * the full width on a 360px phone and at 200% text. The action goes UNDER the sentence whenever its
 * label is longer than about 12 characters or the screen is under 400 px: beside the text it took 55
 * percent of the card, wrapped the sentence to two lines and cut the cover line into five (photos).
 * It stays beside the sentence only on a wide screen with a short label. The chevron is drawn only on
 * a row that has no button. At large text the rem floors give way to the
 * 44 px tap floor (`min-h-tap`): a row and its button are then as tall as their text, not 112 px
 * and 88 px, so the first row still fits on the screen with its button.
 */
export function InsightRow({ status, text, value, meta, action, onPress, className }: InsightRowProps) {
  const large = useLargeText();
  const narrow = useNarrowScreen();
  const underText = large || narrow || (action ? action.label.length > LONG_ACTION_LABEL : false);
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
        {status ? <StatusPill status={status} /> : null}
        <span className="break-words text-body text-text">{text}</span>
        {meta ? <span className="break-words text-meta text-text-muted">{meta}</span> : null}
      </span>
      {value ? <span className="shrink-0 text-body font-semibold text-text">{value}</span> : null}
      {onPress && !action ? <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" /> : null}
    </>
  );
  return (
    <div
      className={cn(
        'flex gap-3',
        // At large text the button goes UNDER the sentence: beside it, the sentence got half the width
        // and the button's label broke onto two lines.
        large
          ? 'min-h-tap flex-col items-stretch gap-1 py-1'
          : underText
            ? 'min-h-14 flex-col items-stretch gap-2 py-2'
            : 'min-h-14 items-center py-2',
        className,
      )}
    >
      {onPress ? (
        <button
          type="button"
          onClick={onPress}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 rounded-md text-left active:bg-surface-2',
            large ? 'min-h-tap' : 'min-h-11',
          )}
        >
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
      )}
      {action ? (
        <Button
          size={large ? 'tap' : 'md'}
          variant={action.variant ?? 'secondary'}
          onClick={action.onPress}
          className={cn(underText ? 'self-start' : 'shrink-0')}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
