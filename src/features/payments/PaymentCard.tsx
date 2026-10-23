import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { formatPaise } from '@dk/shared';
import type { DealerPayment } from '@dk/shared/types';

import { PayButton } from './PayButton';
import { PaymentStatusChip } from './PaymentStatusChip';
import { formatDay, formatDueDate, hasReceipt, methodLabel } from './paymentView';

/**
 * One payment on the list.
 *
 * `interactive` is `canPayHere()`, decided once by the page. When it is false —
 * the Android app — the card is plain text: no link to the payment's own page,
 * no Pay button, nothing that leads anywhere (ADR 0022 §1). Everything the
 * dealer needs to read stays on the card itself: what, how much, by when, and for
 * a payment that was made, when, how, and the receipt number.
 */
export function PaymentCard({
  payment,
  interactive,
}: {
  payment: DealerPayment;
  interactive: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const isOpen = payment.status === 'due' || payment.status === 'processing';
  const method = methodLabel(t, payment.method);

  const summary = (
    <div className="min-w-0 flex-1">
      <p className="break-words text-lg font-semibold text-text">{payment.title}</p>
      {/* The chip sits by the amount, not the title: a title is long, a chip is
          wide, and side by side they left the title three lines tall. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-3xl font-bold tabular-nums text-text">
          {formatPaise(payment.amountPaise)}
        </p>
        <PaymentStatusChip status={payment.status} />
      </div>
      <div className="mt-1 flex flex-col gap-0.5 text-base text-text-muted">
        {isOpen && payment.dueDate ? (
          <p>{t('payments.dueBy', { date: formatDueDate(lang, payment.dueDate) })}</p>
        ) : null}
        {payment.status === 'processing' ? <p>{t('payments.confirmingNote')}</p> : null}
        {hasReceipt(payment.status) && payment.paidAt ? (
          <p>
            {method
              ? t('payments.paidOnVia', { date: formatDay(lang, payment.paidAt), method })
              : t('payments.paidOn', { date: formatDay(lang, payment.paidAt) })}
          </p>
        ) : null}
        {payment.refundedPaise > 0 ? (
          <p>{t('payments.refundedAmount', { amount: formatPaise(payment.refundedPaise) })}</p>
        ) : null}
        {hasReceipt(payment.status) ? (
          <p>{t('payments.receiptNo', { number: payment.number })}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <Card>
      {interactive ? (
        <Link
          to={`/payments/${payment.id}`}
          className="flex items-center gap-2 rounded-2xl p-4 active:bg-surface-2"
        >
          {summary}
          <ChevronRight width={20} height={20} className="shrink-0 text-text-subtle" aria-hidden />
        </Link>
      ) : (
        <div className="p-4">{summary}</div>
      )}
      {interactive && isOpen ? <PayButton payment={payment} className="px-4 pb-4" /> : null}
    </Card>
  );
}
