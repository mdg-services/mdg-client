import { ArrowDown, ArrowUp, Check, ChevronRight, Equal, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { StatusPill } from '@/components/kit';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { useLargeText } from '@/lib/useLargeText';
import type { ReportKind } from '@dk/shared/types';

import { familyVar } from './familyVar';
import { kindStyle } from './kindStyle';
import { getKindView } from './registry';
import { rowHeadline, rowStatus, type ChangeLine, type HistoryRow } from './reportsHistoryView';
import { clockWords } from './reportView';
import { sayWords } from './types';

/**
 * The identity tile: the kind's tint with its mini signature drawn in the kind's ink. A shape a
 * dealer recognises, never a status: the family colour is never red, amber or green.
 */
export function IdentityTile({ kind }: { kind: ReportKind }) {
  const style = kindStyle(kind);
  const { Glyph } = getKindView(kind);
  return (
    <span
      aria-hidden="true"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
      style={{ backgroundColor: familyVar(style.family, 'soft'), color: familyVar(style.family, 'ink') }}
    >
      <Glyph size={24} />
    </span>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-md bg-surface-2 px-2 text-meta font-medium text-text-muted">
      {children}
    </span>
  );
}

/** "New": a filled dot AND the word, so it never rests on colour alone. */
function NewMark({ label }: { label: string }) {
  return (
    <span
      data-testid="report-new-mark"
      className="inline-flex min-h-6 items-center gap-1.5 rounded-md bg-brand px-2 text-meta font-semibold text-text-inverse"
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-text-inverse" />
      {label}
    </span>
  );
}

/**
 * What changed since the last one: a shape and the words, in the quiet text colour (never green or
 * red). An arrow only where up is good (sales, with "more than" in the words); a triangle for "worse",
 * a tick for "better", and no shape for a plain fact. An arrow never stands without a word beside it.
 */
function Change({ line }: { line: ChangeLine }) {
  const Icon =
    line.dir === 'up'
      ? ArrowUp
      : line.dir === 'down'
        ? ArrowDown
        : line.dir === 'same'
          ? Equal
          : line.dir === 'worse'
            ? TriangleAlert
            : line.dir === 'better'
              ? Check
              : null;
  return (
    <span data-testid="report-change" data-dir={line.dir} className="flex min-w-0 items-start gap-1.5 text-meta text-text">
      {Icon ? <Icon aria-hidden="true" className="mt-0.5 h-[1.1em] w-[1.1em] shrink-0" strokeWidth={2.5} /> : null}
      <span className="min-w-0 break-words">{line.text}</span>
    </span>
  );
}

/**
 * One report in the list. The whole row is one tap target (at least 3.5rem, and as tall as its words)
 * that opens the overlay. Under the name: the kind's headline, what changed since the last one, then
 * the status as a shape and a word, the marks (New, Corrected, Picture, Replaced) and the time it came.
 * Nothing is cut off: names and headlines wrap, and at large text the marks wrap under the words.
 */
export function ReportHistoryRow({ row, onOpen }: { row: HistoryRow; onOpen: (row: HistoryRow) => void }) {
  const t = useT();
  const lang = useLang();
  const large = useLargeText();
  const { report } = row;
  const style = kindStyle(report.kind);
  const headline = rowHeadline(report, lang);
  const status = rowStatus(report, lang);
  const time = clockWords(report.sentAt, lang);
  // "Info" says nothing on a list: only a state with something to say gets a pill.
  const showStatus = !row.replaced && status !== 'info';
  const name = (
    <span
      className={cn(
        'block min-w-0 break-words text-subheading leading-normal',
        row.replaced ? 'text-text-muted' : 'text-text',
      )}
    >
      {sayWords(style.names, lang)}
    </span>
  );
  const details = (
    <>
      {headline ? (
        <span className="block min-w-0 max-w-full whitespace-pre-line break-words text-body leading-normal text-text-muted">
          {headline}
        </span>
      ) : null}
      {row.change && !row.replaced ? <Change line={row.change} /> : null}
      {showStatus || row.isNew || row.corrected || row.picture || row.replaced ? (
        <span className="flex max-w-full flex-wrap items-center gap-1.5">
          {showStatus ? <StatusPill status={status} /> : null}
          {row.isNew ? <NewMark label={t('rep.row.new')} /> : null}
          {row.corrected ? <Mark>{t('rep.row.corrected')}</Mark> : null}
          {row.picture ? <Mark>{t('rep.row.picture')}</Mark> : null}
          {row.replaced ? <Mark>{t('rep.row.replaced')}</Mark> : null}
        </span>
      ) : null}
      {time ? <span className="text-meta tabular-nums text-text-muted">{t('rep.row.sent', { time })}</span> : null}
    </>
  );
  return (
    <li className="min-w-0">
      <button
        type="button"
        data-testid="report-history-row"
        data-kind={report.kind}
        data-replaced={row.replaced || undefined}
        data-new={row.isNew || undefined}
        onClick={() => onOpen(row)}
        className={cn(
          'flex w-full min-w-0 text-left transition-colors duration-150 active:bg-surface-2',
          // At large text the picture, the name and the arrow keep one row and everything else goes
          // under them at the full width: beside the picture the words had 84 px of a 324 px card.
          large ? 'min-h-tap flex-col gap-1 px-3 py-2' : 'min-h-14 items-start gap-3 px-4 py-3',
        )}
      >
        {large ? (
          <>
            <span className="flex w-full min-w-0 items-center gap-2">
              <IdentityTile kind={report.kind} />
              {name}
              <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-text-subtle" />
            </span>
            <span className="flex w-full min-w-0 flex-col items-start gap-1">{details}</span>
          </>
        ) : (
          <>
            <IdentityTile kind={report.kind} />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              {name}
              {details}
            </span>
            <ChevronRight aria-hidden="true" className="mt-3 h-5 w-5 shrink-0 text-text-subtle" />
          </>
        )}
      </button>
    </li>
  );
}
