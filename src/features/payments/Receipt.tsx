import { Card, CardContent } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { formatPaise } from '@dk/shared';
import type { DealerPayment } from '@dk/shared/types';

import { formatDateTimeIst, methodLabel } from './paymentView';

/** Who the money went to, and the name the dealer knows it by. Names, so the same in both languages. */
const COMPANY = 'VRUOOM PRIVATE LIMITED';
const BRAND = 'MDG Services';
export const RECEIPT_FOOTER = `${COMPANY} · ${BRAND}`;

function Line({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-base text-text-muted">{label}</dt>
      <dd
        className={
          wrap ? 'break-all text-base font-medium text-text' : 'text-base font-medium text-text'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The receipt of a payment that reached us: what a dealer shows an accountant
 * or quotes to a bank. Every line is something the server returned — the number
 * is ours, the Reference is Razorpay's payment id, the time is shown in Indian
 * time whatever the phone's own clock says.
 *
 * Lines the server has no value for (a method not yet reported) are left out,
 * not shown as dashes.
 */
export function Receipt({ payment }: { payment: DealerPayment }) {
  const t = useT();
  const lang = useLang();
  const method = methodLabel(t, payment.method);

  return (
    <Card role="region" aria-labelledby="payment-receipt-title">
      <CardContent className="p-5">
        <h2 id="payment-receipt-title" className="text-lg font-semibold text-text">
          {t('payments.receipt.title')}
        </h2>
        <dl className="mt-1 divide-y divide-border">
          <Line label={t('payments.receipt.number')} value={payment.number} />
          <Line label={t('payments.receipt.amount')} value={formatPaise(payment.amountPaise)} />
          {payment.paidAt ? (
            <Line
              label={t('payments.receipt.paidAt')}
              value={`${formatDateTimeIst(lang, payment.paidAt)} IST`}
            />
          ) : null}
          {method ? <Line label={t('payments.receipt.method')} value={method} /> : null}
          {payment.razorpayPaymentId ? (
            <Line label={t('payments.receipt.reference')} value={payment.razorpayPaymentId} wrap />
          ) : null}
          {payment.refundedPaise > 0 ? (
            <Line
              label={t('payments.receipt.refunded')}
              value={formatPaise(payment.refundedPaise)}
            />
          ) : null}
        </dl>
        {/* Each name stays whole: on a narrow phone the line breaks between the
            two, never inside the company's name. */}
        <p className="mt-3 border-t border-border pt-3 text-base text-text-muted">
          <span className="whitespace-nowrap">{COMPANY}</span> ·{' '}
          <span className="whitespace-nowrap">{BRAND}</span>
        </p>
      </CardContent>
    </Card>
  );
}
