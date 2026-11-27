import * as React from 'react';
import type { ReactNode } from 'react';

import { StatusShape } from '@/features/reports/StatusBadge';
import { cn } from '@/lib/cn';
import { useLargeText } from '@/lib/useLargeText';

import { Num } from './Num';
import { STATUS_TONE, type Status } from './types';

export interface VerdictCardProps {
  /** `unknown` ("Cannot check right now") and `setup` ("Setting up your pump") draw the circle-i. */
  status: Status | 'unknown' | 'setup';
  /** The verdict in words: "All fine", "2 things wait for you". */
  word: string;
  /** One sentence at body size that names the first reasons. */
  sentence?: string;
  /**
   * Plain text beside a number: `{ label: 'need you', n: 2 }` reads "2 need you". The label has no
   * number in it. They are NOT tap targets.
   */
  counts?: { label: string; n: number }[];
  /** How old the answer is, as `<AsOf/>`. */
  asOf?: ReactNode;
  /** The notices row, a ring, and the like. */
  children?: ReactNode;
  /**
   * Hides the sentence, the as-of line and the counts, keeping the verdict word (the counts stay
   * for a screen reader). Left out, it follows the reader's text size (`useLargeText`): compact from
   * 140% up. The counts go because at 200% in Hindi the word and the counts take two lines each and
   * push the first thing to do off a 640 px screen (Appendix A); the word already says the number.
   */
  compact?: boolean;
  className?: string;
}

/**
 * The answer to "is my pump OK, and what needs me?" in a card: a big status shape and the verdict
 * in words, then the reasons. The shape and the word say the same thing, so it reads in sunlight
 * and in greyscale. It is a labelled region named by the word.
 */
export function VerdictCard({ status, word, sentence, counts, asOf, children, compact: compactProp, className }: VerdictCardProps) {
  const large = useLargeText();
  const compact = compactProp ?? large;
  const shown: Status = status === 'unknown' || status === 'setup' ? 'info' : status;
  const tone = STATUS_TONE[shown];
  const countLine = counts && counts.length > 0 ? counts : null;
  return (
    <section
      aria-label={word}
      data-verdict={status}
      className={cn('flex flex-col rounded-xl border shadow-sm', compact ? 'gap-1 p-2' : 'gap-2 p-4', tone.soft, tone.border, className)}
    >
      <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
        <span
          aria-hidden
          className={cn('flex shrink-0', compact ? '[&>svg]:h-[1.25em] [&>svg]:w-[1.25em]' : '[&>svg]:h-[2.25rem] [&>svg]:w-[2.25rem]')}
        >
          <StatusShape status={shown} />
        </span>
        <h2 className={cn('min-w-0 break-words', compact ? 'text-heading' : 'text-title', tone.ink)}>{word}</h2>
      </div>
      {!compact && sentence ? <p className="break-words text-body text-text">{sentence}</p> : null}
      {countLine ? (
        <p className={cn('text-meta font-medium text-text', compact ? 'sr-only' : 'flex flex-wrap gap-x-3 gap-y-0.5')}>
          {countLine.map((c, i) => (
            <React.Fragment key={c.label}>
              {compact && i > 0 ? <span aria-hidden>, </span> : null}
              <span className="break-words">
                <Num value={c.n} /> {c.label}
              </span>
            </React.Fragment>
          ))}
        </p>
      ) : null}
      {!compact && asOf ? <p className="text-meta text-text-muted">{asOf}</p> : null}
      {children}
    </section>
  );
}
