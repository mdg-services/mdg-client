import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Num } from '@/components/kit';
import { Card } from '@/components/ui';
import { dayLabel } from '@/features/payments/billView';
import { money } from '@/features/payments/paymentView';
import { useLang, useT } from '@/lib/i18n';
import type { DealerAutopay } from '@dk/shared/types';

import { AutopayChip } from './AutopayChip';
import { autopaySubtitle } from './autopayView';

/**
 * The autopay row on the Bill and plan page (spec 4.8): the state as a shape and a word, the
 * amount, the next day it is taken, and, while it is failing, the day it was last tried. The whole
 * row is one link to the Autopay screen, which can stop it (one screen, one confirm) and which
 * never starts it: inside the Android app autopay is only shown and stopped.
 *
 * The page hands it the owner's autopay (`useOwnerAutopay`) and draws it when there is one, when the
 * server said there is none (`none`: the title and "Not on at this pump"), or when the read failed
 * (`autopay` null): then it is just the title and "could not load, tap to open". Every one leads to
 * the Autopay screen, which has its own Try again. Absent while loading and for a manager: the bills
 * never wait on it.
 */
export function AutopayCard({
  autopay,
  lastTryDay,
  none = false,
}: {
  autopay: DealerAutopay | null;
  /** The server answered that there is no autopay ("Not on at this pump"), as against a read that failed. */
  none?: boolean;
  /** `YYYY-MM-DD` of the last failed debit, when the page knows one. */
  lastTryDay?: string | null;
}) {
  const t = useT();
  const lang = useLang();
  const link = 'flex min-h-14 items-center gap-2 rounded-xl p-4 active:bg-surface-2';

  if (!autopay) {
    return (
      <Card>
        <Link to="/settings/autopay" className={link}>
          <div className="min-w-0 flex-1">
            <p className="break-words text-heading text-text">{t('autopay.title')}</p>
            <p className="mt-1 break-words text-body text-text-muted">
              {t(none ? 'bill.autopay.none' : 'autopay.sub.unknown')}
            </p>
          </div>
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <Link to="/settings/autopay" className={link}>
        <div className="min-w-0 flex-1">
          <p className="break-words text-heading text-text">{t('autopay.title')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Num className="text-title text-text">{money(lang, autopay.amountPaise)}</Num>
            <AutopayChip state={autopay.state} />
          </div>
          <p className="mt-1 break-words text-body text-text-muted">
            {autopaySubtitle(t, lang, autopay)}
          </p>
          {autopay.state === 'failing' && lastTryDay ? (
            <p className="break-words text-body text-text-muted">
              {t('bill.autopay.lastTry', { date: dayLabel(lang, lastTryDay) })}
            </p>
          ) : null}
        </div>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
      </Link>
    </Card>
  );
}
