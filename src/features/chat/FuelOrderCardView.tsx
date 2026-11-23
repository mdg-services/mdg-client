import { Truck } from 'lucide-react';


import { cn } from '@/lib/cn';
import type { Lang } from '@/store/lang';
import { sayIn, type FuelOrderCard } from '@dk/shared/types';

/**
 * A tanker message drawn as a card (ADR 0041; owner, 23 Nov 2026: "this should
 * have been a card with the important details highlighted"). The tanker number
 * is the one thing a manager reads from across the forecourt, so it is large;
 * the order, each fuel's KL, the shipment time and the delivery day follow, one
 * per line. Every text arrives in each dealer language and is shown in the
 * reader's own. An app that predates the field draws the message's words, which
 * carry the same facts.
 */
export function FuelOrderCardView({ card, lang }: { card: FuelOrderCard; lang: Lang }) {
  const changed = card.kind === 'tanker_changed';
  return (
    <div data-testid="fuel-order-card">
      <div
        data-testid="fuel-order-card-strip"
        className={cn(
          'flex items-center gap-1.5 rounded-t-md px-[10px] py-[5px] text-[12px] font-bold tracking-wide',
          changed ? 'bg-amber-500 text-amber-950' : 'bg-emerald-600 text-white',
        )}
      >
        <Truck width={15} strokeWidth={2.4} className="shrink-0" aria-hidden />
        <span>{sayIn(card.title, lang)}</span>
        <span className="ml-auto opacity-90">MDG</span>
      </div>
      <div className="px-[10px] pb-0.5 pt-2">
        {card.hero ? (
          <>
            <p className="text-[12px] leading-tight text-wa-meta">{sayIn(card.heroLabel, lang)}</p>
            <p
              data-testid="fuel-order-card-hero"
              className="select-all break-all font-mono text-[22px] font-bold leading-snug tracking-wide"
            >
              {card.hero}
            </p>
          </>
        ) : null}
        <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px] leading-snug', card.hero && 'mt-2')}>
          {card.rows.map((row, i) => (
            <div key={i} className="contents">
              <dt className="text-wa-meta">{sayIn(row.label, lang)}</dt>
              <dd className={cn('break-words text-right', row.strong && 'font-bold')}>{sayIn(row.value, lang)}</dd>
            </div>
          ))}
        </dl>
        {card.note ? <p className="mt-1.5 text-[13px] leading-snug text-wa-meta">{sayIn(card.note, lang)}</p> : null}
      </div>
    </div>
  );
}
