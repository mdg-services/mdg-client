import { CheckCircle2, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { FuelOrderCardView } from '@/features/chat/FuelOrderCardView';
import { kindStyle } from '@/features/reports/kindStyle';
import { StatusBadge, statusWord } from '@/features/reports/StatusBadge';
import { sayWords } from '@/features/reports/types';
import { useLang, useT } from '@/lib/i18n';
import type { TodayReport } from '@dk/shared/types';

import { familyVar } from './familyColor';
import { reportDayLabel } from './todayView';

/** A section's heading: 20 px bold, with the count in a pill when there is one. */
export function SectionHeading({
  id,
  children,
  count,
}: {
  id: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h2 id={id} className="mb-2.5 flex items-baseline gap-2 px-0.5 text-heading text-text">
      <span>{children}</span>
      {count && count > 0 ? <span className="font-normal tabular-nums text-text-muted">{count}</span> : null}
    </h2>
  );
}

/** One calm line for a section with nothing in it. A tick, never an illustration. */
export function CalmLine({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p
      data-testid={testId}
      className="flex items-start gap-2.5 border-y border-border px-0.5 py-3 text-body text-text-muted"
    >
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-ok-ink" strokeWidth={1.75} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** "N more" / "Show less": a 48 px row at the end of a list that was cut short. */
export function MoreButton({
  hiddenCount,
  expanded,
  onToggle,
  about,
}: {
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
  /** The heading of the list it belongs to: "2 more" alone says nothing to a screen reader. */
  about?: string;
}) {
  const t = useT();
  const text = expanded ? t('today.less') : t('today.more', { n: hiddenCount });
  return (
    <button
      type="button"
      aria-expanded={expanded}
      {...(about ? { 'aria-label': `${text}: ${about}` } : {})}
      onClick={onToggle}
      className="mt-2 flex min-h-12 w-full items-center justify-center rounded-[10px] px-4 text-cta text-text underline-offset-4 active:bg-surface-2"
    >
      {text}
    </button>
  );
}

/** The rounded white sheet a compact list sits on. */
export function Sheet({ children, labelledBy }: { children: React.ReactNode; labelledBy: string }) {
  return (
    <ul
      aria-labelledby={labelledBy}
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"
    >
      {children}
    </ul>
  );
}

/** One receipt under "Done for you": its own icon, one plain line, its date. Opens the report. */
export function DoneRow({
  report,
  headline,
  today,
  onOpen,
}: {
  report: TodayReport;
  /** The kind's own line, or the team's words for an older report. */
  headline: string;
  today: string;
  onOpen: (report: TodayReport) => void;
}) {
  const t = useT();
  const lang = useLang();
  const style = kindStyle(report.kind);
  const name = sayWords(style.names, lang);
  const when = reportDayLabel(report, today, lang, t);
  const { Icon } = style;
  return (
    <li data-report-id={report.messageId} data-report-kind={report.kind} className="relative">
      <button
        type="button"
        onClick={() => onOpen(report)}
        aria-label={[headline, when, t('today.openReport', { title: name })].filter(Boolean).join('. ')}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-2"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: familyVar(report.kind, '-soft'), color: familyVar(report.kind, '-ink') }}
          aria-hidden
        >
          <Icon width={18} strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="break-words text-body font-medium text-text">{headline}</span>
          {when ? <span className="text-meta text-text-muted">{when}</span> : null}
        </span>
        <ChevronRight width={18} strokeWidth={1.75} className="shrink-0 text-text-subtle" aria-hidden />
      </button>
    </li>
  );
}

/**
 * A report that came before snapshots existed: its name, its date, the team's words, and
 * a way in (the report screen opens its picture). A tanker card with no snapshot is still
 * drawn as the card it is. Calm on purpose: no tile, no big number.
 */
export function EarlierRow({
  report,
  today,
  onOpen,
  onSeeInChat,
}: {
  report: TodayReport;
  today: string;
  onOpen: (report: TodayReport) => void;
  onSeeInChat: (report: TodayReport) => void;
}) {
  const t = useT();
  const lang = useLang();
  const style = kindStyle(report.kind);
  const name = sayWords(style.names, lang);
  const when = reportDayLabel(report, today, lang, t);
  const { Icon } = style;

  if (report.fuelCard) {
    return (
      <li data-report-id={report.messageId} data-report-kind={report.kind} className="relative">
        <div className="px-3.5 pb-1 pt-3 text-meta font-medium text-text-muted">
          {name}
          {when ? ` · ${when}` : ''}
        </div>
        <div className="px-3.5 pb-1 pt-2">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <FuelOrderCardView card={report.fuelCard} lang={lang} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSeeInChat(report)}
          className="flex min-h-12 w-full items-center gap-1 px-3.5 text-left text-cta font-medium text-text active:bg-surface-2"
        >
          {t('today.seeInChat')}
          <ChevronRight width={16} strokeWidth={2} aria-hidden />
        </button>
      </li>
    );
  }

  return (
    <li data-report-id={report.messageId} data-report-kind={report.kind} className="relative">
      <button
        type="button"
        onClick={() => onOpen(report)}
        aria-label={[
          when ? `${name} · ${when}` : name,
          report.headline,
          report.status === 'attention' ? statusWord('attention', lang) : '',
          t('today.openReport', { title: name }),
        ]
          .filter(Boolean)
          .join('. ')}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-2"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: familyVar(report.kind, '-soft'), color: familyVar(report.kind, '-ink') }}
          aria-hidden
        >
          <Icon width={18} strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="break-words text-body font-medium text-text">
            {name}
            {when ? <span className="font-normal text-text-muted">{` · ${when}`}</span> : null}
          </span>
          {report.headline ? (
            <span className="line-clamp-2 text-meta text-text-muted">{report.headline}</span>
          ) : null}
          {report.status === 'attention' ? <StatusBadge status="attention" lang={lang} className="mt-1 w-fit" /> : null}
        </span>
        <ChevronRight width={18} strokeWidth={1.75} className="shrink-0 text-text-subtle" aria-hidden />
      </button>
    </li>
  );
}
