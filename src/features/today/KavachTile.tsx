import { ShieldCheck } from 'lucide-react';

import { pctOf, todayOf } from '@/features/kavach/kavachView';
import { StatusBadge } from '@/features/reports/StatusBadge';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { KavachDealerView } from '@dk/shared/types';

import { tileValueStyle } from './PumpTile';

/**
 * The Kavach tile of "Your pump today" (ADR 0057 §5): the live % from the same query the Kavach tab
 * reads, how many jobs are left for today, and a way into the tab. Drawn only where Kavach is on for the
 * pump. It is the same size and look as the report tiles beside it, in Kavach's own black.
 */
export function KavachTile({ view, onOpen }: { view: KavachDealerView; onOpen: () => void }) {
  const t = useT();
  const lang = useLang();
  const pct = pctOf(view);
  // Today's jobs, the same count as the tab's badge and sentence (a late job is always today's).
  const today = todayOf(view);
  const todo = today.length;
  const late = today.filter((i) => i.late).length;
  const value = pct === null ? '–' : `${pct}%`;
  const sub = todo > 0 ? t('kavach.today.sub', { n: todo }) : t('kavach.today.subClear');
  const style = tileValueStyle(value);
  return (
    <li data-tile="kavach" className="shadow-[inset_-1px_-1px_0_var(--color-border)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('tabs.kavach')}: ${value}. ${sub}. ${t('kavach.today.open')}`}
        className="flex h-full min-h-[136px] w-full flex-col px-3.5 pb-3.5 pt-3 text-left transition-colors duration-150 active:bg-surface-2"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-6 shrink-0 items-center text-kind-kavach-ink" aria-hidden>
            <ShieldCheck width={20} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 break-words text-meta font-medium text-text-muted">{t('tabs.kavach')}</span>
        </span>
        <span
          data-tile-value
          className={cn(
            'mt-2 whitespace-nowrap font-semibold tabular-nums leading-tight tracking-[-0.015em] text-text',
            style.size,
          )}
        >
          {value}
        </span>
        <span className="mt-1 break-words text-meta text-text-muted">{sub}</span>
        {late > 0 ? (
          <span className="mt-auto pt-2">
            <StatusBadge status="problem" lang={lang} word={t('kavach.tag.late')} />
          </span>
        ) : null}
      </button>
    </li>
  );
}
