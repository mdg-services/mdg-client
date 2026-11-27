import * as React from 'react';

import { ErrorCard } from '@/components/kit/ErrorCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { Button, Card } from '@/components/ui';
import { OutletSheet } from '@/features/outlets/OutletSheet';
import { hasOtherOutlets, useOutlets } from '@/features/outlets/useOutlets';
import { useT } from '@/lib/i18n';
import { dealerCodeLabel } from '@dk/shared';

import { oilCompanyLabel, pumpIdentity } from './pumpModel';
import { useMyOutlet } from './usePumpData';

/**
 * The top card of My pump: the pump's name, its oil company and SAP code, and for a person with more
 * than one pump the code of the pump they are in and a "Switch pump" button (one tap, a full reload,
 * the native shell told: all in `OutletSheet`). The three lines come from the outlet file BY KEY, so a
 * line the file does not have is simply not drawn; nothing assumes a fixed field. The oil company is
 * said in the reader's language ("इंडियन ऑयल"); a company the app has no name for is shown as typed.
 */
export function PumpIdentityCard() {
  const t = useT();
  const outlet = useMyOutlet();
  const outlets = useOutlets();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const closeSheet = React.useCallback(() => setSheetOpen(false), []);

  const view = outlets.data;
  const code = hasOtherOutlets(view) ? dealerCodeLabel(view.current.code) : null;
  const multi = code !== null;
  const id = pumpIdentity(outlet.data);
  const loading = outlet.isPending && outlet.fetchStatus !== 'paused';
  const failed = !outlet.data && !loading;

  return (
    <>
      <Card className="flex flex-col gap-3 p-4">
        {loading ? <SkeletonBlock lines={2} /> : null}
        {failed ? <ErrorCard text={t('pump.identity.failed')} onRetry={() => void outlet.refetch()} /> : null}
        {outlet.data ? (
          <div className="flex flex-col gap-1">
            <h2 className="break-words text-title text-text">{id.name ?? t('pump.identity.unnamed')}</h2>
            {id.oilCompany ? <p className="break-words text-body text-text-muted">{oilCompanyLabel(id.oilCompany, t)}</p> : null}
            {id.sapCode ? (
              <p className="break-words text-body text-text-muted">{t('pump.identity.sap', { code: id.sapCode })}</p>
            ) : null}
          </div>
        ) : null}
        {code ? <p className="break-words text-body font-medium text-text">{t('pump.identity.code', { code })}</p> : null}
        {multi ? (
          <Button variant="secondary" onClick={() => setSheetOpen(true)} className="self-start">
            {t('outlets.switchRow')}
          </Button>
        ) : null}
      </Card>
      {sheetOpen ? <OutletSheet onClose={closeSheet} /> : null}
    </>
  );
}
