import { ChevronRight } from 'lucide-react';

import { kindStyle } from '@/features/reports/kindStyle';
import { StatusShape, statusWord } from '@/features/reports/StatusBadge';
import { sayWords } from '@/features/reports/types';
import { useLang, useT } from '@/lib/i18n';
import type { TodayReport } from '@dk/shared/types';

import type { AlertItem } from './todayModel';

/**
 * One card under "Needs a look": the report's identity (its icon, so the dealer still
 * knows which report it is), how hard it knocks (a shape and a word, never colour alone),
 * a big plain headline, one line, and the one button that opens the report.
 */
export function AlertCard({
  item,
  onOpen,
}: {
  item: AlertItem;
  onOpen: (report: TodayReport) => void;
}) {
  const t = useT();
  const lang = useLang();
  const name = sayWords(kindStyle(item.report.kind).names, lang);
  return (
    <li
      data-report-id={item.report.messageId}
      data-report-kind={item.report.kind}
      data-severity={item.severity}
    >
      <div className="px-4 pb-1 pt-4">
        {/* How hard it knocks (shape + word in the status's ink), then which report it is. */}
        <p data-status={item.severity} className="flex flex-wrap items-center gap-x-1.5 text-meta">
          <StatusShape status={item.severity} size={18} />
          <span className="font-semibold" style={{ color: `var(--status-${item.severity}-ink)` }}>
            {statusWord(item.severity, lang)}
          </span>
          {/* An older report's card is headed by its name already: say it once. */}
          {item.headline !== name ? (
            <>
              <span className="text-text-muted" aria-hidden>
                ·
              </span>
              <span className="text-text-muted">{name}</span>
            </>
          ) : null}
        </p>
        <p className="mt-1.5 break-words text-heading text-text">{item.headline}</p>
        {item.line ? (
          <p className="mt-1 break-words text-body text-text-muted">{item.line}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onOpen(item.report)}
        aria-label={`${t('today.seeDetails')}: ${item.headline}`}
        className="flex min-h-12 w-full items-center gap-1 px-4 pb-3 pt-1 text-left text-cta text-text underline-offset-4 active:underline"
      >
        {t('today.seeDetails')}
        <ChevronRight className="size-5 shrink-0 rtl:rotate-180" strokeWidth={2} aria-hidden />
      </button>
    </li>
  );
}
