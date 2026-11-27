import { Num, VerdictCard } from '@/components/kit';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { useLargeText } from '@/lib/useLargeText';
import type { KavachDealerView } from '@dk/shared/types';

import {
  pctOf,
  pointsOf,
  scoreStatusOf,
  sentenceOf,
  type KavachSections,
  type ScoreCounts,
} from './kavachView';

/** The two places a count can lead to. */
export type JumpTarget = 'needs' | 'now';

const R = 52;
const C = 2 * Math.PI * R;

/**
 * The score card, on top of the Kavach door (spec 4.4, item 2): a ring drawn with a shape, the % written
 * as a number, "2,320 of 3,740 points" (the server's own figures), one plain sentence, and three counts
 * (sent back, late, to do today) that are the outlet's, like the ring, so the counts and the ring agree.
 * The ring is a picture of the number beside it, never the only place the number is: a screen reader
 * gets the figure in words.
 *
 * It does not claim "all fine": the shape says what the card is about (a triangle when a photo was
 * sent back or a job is late, a clock when jobs are left today, a tick when nothing is). "Since
 * yesterday" and "if MDG accepts what you sent you reach N%" are not here: they need server figures
 * that do not exist yet (spec 9, N5).
 *
 * The counts are the reader's own lists, counted once (`countsOfSections`), and a count that has something
 * behind it is a 44 px button that takes the reader to that list ("Needs you" for sent back and late, the
 * first list for to do today).
 *
 * At large text (140% or more) the ring shrinks to 5 rem (and never takes more than two fifths of the
 * card), and the sentence is kept for a screen reader only, so the first thing to do is still on the
 * screen; the counts stay.
 */
export function KavachSummary({
  view,
  sections,
  counts,
  onJump,
}: {
  view: KavachDealerView;
  sections: KavachSections;
  counts: ScoreCounts;
  /** Take the reader to a list on the page. Without it the counts are plain text. */
  onJump?: (target: JumpTarget) => void;
}) {
  const t = useT();
  const lang = useLang();
  const large = useLargeText();
  const pct = pctOf(view);
  const points = pointsOf(view);
  const sentence = sentenceOf(view, sections, lang);
  const filled = pct === null ? 0 : (C * pct) / 100;
  const parts: { n: number; label: string; id: string; to: JumpTarget | null }[] = [
    { n: counts.sentBack, label: t('kv.count.sentBack'), id: 'sent-back', to: 'needs' },
    { n: counts.late, label: t('kv.count.late'), id: 'late', to: 'needs' },
    // The first list: what is waiting under "Do today", or, with nothing there, "Needs you".
    { n: counts.todo, label: t('kv.count.todo'), id: 'todo', to: sections.now.length > 0 ? 'now' : 'needs' },
  ];
  return (
    <div data-testid="kavach-summary">
      <VerdictCard status={scoreStatusOf(view, counts)} word={t('kv.score.title')} compact={large}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div
            className={cn('relative shrink-0 text-kind-kavach-ink', 'aspect-square max-w-[40%]', large ? 'w-20' : 'w-32')}
            data-testid="kavach-ring"
          >
            <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden focusable="false">
              <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="11" />
              <circle
                cx="64"
                cy="64"
                r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${filled} ${C}`}
              />
            </svg>
            <span
              className={cn(
                'absolute inset-0 flex items-center justify-center tabular-nums text-text',
                large ? 'text-heading' : 'text-title',
              )}
              data-testid="kavach-pct"
              {...(pct !== null ? { role: 'img', 'aria-label': t('kv.score.ring', { pct }) } : {})}
            >
              {pct === null ? '–' : `${pct}%`}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="break-words text-body text-text" data-testid="kavach-points">
              {points
                ? t('kv.score.points', { done: fmtInt(points.done, lang), total: fmtInt(points.total, lang) })
                : t('kv.score.none')}
            </p>
            <p className={cn('break-words text-body text-text-muted', large && 'sr-only')} data-testid="kavach-sentence">
              {sentence}
            </p>
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-text" data-testid="kavach-counts">
          {parts.map((p) => (
            <li key={p.id} data-testid={`kavach-count-${p.id}`} className="break-words">
              {onJump && p.n > 0 && (p.to === 'needs' ? sections.needs.length > 0 : sections.now.length > 0) ? (
                <button
                  type="button"
                  onClick={() => onJump(p.to as JumpTarget)}
                  className="-mx-1 inline-flex min-h-11 items-center rounded-md px-1 text-left underline underline-offset-4 active:bg-surface-2"
                >
                  <span className="break-words">
                    <Num value={p.n} className="font-semibold" /> {p.label}
                  </span>
                </button>
              ) : (
                <>
                  <Num value={p.n} className="font-semibold" /> {p.label}
                </>
              )}
            </li>
          ))}
        </ul>
      </VerdictCard>
    </div>
  );
}
