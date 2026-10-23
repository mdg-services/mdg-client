import { AlertCircle, SearchX, Wallet } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { SubPage } from '@/components/SubPage';
import { Button, Card, CardContent, Spinner } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useLang, useT } from '@/lib/i18n';
import { formatPaise } from '@dk/shared';

import { usePayment } from './api';
import { isNotConfigured } from './errors';
import { PayButton } from './PayButton';
import { PaymentStatusChip } from './PaymentStatusChip';
import { formatDueDate, hasReceipt } from './paymentView';
import { canPayHere } from './policy';
import { Receipt } from './Receipt';
import { StateBlock } from './StateBlock';

/**
 * One payment: the amount, what it is for, where it stands, and — once it has
 * been paid — the receipt (ADR 0022 §9). Reached at `/payments/:id`.
 *
 * The Pay button is here only where `canPayHere()` — see PaymentsPage for why.
 * The receipt is not payment-steering and is shown everywhere this page opens,
 * including the Android app (a link that was already out there can open it).
 */
export function PaymentDetailPage() {
  const t = useT();
  const lang = useLang();
  const { id } = useParams<{ id: string }>();
  const query = usePayment(id);
  const payment = query.data;

  let body;
  if (query.isLoading) {
    body = (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size={20} />
      </div>
    );
  } else if (!payment) {
    if (isNotConfigured(query.error)) {
      body = (
        <StateBlock
          icon={<Wallet width={28} strokeWidth={1.5} />}
          title={t('payments.notConfiguredTitle')}
          description={t('payments.notConfiguredDesc')}
        />
      );
    } else if (query.error instanceof ApiError && query.error.status === 404) {
      body = (
        <StateBlock
          icon={<SearchX width={28} strokeWidth={1.5} />}
          title={t('payments.notFoundTitle')}
          description={t('payments.notFoundDesc')}
        />
      );
    } else {
      body = (
        <StateBlock
          icon={<AlertCircle width={28} strokeWidth={1.5} />}
          title={t('payments.errorTitle')}
          description={t('common.helpDesc')}
          action={
            <Button variant="secondary" size="lg" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      );
    }
  } else {
    const isOpen = payment.status === 'due' || payment.status === 'processing';
    body = (
      <>
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <h2 className="break-words text-xl font-semibold text-text">{payment.title}</h2>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-4xl font-bold tabular-nums text-text">
                {formatPaise(payment.amountPaise)}
              </p>
              <PaymentStatusChip status={payment.status} />
            </div>
            {payment.note ? (
              <p className="whitespace-pre-line break-words text-base text-text-muted">
                {payment.note}
              </p>
            ) : null}
            {isOpen && payment.dueDate ? (
              <p className="text-base text-text-muted">
                {t('payments.dueBy', { date: formatDueDate(lang, payment.dueDate) })}
              </p>
            ) : null}
            {payment.status === 'processing' ? (
              <p
                role="status"
                className="rounded-lg bg-warning-soft p-3 text-base text-warning-strong"
              >
                {t('payments.confirmingNote')}
              </p>
            ) : null}
            {payment.status === 'due' && payment.lastFailure ? (
              <p className="rounded-lg bg-surface-2 p-3 text-base text-text">
                {t('payments.lastFailure', { reason: payment.lastFailure.reason })}
              </p>
            ) : null}
            {canPayHere() && isOpen ? <PayButton payment={payment} /> : null}
          </CardContent>
        </Card>
        {hasReceipt(payment.status) ? <Receipt payment={payment} /> : null}
      </>
    );
  }

  return (
    <SubPage title={t('payments.detailTitle')} fallback="/payments" className="gap-4 pb-10">
      {body}
    </SubPage>
  );
}
