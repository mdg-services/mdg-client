import { STATUS_STYLE, StatusShape } from '@/features/reports/StatusBadge';
import { sayWords } from '@/features/reports/types';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';

import { STATUS_TONE, type Status } from './types';

export interface StatusPillProps {
  status: Status | 'stopped';
  /** Replaces the standard word ("Short", "Overdue"). The word is always shown. */
  word?: string;
  className?: string;
}

/**
 * The status as a shape AND a word, never colour alone (spec 3.1): octagon "Problem", triangle
 * "Needs a look", clock "We are on it", tick "All fine", circle-i "Info". `stopped` is the octagon
 * with the word "Stopped". It is not a button: no tap target of its own. The word wraps rather than
 * shrinks at 200% text, and the shape grows with it.
 */
export function StatusPill({ status, word, className }: StatusPillProps) {
  const lang = useLang();
  const t = useT();
  const key: Status = status === 'stopped' ? 'problem' : status;
  const text =
    word ?? (status === 'stopped' ? t('kit.status.stopped') : sayWords(STATUS_STYLE[key].word, lang));
  const tone = STATUS_TONE[key];
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-meta font-semibold',
        tone.soft,
        tone.ink,
        className,
      )}
    >
      {/* The shape is an SVG with a fixed size attribute; the em sizes override it so it grows with the text. */}
      <span aria-hidden className="flex shrink-0 [&>svg]:h-[1.25em] [&>svg]:w-[1.25em]">
        <StatusShape status={key} />
      </span>
      <span className="min-w-0 break-words">{text}</span>
    </span>
  );
}
