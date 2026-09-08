import { ChevronRight, Clock3, FileCheck2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { pick, useLang, useT } from '@/lib/i18n';
// `dealerProfileDateLabel` lives in `shared/dealer/profile` and is only on the
// package ROOT — `@dk/shared/types` does not re-export it.
import { dealerProfileDateLabel } from '@dk/shared';
import { documentPeriodLabel, type DealerDocumentAskRow } from '@dk/shared/types';

import { validityTone, type ValidityTone } from './documentRules';
import { ValidityChip } from './ValidityChip';

/**
 * One paper MDG holds, as the dealer reads it.
 *
 * THE CARD ANSWERS THREE QUESTIONS AND STOPS: what is it, how long is it good
 * for, and can I see it. A dealer opens this list for one of two reasons —
 * an inspector is standing in front of them and they need the licence on the
 * screen, or they have been told something is running out and want to know
 * what. Anything else on the card is in the way of both.
 *
 * IT IS TWO TAP TARGETS, NOT ONE, AND NOT A BUTTON INSIDE A BUTTON. The body
 * opens the paper. The strip underneath — drawn only when a renewal is actually
 * open and actually the dealer's move — goes to the job. `RecordCard` makes the
 * whole card one button because it has exactly one thing to do; this one has
 * two, and nesting them would be invalid markup that a screen reader reads as
 * one control.
 *
 * WHERE THE DATE COMES FROM, AND WHY IT IS ALLOWED ON THIS SCREEN AT ALL.
 * Everywhere else in this feature a raw `2026-09-02` reaching a dealer is the
 * bug the whole `documentPeriodLabel` rule exists to prevent. A filing cabinet
 * is the exception, because "when does my licence run out" cannot be answered
 * by "8 days left" alone — the dealer standing in front of an inspector needs
 * the day. So the day is printed, through `dealerProfileDateLabel`, WHICH
 * CARRIES THE YEAR. Never `documentPeriodLabel`, which deliberately omits it: a
 * licence good until 31 December 2027 shown as "31 Dec" reads as this year to
 * anybody, and one that lapsed on 31 August 2026 shown as "31 Aug" reads as
 * though it had not lapsed.
 */
export interface OnFileCardProps {
  row: DealerDocumentAskRow;
  /** The IST day the labels are formatted against — the server's, not the phone's. */
  today: string;
  /** Fetch a fresh signed URL and open the paper. Presigns at tap time. */
  onOpen: (row: DealerDocumentAskRow) => void | Promise<void>;
  /**
   * The renewal MDG has already asked for, when there is still a job in it.
   * Absent means draw no strip — see `renewalPointer` for the three cases where
   * a `renewedByAskId` is set and the dealer still has nothing to do.
   */
  renewal?: DealerDocumentAskRow;
  /** Take the dealer to that renewal request, higher up this same screen. */
  onRenewal?: (row: DealerDocumentAskRow) => void;
}

export function OnFileCard({ row, today, onOpen, renewal, onRenewal }: OnFileCardProps) {
  const t = useT();
  const lang = useLang();
  const [busy, setBusy] = React.useState(false);

  const title = pick(lang, row.titleEn, row.titleHi);
  // A register page on file is one of hundreds and is told apart only by its
  // period; a fire NOC has no period at all and prints nothing here. The two
  // lines below are therefore both optional and neither replaces the other.
  const period = documentPeriodLabel(row.periodKind, row.periodKey, lang, today);
  const tone = validityTone(row.validityState);

  const validity =
    row.validUntil && tone !== 'none'
      ? t(tone === 'gone' ? 'documents.wasValidUntil' : 'documents.validUntil', {
          day: dealerProfileDateLabel(row.validUntil, lang),
        })
      : '';

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onOpen(row);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border bg-surface shadow-sm',
        tone === 'gone'
          ? 'border-danger/40'
          : tone === 'soon'
            ? 'border-warning/40'
            : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => void open()}
        className="flex min-h-[44px] w-full items-start gap-3 p-4 text-left active:bg-surface-2"
      >
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            TILE[tone],
          )}
          aria-hidden
        >
          <FileCheck2 width={20} strokeWidth={1.75} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-text">
              {title}
            </span>
            <ValidityChip row={row} />
          </span>

          {/* What MDG asked for, in the admin's own words. A freeform kind is
              "A document MDG asked for" without it, which tells a dealer
              looking for one paper among forty precisely nothing. */}
          {row.label ? (
            <span className="mt-1 block truncate text-sm font-medium text-text">
              {row.label}
            </span>
          ) : null}
          {period ? (
            <span className="mt-0.5 block truncate text-xs text-text-muted">{period}</span>
          ) : null}
          {validity ? (
            <span
              className={cn(
                'mt-0.5 block truncate text-xs',
                tone === 'gone' ? 'font-medium text-danger' : 'text-text-muted',
              )}
            >
              {validity}
            </span>
          ) : null}

          <span className="mt-1 block text-xs font-medium text-brand">
            {busy ? t('common.loading') : t('records.tapToView')}
          </span>
        </span>
      </button>

      {/* The job, not just the news. A red badge and a request for the same
          certificate sitting forty rows apart on one screen leaves the dealer
          to work out that they are one thing; this is the line that says so and
          takes them there. */}
      {renewal && onRenewal ? (
        <button
          type="button"
          onClick={() => onRenewal(renewal)}
          className="flex min-h-[44px] w-full items-center gap-2 border-t border-border bg-warning-soft px-4 py-2.5 text-left active:bg-warning-soft/70"
        >
          <Clock3
            width={16}
            strokeWidth={2}
            className="shrink-0 text-warning-strong"
            aria-hidden
          />
          <span className="min-w-0 flex-1 text-xs font-medium text-warning-strong">
            {t('documents.renewalOpen')}
          </span>
          <ChevronRight
            width={16}
            strokeWidth={2}
            className="shrink-0 text-warning-strong"
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}

/**
 * The icon tile, which carries the same verdict as the badge.
 *
 * `AskCard`'s `TILE` map in one more shade, and the shades are its: an undated
 * paper and one still in force look identical, because "in force" is the
 * unremarkable case and nineteen coloured tiles hide the two that are not.
 */
const TILE: Record<ValidityTone, string> = {
  gone: 'bg-danger-soft text-danger',
  soon: 'bg-warning-soft text-warning-strong',
  fine: 'bg-surface-2 text-text-muted',
  none: 'bg-surface-2 text-text-muted',
};
