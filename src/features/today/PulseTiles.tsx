import type { ReactNode } from 'react';

import { Num, ProgressBar, StatTile, StatusPill, type Status, type StatTileProps } from '@/components/kit';
import type { PulseSlot } from '@/features/glance/glanceModel';
import { kavachRoleOf, readerCountsOf } from '@/features/kavach/kavachView';
import { STATUS_STYLE } from '@/features/reports/StatusBadge';
import { sayWords } from '@/features/reports/types';
import { cn } from '@/lib/cn';
import { fmtDay, fmtInt, fmtLitres, fmtMoney, fmtTime, fmtWeekday, indiaDay, weekdayLetter } from '@/lib/fmt';
import { useLang, useT, type TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { KavachDealerView } from '@dk/shared/types';

import { usableData } from './todayView';

/**
 * The four numbers of Today (spec 4.1), in their fixed places, each one tap to the page that holds the
 * whole story. The words and figures are the glance model's (`pulseOf`): this file only draws them, in
 * the kit's tile. A slot with no source is not in the list, so the grid closes up.
 *
 * Every tile says how old its figure is in words ("today 7:05 am", "from yesterday"), never only a
 * tiny mark, and names its status in its spoken label, never only in colour.
 */

export interface PulseTilesProps {
  slots: PulseSlot[];
  isOwner: boolean;
  now: Date;
  onOpen: (slot: PulseSlot) => void;
  /** The Kavach view, for the score tile's counts: the SAME ones the Kavach page's score card shows. */
  kavach?: KavachDealerView | null;
}

/** A moment far in the past, so `fmtDay` writes the date in full ("Thu 26 Nov") instead of "yesterday". */
const LONG_AGO = new Date(0);

// `items-start`: a tile keeps the height of its own words, so a short tile is not stretched to a tall neighbour's.
const GRID = 'grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] items-start gap-2';

/** "today 7:05 am" for a figure sent today, "from yesterday" / "from Tue 24 Nov" for an older one. */
function asOfWords(slot: PulseSlot, lang: Lang, now: Date, t: TFunction): string | undefined {
  const at = slot.report?.sentAt;
  if (!at) return undefined;
  const sent = indiaDay(new Date(at));
  if (sent === indiaDay(now)) return t('today.tile.asOfToday', { time: fmtTime(at, lang) });
  return t('today.tile.asOfDay', { day: fmtDay(sent, lang, now) });
}

const statusWordOf = (status: Status, lang: Lang): string => sayWords(STATUS_STYLE[status].word, lang);

/** The spoken label: the words of the tile, then its status as a word when it is not fine. */
function spoken(parts: Array<string | undefined>, status: Status | undefined, lang: Lang): string {
  const words = parts.filter((p): p is string => !!p && p.trim() !== '');
  if (status && status !== 'ok') words.push(statusWordOf(status, lang));
  return words.join('. ');
}

function salesTile(slot: PulseSlot, lang: Lang, now: Date, t: TFunction): Omit<StatTileProps, 'onPress'> {
  const litres = slot.value ?? 0;
  const label = t('today.tile.sales');
  const day = slot.day ? fmtDay(slot.day, lang, now) : undefined;
  const caption = day ? t('today.tile.salesDay', { day }) : undefined;
  const asOf = asOfWords(slot, lang, now, t);
  let delta: StatTileProps['delta'];
  if (slot.deltaPct !== null && slot.deltaPct !== undefined && slot.day) {
    const dir = slot.deltaPct > 0 ? 'up' : slot.deltaPct < 0 ? 'down' : 'same';
    delta = {
      dir,
      n: Math.abs(slot.deltaPct),
      unit: '%',
      against: t('today.tile.lastWeekday', { weekday: fmtWeekday(slot.day, lang) }),
    };
  }
  let bars: StatTileProps['bars'];
  if (slot.bars && slot.bars.length > 0) {
    const top = slot.bars.reduce((a, b) => (b.litres > a.litres ? b : a));
    const today = indiaDay(now);
    const at = slot.bars.findIndex((b) => b.day === today);
    bars = {
      data: slot.bars.map((b) => ({ label: weekdayLetter(b.day, lang), value: b.litres })),
      ...(at >= 0 ? { todayIndex: at } : {}),
      summary: t('today.tile.barsSummary', {
        n: slot.bars.length,
        litres: fmtLitres(top.litres, lang),
        // The date in full, never "yesterday": "highest 24,100 L on yesterday" does not read.
        day: fmtDay(top.day, lang, LONG_AGO),
      }),
    };
  }
  return {
    label,
    value: <Num value={litres} />,
    unit: t('kit.unit.litres'),
    ...(delta ? { delta } : {}),
    ...(caption ? { caption } : {}),
    ...(bars ? { bars } : {}),
    ...(asOf ? { asOf } : {}),
    ariaLabel: spoken([label, fmtLitres(litres, lang), slot.lines[1], caption, asOf], undefined, lang),
  };
}

function variationTile(slot: PulseSlot, lang: Lang, now: Date, t: TFunction): Omit<StatTileProps, 'onPress'> {
  const label = t('today.tile.variation');
  const asOf = asOfWords(slot, lang, now, t);
  const rows = (slot.fuels ?? []).map((f) => {
    const beyond = f.beyondL > 0;
    return {
      label: f.fuel,
      value: beyond ? t('today.tile.varBeyond', { litres: fmtLitres(f.beyondL, lang) }) : t('today.tile.varInside'),
      // The warning is drawn only when the same fact is not already a row in Needs you (the model sets the slot's status).
      ...(beyond && slot.status !== 'ok' ? { status: slot.status as Status } : {}),
    };
  });
  return {
    label,
    value: '',
    rows,
    ...(asOf ? { asOf } : {}),
    ariaLabel: spoken([label, ...slot.lines, asOf], slot.status === 'info' ? undefined : (slot.status as Status), lang),
  };
}

function waterTile(slot: PulseSlot, isOwner: boolean, lang: Lang, now: Date, t: TFunction): Omit<StatTileProps, 'onPress'> {
  const label = t('today.tile.water');
  const data = slot.report ? usableData(slot.report, isOwner) : undefined;
  const total = data?.kind === 'water_ingress' ? data.totalSlots : undefined;
  const missed = data?.kind === 'water_ingress' ? data.missedSlots : 0;
  const asOf = asOfWords(slot, lang, now, t);
  const caption = missed > 0 ? t('glance.water.missed', { n: fmtInt(missed) }) : undefined;
  const status = slot.status === 'info' ? undefined : (slot.status as Status);
  return {
    label,
    value: <Num value={slot.value ?? 0} />,
    ...(total !== undefined ? { unit: t('today.tile.waterOf', { total: fmtInt(total) }) } : {}),
    ...(caption ? { caption } : {}),
    ...(status ? { status } : {}),
    ...(asOf ? { asOf } : {}),
    ariaLabel: spoken([label, slot.lines[0], caption, asOf], status, lang),
  };
}

/**
 * "6 to do today, 1 sent back": the signed-in reader's own count (never the outlet's, never the whole open
 * total), from `readerCountsOf`, the very function the Kavach page's score card reads, so the tile and the
 * page say the same numbers (an owner is not told about the manager's daily work).
 */
function scoreCaption(
  kavach: KavachDealerView | null | undefined,
  now: Date,
  t: TFunction,
  isOwner: boolean,
): string | undefined {
  if (!kavach?.on) return undefined;
  if (!Array.isArray(kavach.now)) {
    // No list to count today's jobs from: the server's total is said as a total ("N points open").
    const c = kavach.summary?.counts;
    if (!c) return undefined;
    const parts = [
      c.todo > 0 ? t('today.tile.scoreOpen', { n: fmtInt(c.todo) }) : null,
      c.sentBack > 0 ? t('today.tile.scoreBack', { n: fmtInt(c.sentBack) }) : null,
    ].filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
  try {
    const c = readerCountsOf(kavach, new Set(), now, [], kavachRoleOf(isOwner ? 'owner' : 'manager'));
    const parts = [
      c.todo > 0 ? t('today.tile.scoreTodo', { n: fmtInt(c.todo) }) : null,
      c.sentBack > 0 ? t('today.tile.scoreBack', { n: fmtInt(c.sentBack) }) : null,
      c.late > 0 ? t('today.tile.scoreLate', { n: fmtInt(c.late) }) : null,
    ].filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(', ') : t('today.tile.scoreNone');
  } catch {
    return undefined;
  }
}

function scoreTile(
  slot: PulseSlot,
  kavach: KavachDealerView | null | undefined,
  now: Date,
  lang: Lang,
  t: TFunction,
  isOwner: boolean,
): Omit<StatTileProps, 'onPress'> {
  const label = t('glance.tile.score');
  const caption = scoreCaption(kavach, now, t, isOwner);
  const pct = `${fmtInt(slot.value ?? 0)}%`;
  return {
    label,
    // "6%" in one run at the tile's big size, not a 6 with a tiny mark beside it.
    value: <Num>{pct}</Num>,
    ...(caption ? { caption } : {}),
    ariaLabel: spoken([label, pct, caption], undefined, lang),
  };
}

function papersTile(slot: PulseSlot, lang: Lang, now: Date, t: TFunction): Omit<StatTileProps, 'onPress'> {
  const label = t('today.tile.papers');
  const days = slot.value ?? 0;
  const expired = days < 0;
  const asOf = asOfWords(slot, lang, now, t);
  const status = slot.status === 'info' ? undefined : (slot.status as Status);
  return {
    label,
    value: expired ? t('today.tile.papersExpired') : <Num value={days} />,
    ...(expired ? {} : { unit: t('today.tile.papersDays') }),
    caption: slot.lines[0],
    ...(status ? { status } : {}),
    ...(asOf ? { asOf } : {}),
    ariaLabel: spoken([label, slot.lines[0], asOf], status, lang),
  };
}

/**
 * The deposit tile: what to put into the oil company's account and by when, with a bar for how much of
 * the credit limit is used. The kit's tile has no place for a bar, so this one wears the same look.
 * Money is shown here and on the bill screens only.
 */
function DepositTile({ slot, now, onPress }: { slot: PulseSlot; now: Date; onPress: () => void }) {
  const t = useT();
  const lang = useLang();
  const label = t('glance.tile.deposit');
  const amount = slot.value ?? 0;
  const status = slot.status === 'info' ? undefined : (slot.status as Status);
  const by = slot.day ? t('today.tile.depositBy', { day: fmtDay(slot.day, lang, now) }) : undefined;
  // lines: [the sentence, days left, limit used]: the sentence is the spoken label's, the others are drawn.
  const left = slot.lines[1];
  const credit = slot.report ? usableData(slot.report, true) : undefined;
  const limit = credit?.kind === 'credit_dod' && credit.limit.usedPct !== null ? Math.round(credit.limit.usedPct) : undefined;
  const asOf = asOfWords(slot, lang, now, t);
  const aria = spoken(
    [label, fmtMoney(Math.round(amount * 100), lang), by, left, limit === undefined ? undefined : t('glance.deposit.limit', { pct: fmtInt(limit) }), asOf],
    status,
    lang,
  );
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onPress}
      className="flex min-h-11 w-full flex-col items-stretch gap-1.5 rounded-xl border border-border bg-surface p-3 text-left shadow-sm active:bg-surface-2"
    >
      <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-meta font-medium text-text-muted">{label}</span>
        {status && status !== 'ok' ? <StatusPill status={status} /> : null}
      </span>
      <span className="break-words text-title text-text">
        <Num>{fmtMoney(Math.round(amount * 100), lang)}</Num>
      </span>
      {by ? <span className="break-words text-meta text-text">{by}</span> : null}
      {left ? <span className="break-words text-meta font-medium text-text">{left}</span> : null}
      {limit !== undefined ? (
        <ProgressBar value={limit} max={100} text={t('today.tile.limitBar', { pct: fmtInt(limit) })} />
      ) : null}
      {asOf ? <span className="break-words text-meta text-text-subtle">{asOf}</span> : null}
    </button>
  );
}

export function PulseTiles({ slots, isOwner, now, onOpen, kavach }: PulseTilesProps) {
  const t = useT();
  const lang = useLang();
  if (slots.length === 0) return null;
  return (
    <ul className={cn(GRID)} data-testid="today-tiles">
      {slots.map((slot) => {
        const press = () => onOpen(slot);
        let tile: ReactNode;
        switch (slot.id) {
          case 'sales':
            tile = <StatTile {...salesTile(slot, lang, now, t)} onPress={press} />;
            break;
          case 'variation':
            tile = <StatTile {...variationTile(slot, lang, now, t)} onPress={press} />;
            break;
          case 'deposit':
            tile = <DepositTile slot={slot} now={now} onPress={press} />;
            break;
          case 'water':
            tile = <StatTile {...waterTile(slot, isOwner, lang, now, t)} onPress={press} />;
            break;
          case 'score':
            tile = <StatTile {...scoreTile(slot, kavach, now, lang, t, isOwner)} onPress={press} />;
            break;
          default:
            tile = <StatTile {...papersTile(slot, lang, now, t)} onPress={press} />;
        }
        return (
          // `relative` and `min-w-0`: whatever a tile hides for a screen reader (the table behind the bars)
          // is placed against this box and cannot widen the page.
          <li key={slot.id} data-pulse={slot.id} className="relative flex min-w-0">
            {tile}
          </li>
        );
      })}
    </ul>
  );
}
