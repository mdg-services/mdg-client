import * as React from 'react';

import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import { compareDealerCodes, dealerCodeLabel } from '@dk/shared';
import type { OutletChoice } from '@dk/shared/types';

import { useOutlets, useSwitchOutlet } from './useOutlets';

/**
 * The sheet the pump chip (chat list) and Settings → "Switch pump" open: the
 * person's pumps by code, the one they are in marked, one tap on another to move
 * there. The first tap does it — there is nothing to confirm, because the logins
 * share one password and going back is the same one tap.
 *
 * `onSwitched` is for tests; the app reloads into the other pump.
 */
export function OutletSheet({
  onClose,
  onSwitched,
}: {
  onClose: () => void;
  onSwitched?: () => void;
}) {
  const t = useT();
  const q = useOutlets();
  const panelRef = useDialog(onClose);
  const [opening, setOpening] = React.useState<OutletChoice | null>(null);
  const switchOutlet = useSwitchOutlet(onSwitched);

  const current = q.data?.current ?? null;
  const pumps = React.useMemo(
    () =>
      current
        ? [current, ...(q.data?.outlets ?? [])].sort((a, b) => compareDealerCodes(a.code, b.code))
        : [],
    [current, q.data?.outlets],
  );

  const go = (pump: OutletChoice) => {
    if (switchOutlet.isPending || pump.userId === current?.userId) return;
    setOpening(pump);
    switchOutlet.mutate(pump.userId);
  };

  const failed = switchOutlet.error;
  const failedKey =
    failed instanceof ApiError && failed.code === 'OUTLET_UNAVAILABLE'
      ? 'outlets.unavailable'
      : 'outlets.failed';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('outlets.title')}
        tabIndex={-1}
        className="relative mx-auto flex w-full max-w-md flex-col rounded-t-2xl bg-wa-bar pb-2 shadow-lg outline-none safe-bottom animate-in"
      >
        <p className="px-6 pb-2 pt-5 text-[17px] font-medium text-wa-bar-text">
          {t('outlets.title')}
        </p>
        {q.isLoading ? (
          <p className="px-6 py-4 text-[15px] text-wa-meta">{t('outlets.loading')}</p>
        ) : q.isError ? (
          <p role="alert" className="px-6 py-4 text-[15px] text-danger">
            {t('outlets.failed')}
          </p>
        ) : (
          <div role="radiogroup" aria-label={t('outlets.title')}>
            {pumps.map((pump) => {
              const here = pump.userId === current?.userId;
              const busy = opening?.userId === pump.userId && switchOutlet.isPending;
              return (
                <button
                  key={pump.userId}
                  type="button"
                  role="radio"
                  aria-checked={here}
                  disabled={switchOutlet.isPending && !busy}
                  onClick={() => go(pump)}
                  className="flex min-h-[56px] w-full items-center gap-4 px-6 text-left text-[16px] text-wa-bar-text active:bg-wa-row-active disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      here ? 'border-wa-accent' : 'border-wa-bar-icon',
                    )}
                  >
                    {here ? <span className="h-2.5 w-2.5 rounded-full bg-wa-accent" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{dealerCodeLabel(pump.code)}</span>
                    {here || busy ? (
                      <span className="block truncate text-[14px] text-wa-meta">
                        {busy
                          ? t('outlets.opening', { code: dealerCodeLabel(pump.code) })
                          : t('outlets.here')}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {switchOutlet.isError ? (
          <p role="alert" className="px-6 pb-3 pt-1 text-[14px] text-danger">
            {t(failedKey)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
