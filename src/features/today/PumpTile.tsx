import { CircleDashed } from 'lucide-react';

import { kindStyle } from '@/features/reports/kindStyle';
import { StatusBadge, statusWord } from '@/features/reports/StatusBadge';
import { getKindView } from '@/features/reports/registry';
import { sayWords } from '@/features/reports/types';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import type { ReportKind, TodayReport } from '@dk/shared/types';

import { familyVar } from './familyColor';
import { reportDayLabel, type TileItem, type TileSlotSpec } from './todayView';

/**
 * How the big value is set. A figure (₹11,79,215, 24,330 L) must never break in the middle of
 * its digits, so a single word is kept on one line and steps down in size as it gets longer:
 * 28 px up to 6 characters, 22 px up to 8, 20 px beyond (10 lakh and over, in a 134 px tile).
 * A value of several words wraps between words, at the smaller size when it is long.
 */
export function tileValueStyle(value: string): { size: string; unbroken: boolean; figure: boolean } {
  const length = [...value].length;
  const size = length <= 6 ? 'text-[1.75rem]' : length <= 8 ? 'text-title' : 'text-heading';
  return { size, unbroken: !/\s/.test(value), figure: /\d/.test(value) };
}

/**
 * One tile of "Your pump today": the report's family colour and icon, its name, one big
 * value, one small line, and its own signature in miniature (the same shape the report
 * opens with). A badge appears only when the report is not fine, always as a shape and a
 * word. The whole tile is one target that opens the report.
 */
export function PumpTile({
  item,
  today,
  onOpen,
}: {
  item: TileItem;
  /** The feed's day (YYYY-MM-DD): a tile whose figures are from another day says which. */
  today?: string;
  onOpen: (report: TodayReport) => void;
}) {
  const t = useT();
  const lang = useLang();
  const style = kindStyle(item.kind);
  const { Glyph } = getKindView(item.kind as ReportKind);
  const name = sayWords(style.names, lang);
  const { tile } = item;
  // A tile is data, not news: only a state the dealer should act on or wait for earns a badge.
  const showBadge = !!tile.status && tile.status !== 'ok' && tile.status !== 'info';
  // Tiles stay for a week when nothing newer comes: say so when they are not today's.
  const when =
    today && item.day && item.day !== today
      ? reportDayLabel({ day: item.day, sentAt: item.report.sentAt }, today, lang, t)
      : '';
  const value = tileValueStyle(tile.value);
  const label = [
    `${name}: ${tile.value}`,
    tile.sub,
    when,
    showBadge && tile.status ? statusWord(tile.status, lang) : null,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <li
      data-tile={item.slot.id}
      data-report-id={item.report.messageId}
      data-report-kind={item.kind}
      className={cn('shadow-[inset_-1px_-1px_0_var(--color-border)]', item.slot.wide && 'col-span-full')}
    >
      <button
        type="button"
        onClick={() => onOpen(item.report)}
        aria-label={label}
        className={cn(
          'flex h-full w-full flex-col px-3.5 pb-3.5 pt-3 text-left transition-colors duration-150 active:bg-surface-2',
          item.slot.wide ? 'min-h-[112px]' : 'min-h-[136px]',
        )}
      >
        {/* The report's own signature in miniature, in its family ink, beside its name. */}
        <span className="flex items-center gap-2">
          <span className="flex h-6 shrink-0 items-center" style={{ color: familyVar(item.kind, '-ink') }} aria-hidden>
            <Glyph size={20} />
          </span>
          <span className="min-w-0 break-words text-meta font-medium text-text-muted">{name}</span>
        </span>
        <span
          data-tile-value
          className={cn(
            'mt-2 font-semibold tabular-nums tracking-[-0.015em] text-text [overflow-wrap:normal]',
            value.size,
            value.figure ? 'leading-tight' : 'leading-normal',
            value.unbroken && 'whitespace-nowrap',
          )}
        >
          {tile.value}
        </span>
        {tile.sub ? (
          <span className="mt-1 break-words text-meta text-text-muted">{tile.sub}</span>
        ) : null}
        {when ? (
          <span data-tile-day className="mt-0.5 text-meta font-medium text-text-muted">
            {when}
          </span>
        ) : null}
        {showBadge && tile.status ? (
          <span className="mt-auto pt-2">
            <StatusBadge status={tile.status} lang={lang} />
          </span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * A dashed stand-in for a number that will come once setup is done. Nothing in it can be
 * read as a figure, a warning or a button.
 */
export function GhostTile({ slot }: { slot: TileSlotSpec }) {
  const lang = useLang();
  const t = useT();
  const kind: ReportKind = slot.kinds[0] ?? 'dsr_sales';
  const style = kindStyle(kind);
  const { Icon } = style;
  return (
    <li
      data-ghost-tile={slot.id}
      className={cn('flex min-h-[112px] flex-col gap-1.5 bg-surface px-3.5 py-3 text-text-muted shadow-[inset_-1px_-1px_0_var(--color-border)]', slot.wide && 'col-span-full')}
    >
      <span className="flex items-center gap-2" aria-hidden>
        <Icon width={18} strokeWidth={1.75} />
      </span>
      <span className="break-words text-meta font-medium text-text">{sayWords(style.names, lang)}</span>
      <span className="flex items-center gap-1.5 text-body">
        <CircleDashed className="size-4 shrink-0" aria-hidden />
        {t('today.pump.notReady')}
      </span>
    </li>
  );
}
