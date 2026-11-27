import { ArrowDown, ArrowUp, Equal } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtInt, fmtLitres } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';

export interface DeltaChipProps {
  dir: 'up' | 'down' | 'same';
  n?: number;
  unit?: '%' | 'L';
  /** What it is compared with, already in the reader's words: "last Monday". */
  against: string;
  className?: string;
}

/**
 * A change, said three ways at once: an arrow shape, the words "more than" or "less than", and the
 * number. Never colour alone, and not green or red either: a fall in sales is not always bad news
 * and a rise is not always good. It wraps at 200% text.
 */
export function DeltaChip({ dir, n, unit, against, className }: DeltaChipProps) {
  const t = useT();
  const lang = useLang();
  let text: string;
  if (dir === 'same') {
    text = t('kit.delta.same', { against });
  } else if (n === undefined) {
    text = t(dir === 'up' ? 'kit.delta.upNoNumber' : 'kit.delta.downNoNumber', { against });
  } else {
    const amount = unit === 'L' ? fmtLitres(n, lang) : unit === '%' ? `${fmtInt(n, lang)}%` : fmtInt(n, lang);
    text = t(dir === 'up' ? 'kit.delta.up' : 'kit.delta.down', { amount, against });
  }
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Equal;
  return (
    <span
      data-dir={dir}
      className={cn(
        'inline-flex items-start gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-meta font-medium text-text',
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 h-[1.1em] w-[1.1em] shrink-0" strokeWidth={2.5} />
      <span className="min-w-0 break-words">{text}</span>
    </span>
  );
}
