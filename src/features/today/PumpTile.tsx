import { CircleDashed } from 'lucide-react';

import { kindStyle } from '@/features/reports/kindStyle';
import { StatusBadge, statusWord } from '@/features/reports/StatusBadge';
import { getKindView } from '@/features/reports/registry';
import { sayWords, type KindTile, type TileRow } from '@/features/reports/types';
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

/** Most small facts a tile shows under its figures; the report has the rest. */
export const TILE_LINES_MAX = 3;

/**
 * The small facts of a tile, one per line. A kind that sets `lines` decides them; any other kind's
 * `sub` is cut at its " · " joints, so a fact never has to share a line with the next one.
 */
export function tileLines(tile: KindTile): string[] {
  const raw = tile.lines ?? (tile.sub ? tile.sub.split(' · ') : []);
  return raw.map((x) => x.trim()).filter(Boolean).slice(0, TILE_LINES_MAX);
}

/** A tile with two or more rows is a ledger: it needs the full width, so a fuel and its figure share a line. */
export function tileIsWide(item: Pick<TileItem, 'slot' | 'tile'>): boolean {
  return !!item.slot.wide || (item.tile.rows?.length ?? 0) > 1;
}

/**
 * One tile of "Your pump today", three bands top to bottom: who it is (the report's icon and name),
 * what it says (one big figure, or a ledger of one row per fuel), and the small facts, one per
 * line. A badge closes the tile only when the report is not fine, always as a shape and a word.
 * The whole tile is one target that opens the report.
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
  const lines = tileLines(tile);
  const rows = tile.rows ?? [];
  const wide = tileIsWide(item);
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
      className={cn('shadow-[inset_-1px_-1px_0_var(--color-border)]', wide && 'col-span-full')}
    >
      <button
        type="button"
        onClick={() => onOpen(item.report)}
        aria-label={label}
        className={cn(
          'flex h-full w-full flex-col px-3.5 pb-3.5 pt-3 text-left transition-colors duration-150 active:bg-surface-2',
          wide ? 'min-h-[112px]' : 'min-h-[136px]',
        )}
      >
        {/* Who it is: the report's own signature in miniature, in its family ink, beside its name. */}
        <span className="flex items-center gap-2">
          <span className="flex h-6 shrink-0 items-center" style={{ color: familyVar(item.kind, '-ink') }} aria-hidden>
            <Glyph size={20} />
          </span>
          <span className="min-w-0 break-words text-meta font-medium text-text-muted">{name}</span>
        </span>
        {/* What it says. */}
        {rows.length > 1 ? (
          <TileLedger rows={rows} />
        ) : rows.length === 1 ? (
          <TileFigure row={rows[0]!} />
        ) : (
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
        )}
        {/* The small facts, one to a line. */}
        {lines.length > 0 || when ? (
          <span data-tile-lines className="mt-2 flex flex-col gap-0.5">
            {lines.map((line) => (
              <span key={line} className="break-words text-meta text-text-muted">
                {line}
              </span>
            ))}
            {when ? (
              <span data-tile-day className="text-meta font-medium text-text-muted">
                {when}
              </span>
            ) : null}
          </span>
        ) : null}
        {showBadge && tile.status ? (
          <span className="mt-auto pt-2.5">
            <StatusBadge status={tile.status} lang={lang} />
          </span>
        ) : null}
      </button>
    </li>
  );
}

/**
 * A ledger of figures: the name on the left, the number on the right, a hairline between rows, so
 * the eye runs down one column of numbers. Spans only, because a button may hold nothing else.
 */
function TileLedger({ rows }: { rows: TileRow[] }) {
  return (
    <span data-tile-rows className="mt-1.5 flex flex-col divide-y divide-border">
      {rows.map((row) => (
        <span key={row.label} data-tile-row className="flex items-baseline gap-2 py-1.5 first:pt-0.5">
          <span className="min-w-0 flex-1 break-words text-body text-text">
            {row.label}
            {row.hint ? <span className="ms-1.5 text-meta text-text-muted">{row.hint}</span> : null}
          </span>
          <span
            data-tile-row-value
            className={cn(
              'shrink-0 whitespace-nowrap tabular-nums',
              row.quiet ? 'text-meta text-text-muted' : 'text-subheading text-text',
            )}
          >
            {row.value}
          </span>
        </span>
      ))}
    </span>
  );
}

/** One figure with its name small above it: "Diesel · over" over "+908 L". */
function TileFigure({ row }: { row: TileRow }) {
  const value = tileValueStyle(row.value);
  return (
    <span data-tile-rows className="mt-2 flex flex-col">
      <span className="break-words text-meta text-text-muted">
        {row.label}
        {row.hint ? ` · ${row.hint}` : ''}
      </span>
      <span
        data-tile-value
        className={cn(
          'font-semibold tabular-nums leading-tight tracking-[-0.015em] text-text [overflow-wrap:normal]',
          value.size,
          value.unbroken && 'whitespace-nowrap',
        )}
      >
        {row.value}
      </span>
    </span>
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
