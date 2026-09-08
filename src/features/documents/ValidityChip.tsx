import { cn } from '@/lib/cn';
import { useLang } from '@/lib/i18n';
import { documentValidityLabel, type DealerDocumentAskRow } from '@dk/shared/types';

import { validityTone, type ValidityTone } from './documentRules';

/**
 * How long this paper has left, in four words and one colour.
 *
 * ONE SPELLING OF THE PILL, USED IN BOTH PLACES. The shape is `AskCard`'s
 * "Late" badge to the pixel — `rounded-full px-2 py-0.5 text-[11px]
 * font-medium` — because there was already a status pill in this feature and a
 * second, slightly different one is how a screen starts looking like two
 * screens. `AskCard` and the cabinet row both render THIS, so the badge on a
 * certificate cannot come to mean one thing in the to-do list and another six
 * rows down.
 *
 * THE SERVER DECIDES THE NUMBER; THIS PHONE ONLY DECIDES THE WORDS.
 * `daysToExpiry` and `validityState` are computed server-side against the
 * server's IST day and ride in on the row — the phone's clock is never allowed
 * to decide whether a certificate has lapsed. What is deliberately NOT used is
 * `row.validityLabel`, even though the server sends that too, already formatted
 * and correct: it was formatted in the language stored on the ACCOUNT, and the
 * dealer may have flipped the toggle on this device since. It is the same trap
 * `row.periodLabel` sets and `AskCard` documents, and the same way out —
 * re-format on the phone, from the server's number, with the shared formatter
 * the push notification also uses.
 *
 * COLOUR IS NOT THE ONLY CARRIER. Every state says its own sentence ("8 days
 * left", "Expires today", "Expired 2 days ago"), so a dealer who cannot tell
 * the red from the amber on a washed-out screen in daylight still reads the
 * fact. Red on this pill is `danger` under white (4.83:1) and amber is
 * `warning-strong` under white (7.09:1) — the DEFAULT amber is 2.15:1 and may
 * never carry white text here.
 */
export function ValidityChip({
  row,
  className,
}: {
  row: Pick<DealerDocumentAskRow, 'validityState' | 'daysToExpiry'>;
  className?: string;
}) {
  const lang = useLang();
  const tone = validityTone(row.validityState);
  const days = row.daysToExpiry;

  // No verdict, or no count to say it with. A paper that simply does not expire
  // gets no badge — "valid until —" is an invitation to hunt for a date that
  // was never printed on the thing.
  if (tone === 'none' || typeof days !== 'number') return null;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        CHIP[tone],
        className,
      )}
    >
      {documentValidityLabel(days, lang)}
    </span>
  );
}

const CHIP: Record<ValidityTone, string> = {
  gone: 'bg-danger text-white',
  soon: 'bg-warning-strong text-white',
  // Quiet on purpose: nineteen green badges make the two that matter harder to
  // find, not easier.
  fine: 'bg-surface-2 text-text-muted',
  none: '',
};
