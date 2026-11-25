import * as React from 'react';

import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { ReportKind } from '@dk/shared/types';

import { familyVar } from './familyVar';
import { kindStyle } from './kindStyle';
import { getKindView } from './registry';
import { rowHeadline, rowStatus, type HistoryRow } from './reportsHistoryView';
import { clockWords } from './reportView';
import { StatusBadge } from './StatusBadge';
import { sayWords } from './types';

/**
 * The identity tile: the kind's tint with its mini signature drawn in the kind's ink, and the
 * family's round icon in the corner. Two cues that are not colour (the shape and the icon), so a
 * dealer finds a report in the list by recognising it, not by reading it.
 */
export function IdentityTile({ kind }: { kind: ReportKind }) {
  const style = kindStyle(kind);
  const { Glyph } = getKindView(kind);
  return (
    <span
      aria-hidden="true"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"
      style={{ backgroundColor: familyVar(style.family, 'soft'), color: familyVar(style.family, 'ink') }}
    >
      <Glyph size={24} />
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-md bg-surface-2 px-2 text-meta font-medium text-text-muted">
      {children}
    </span>
  );
}

/**
 * One report in the Reports tab. The whole row is one tap target (72 px or more) that opens the
 * overlay. A replaced report is muted and says so; a corrected one says so; a message from before
 * snapshots says it opens as a picture. At large text the status drops under the words instead of
 * squeezing them.
 */
export function ReportHistoryRow({ row, onOpen }: { row: HistoryRow; onOpen: (row: HistoryRow) => void }) {
  const t = useT();
  const lang = useLang();
  const { report } = row;
  const style = kindStyle(report.kind);
  const headline = rowHeadline(report, lang);
  const status = rowStatus(report, lang);
  const time = clockWords(report.sentAt, lang);
  return (
    <li>
      <button
        type="button"
        data-testid="report-history-row"
        data-kind={report.kind}
        data-replaced={row.replaced || undefined}
        onClick={() => onOpen(row)}
        className="flex min-h-[72px] w-full flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-border px-4 py-3.5 text-left transition-colors duration-150 active:bg-surface-2"
      >
        <IdentityTile kind={report.kind} />
        <span className="min-w-[9rem] flex-1">
          <span
            className={cn(
              'block break-words text-subheading leading-normal',
              row.replaced ? 'text-text-muted' : 'text-text',
            )}
          >
            {sayWords(style.names, lang)}
          </span>
          {headline ? (
            <span
              className={cn(
                'block whitespace-pre-line break-words text-body leading-normal',
                'text-text-muted',
              )}
            >
              {headline}
            </span>
          ) : null}
          {row.replaced || row.corrected || row.picture ? (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {row.replaced ? <Tag>{t('reports.tagReplaced')}</Tag> : null}
              {row.corrected ? <Tag>{t('reports.tagCorrected')}</Tag> : null}
              {row.picture ? <Tag>{t('reports.tagPicture')}</Tag> : null}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {time ? <span className="text-meta tabular-nums text-text-muted">{time}</span> : null}
          {/* "Info" says nothing on a list: only a state with something to say gets a tag. */}
          {row.replaced || status === 'info' ? null : <StatusBadge status={status} lang={lang} />}
        </span>
      </button>
    </li>
  );
}
