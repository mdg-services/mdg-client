import { CheckCheck } from 'lucide-react';

import { StatusPill } from '@/components/kit/StatusPill';
import type { Status } from '@/components/kit/types';
import { useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';

import { longDay, paperName, type PaperItem, type PaperState } from './pumpModel';

const STATUS: Record<PaperState, Status> = { expired: 'problem', expiring: 'attention', valid: 'ok', onFile: 'ok' };

/**
 * One paper or licence: its state as a shape AND a word, with the DAYS first in the word when the end
 * is near ("9 days left"), so the number is the first thing read and is never cut off; the paper's name
 * on its own line below (the name wraps, never cut); the last good day with its year (or, once gone,
 * when it ended); and, where the list is of licences (`showAccepted`), a small "MDG accepted" mark when MDG also holds the paper. Never colour alone.
 */
export function PaperRow({ item, showAccepted = false }: { item: PaperItem; showAccepted?: boolean }) {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const name = paperName(item, lang, t);
  const days = item.days;
  const word =
    item.state === 'expired'
      ? t('pump.paper.word.expired')
      : item.state === 'expiring'
        ? days === 0
          ? t('pump.paper.chip.today')
          : days !== null && days > 0
            ? tn('pump.paper.chip.days', days)
            : t('pump.paper.word.expiring')
        : item.state === 'valid'
          ? t('pump.paper.word.valid')
          : t('pump.paper.word.onFile');
  const meta = item.until
    ? t(item.state === 'expired' ? 'pump.papers.ended' : 'pump.papers.until', { date: longDay(item.until, lang) })
    : item.period;
  return (
    <div className="flex min-h-14 flex-col items-start gap-1 py-2">
      <StatusPill status={STATUS[item.state]} word={word} />
      <p className="break-words text-body font-medium text-text">{name}</p>
      {meta ? <p className="break-words text-meta text-text-muted">{meta}</p> : null}
      {showAccepted && item.accepted ? (
        <p className="flex items-center gap-1.5 text-meta text-text-muted">
          <CheckCheck aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="break-words">{t('pump.papers.accepted')}</span>
        </p>
      ) : null}
    </div>
  );
}
