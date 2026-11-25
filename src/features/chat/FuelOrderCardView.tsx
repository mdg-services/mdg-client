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
 *
 * A PLAIN CARD (ADR 0055). It used to sit under a coloured strip with a truck
 * and "MDG" on it, which made a message from the team look like a broadcast. Now
 * the title is a bold first line, and the sender's name is the bubble's own.
 */
export function FuelOrderCardView({ card, lang }: { card: FuelOrderCard; lang: Lang }) {
  return (
    <div data-testid="fuel-order-card" data-kind={card.kind}>
      <p data-testid="fuel-order-card-title" className="break-words text-subheading leading-snug">
        {sayIn(card.title, lang)}
      </p>
      <div className="pb-0.5 pt-1.5">
        {card.hero ? (
          <>
            <p className="text-meta leading-tight text-wa-meta">{sayIn(card.heroLabel, lang)}</p>
            <p
              data-testid="fuel-order-card-hero"
              className="select-all break-all font-mono text-title leading-snug tracking-wide"
            >
              {card.hero}
            </p>
          </>
        ) : null}
        <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body leading-snug', card.hero && 'mt-2')}>
          {card.rows.map((row, i) => (
            <div key={i} className="contents">
              <dt className="text-wa-meta">{sayIn(row.label, lang)}</dt>
              <dd className={cn('break-words text-right', row.strong && 'font-bold')}>{sayIn(row.value, lang)}</dd>
            </div>
          ))}
        </dl>
        {card.note ? <p className="mt-1.5 text-meta leading-snug text-wa-meta">{sayIn(card.note, lang)}</p> : null}
      </div>
    </div>
  );
}
