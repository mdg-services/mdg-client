import * as React from 'react';

import { Button, Card, CardContent } from '@/components/ui';
import { hasOtherOutlets, reloadInto, useOutlets, useSwitchOutlet } from '@/features/outlets/useOutlets';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { compareDealerCodes, dealerCodeLabel } from '@dk/shared';
import type { OutletChoice } from '@dk/shared/types';

/**
 * "Which pump?" after a sign-in that answered with more than one (`AuthLoginResponse.outlets`, spec
 * 4.9). An owner with two pumps used to land in whichever login the server picked, and could fill the
 * setup of the wrong one. The session is already open for that pump; this asks which to enter.
 *
 * Every pump is a 56px button by its code: the one signed in to opens at once, another switches
 * (`useSwitchOutlet`: a fresh token for that pump, then a full load into `destination`, so nothing of
 * the first pump is still on screen). If the list cannot be had, "Carry on" opens the pump already in.
 */
export function WhichPump({
  destination,
  onStay,
}: {
  /** The address to open inside the app (`/` unless a link was being followed). */
  destination: string;
  /** Open the pump already signed in to. */
  onStay: () => void;
}) {
  const t = useT();
  const q = useOutlets();
  const switchOutlet = useSwitchOutlet(() => reloadInto(destination));
  const [opening, setOpening] = React.useState<string | null>(null);

  const pumps = React.useMemo<OutletChoice[]>(() => {
    const view = q.data;
    return hasOtherOutlets(view)
      ? [view.current, ...view.outlets].sort((a, b) => compareDealerCodes(a.code, b.code))
      : [];
  }, [q.data]);
  const currentId = q.data?.current?.userId ?? null;

  const open = (pump: OutletChoice) => {
    if (switchOutlet.isPending) return;
    if (pump.userId === currentId) {
      onStay();
      return;
    }
    setOpening(pump.userId);
    switchOutlet.mutate(pump.userId);
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm" data-testid="which-pump">
        <h1 className="text-title text-text">{t('first.pump.title')}</h1>
        <p className="mt-2 text-body text-text-muted">{t('first.pump.intro')}</p>
        <Card className="mt-5">
          <CardContent>
            {q.isLoading ? (
              <p role="status" className="text-body text-text-muted">
                {t('first.pump.loading')}
              </p>
            ) : pumps.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p role="alert" className="text-body text-text">
                  {t('first.pump.failed')}
                </p>
                <Button size="lg" fullWidth onClick={onStay}>
                  {t('first.pump.carryOn')}
                </Button>
              </div>
            ) : (
              <div role="group" aria-label={t('first.pump.title')} className="flex flex-col gap-2">
                {pumps.map((pump) => {
                  const here = pump.userId === currentId;
                  const busy = opening === pump.userId && switchOutlet.isPending;
                  const label = dealerCodeLabel(pump.code);
                  return (
                    <button
                      key={pump.userId}
                      type="button"
                      disabled={switchOutlet.isPending && !busy}
                      aria-busy={busy || undefined}
                      onClick={() => open(pump)}
                      className={cn(
                        'flex min-h-14 w-full flex-col items-start justify-center rounded-lg border px-4 py-2 text-left shadow-sm',
                        'active:bg-surface-2 disabled:opacity-50',
                        here ? 'border-brand bg-brand-soft' : 'border-border bg-surface',
                      )}
                    >
                      <span className="break-words text-subheading text-text">
                        {t('first.pump.open', { code: label })}
                      </span>
                      <span className="break-words text-meta text-text-muted">
                        {busy ? t('outlets.opening', { code: label }) : here ? t('first.pump.current') : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {switchOutlet.isError ? (
              <p role="alert" className="mt-3 text-meta text-danger">
                {t('outlets.failed')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
