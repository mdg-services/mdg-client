import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { formatPaise } from '@dk/shared';
import type { DealerPayment } from '@dk/shared/types';

import { loadCheckoutScript } from './checkout';
import { canStartPayment } from './paymentView';
import { isBusy, usePay } from './usePay';

/**
 * The Pay button of one payment, and everything that can come after a tap on it:
 * the wait, the confirmation, the "still being confirmed" note, the failure.
 *
 * ONLY EVER MOUNTED WHERE `canPayHere()` IS TRUE. The pages decide that — never
 * this component — so that in the Android app this file's output is not merely
 * hidden but absent from the page (ADR 0022 §1).
 *
 * It is mounted for a payment that is `due` OR `processing`, and draws the
 * button only for `due`. The `processing` case is what keeps a tap's follow-up
 * alive: the moment the pop-up reports success the server can flip the row to
 * `processing`, and if this component unmounted then, the wait for "paid" would
 * stop with it and the screen would never learn the payment landed.
 *
 * Razorpay's script is fetched as soon as a Pay button is on screen, so the
 * pop-up opens the moment it is tapped. That is the only time anything from
 * Razorpay is loaded: a page with nothing to pay never asks for it.
 */
export function PayButton({
  payment,
  className,
}: {
  payment: DealerPayment;
  /** Spacing for the box this draws; nothing is drawn (and no space taken) when it draws nothing. */
  className?: string;
}) {
  const t = useT();
  const { phase, pay } = usePay(payment.id);
  const payable = canStartPayment(payment);

  React.useEffect(() => {
    // A failed warm-up is not an error yet: the tap tries again and reports.
    if (payable) loadCheckoutScript().catch(() => undefined);
  }, [payable]);

  const wrap = (node: React.ReactNode) => <div className={className}>{node}</div>;

  if (phase.name === 'done') {
    return wrap(
      <p
        role="status"
        className="rounded-lg bg-success-soft p-3 text-base font-medium text-emerald-800"
      >
        {t('payments.paidNow')}
      </p>,
    );
  }

  if (phase.name === 'slow') {
    // A `processing` row already says this itself, in the same words.
    if (!payable) return null;
    return wrap(
      <p role="status" className="rounded-lg bg-warning-soft p-3 text-base text-warning-strong">
        {t('payments.confirmingNote')}
      </p>,
    );
  }

  if (phase.name === 'confirming' || phase.name === 'checking') {
    return wrap(
      <p role="status" className="flex items-center gap-2 py-2 text-base text-text-muted">
        <Loader2 width={18} height={18} strokeWidth={1.75} className="animate-spin" aria-hidden />
        {t(phase.name === 'confirming' ? 'payments.confirming' : 'payments.checking')}
      </p>,
    );
  }

  if (!payable) return null;

  return wrap(
    <div className="flex flex-col gap-2">
      {phase.name === 'failed' ? (
        <p role="alert" className="text-base text-danger">
          {t(phase.key, phase.vars)}
        </p>
      ) : null}
      <Button size="lg" fullWidth loading={isBusy(phase)} onClick={() => void pay()}>
        {isBusy(phase)
          ? t('payments.opening')
          : t('payments.pay', { amount: formatPaise(payment.amountPaise) })}
      </Button>
    </div>,
  );
}
