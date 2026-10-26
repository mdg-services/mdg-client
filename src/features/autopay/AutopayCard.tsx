import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { formatPaise } from '@dk/shared';
import type { DealerAutopay } from '@dk/shared/types';

import { AutopayChip } from './AutopayChip';
import { autopaySubtitle } from './autopayView';

/**
 * Autopay at the top of the Payments page, laid out like a payment's card: a
 * title, the amount with a state chip, one line under it, and a chevron.
 *
 * The page hands it the owner's autopay (`useOwnerAutopay`) and draws it only
 * when there is one, or when the read failed (`autopay` null): then it is just
 * the title and "could not load, tap to open", leading to the Autopay screen,
 * which has its own Try again. Absent while loading, when there is none and for
 * a manager — the list below never waits on it. It opens the Autopay screen.
 */
export function AutopayCard({ autopay }: { autopay: DealerAutopay | null }) {
  const t = useT();
  const lang = useLang();

  if (!autopay) {
    return (
      <Card>
        <Link
          to="/settings/autopay"
          className="flex items-center gap-2 rounded-2xl p-4 active:bg-surface-2"
        >
          <div className="min-w-0 flex-1">
            <p className="break-words text-lg font-semibold text-text">{t('autopay.title')}</p>
            <p className="mt-1 text-base text-text-muted">{t('autopay.sub.unknown')}</p>
          </div>
          <ChevronRight width={20} height={20} className="shrink-0 text-text-subtle" aria-hidden />
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <Link
        to="/settings/autopay"
        className="flex items-center gap-2 rounded-2xl p-4 active:bg-surface-2"
      >
        <div className="min-w-0 flex-1">
          <p className="break-words text-lg font-semibold text-text">{t('autopay.title')}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-3xl font-bold tabular-nums text-text">
              {formatPaise(autopay.amountPaise)}
            </p>
            <AutopayChip state={autopay.state} />
          </div>
          <p className="mt-1 text-base text-text-muted">{autopaySubtitle(t, lang, autopay)}</p>
        </div>
        <ChevronRight width={20} height={20} className="shrink-0 text-text-subtle" aria-hidden />
      </Link>
    </Card>
  );
}
