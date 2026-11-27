import { AlertCircle, SearchX, Wallet } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Num, SectionCard, SkeletonBlock } from '@/components/kit';
import { SubPage } from '@/components/SubPage';
import { Button, Card, CardContent } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useLang, useT } from '@/lib/i18n';
import { formatPaise } from '@dk/shared';

import { usePayment } from './api';
import { billMonthLabel, billName, gstBreakdownOf } from './billView';
import { failureReasonKey, isNotConfigured, isTryAgainSoon } from './errors';
import { GstDocuments } from './GstDocuments';
import { PayButton } from './PayButton';
import { PaymentStatusChip } from './PaymentStatusChip';
import { dueNote, hasReceipt, isWaitingForApproval, showsPayButton } from './paymentView';
import { canPayHere } from './policy';
import { Receipt } from './Receipt';
import { StateBlock } from './StateBlock';

/** One line of the bill's make-up: what it is, and its figure on the right. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-3">
      <p className="min-w-0 break-words text-body text-text-muted">{label}</p>
      <Num className="text-body font-medium text-text">{value}</Num>
    </div>
  );
}

/**
 * One payment: the amount, what it is for, where it stands, and — once it has
 * been paid — the receipt (ADR 0022 §9). Reached at `/payments/:id`.
 *
 * The Pay button is here only where `canPayHere()` — see PaymentsPage for why.
 * The receipt is not payment-steering and is shown everywhere this page opens,
 * including the Android app (a link that was already out there can open it).
 * So are the GST invoice and credit notes under it, with their Download
 * buttons: a paper for something already paid is not a way to pay (§11).
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
      <Card className="p-4">
        <SkeletonBlock lines={5} />
      </Card>
    );
  } else if (!payment) {
    if (isNotConfigured(query.error)) {
      body = (
        <StateBlock
          icon={<Wallet width={28} strokeWidth={1.5} />}
          title={t('payments.notConfiguredTitle')}
          description={t('payments.notConfiguredDesc')}
          action={
            <Button variant="secondary" size="lg" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          }
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
          description={t(isTryAgainSoon(query.error) ? 'payments.err.provider' : 'common.helpDesc')}
          action={
            <Button variant="secondary" size="lg" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      );
    }
  } else {
    const due = dueNote(t, lang, payment);
    const reasonKey = failureReasonKey(payment.lastFailure?.reason);
    const month = billMonthLabel(lang, payment);
    const split = gstBreakdownOf(payment);
    const lastFailureText = reasonKey
      ? t('payments.lastFailure', { reason: t(reasonKey) })
      : t('payments.lastFailureGeneric');
    body = (
      <>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h2 className="break-words text-title text-text">{billName(t, lang, payment)}</h2>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <Num className="text-display text-text">{formatPaise(payment.amountPaise)}</Num>
              <PaymentStatusChip payment={payment} />
            </div>
            {payment.note ? (
              <p className="whitespace-pre-line break-words text-body text-text-muted">
                {payment.note}
              </p>
            ) : null}
            {due ? <p className="text-body text-text-muted">{due}</p> : null}
            {/* Read-only, so it is said in the app too: it names no link and no way to pay. */}
            {isWaitingForApproval(payment) ? (
              <p role="status" className="rounded-lg bg-surface-2 p-3 text-body text-text">
                {t('payments.waitingForApproval')}
              </p>
            ) : null}
            {payment.status === 'processing' ? (
              <p
                role="status"
                className="rounded-lg border border-status-waiting bg-status-waiting-soft p-3 text-body text-text"
              >
                {t('payments.confirmingNote')}
              </p>
            ) : null}
            {/* Only where paying is allowed: a failed try is about paying, and the
                Android app says nothing of it. Razorpay's own text is never shown,
                only our phrase for what it means. */}
            {canPayHere() && payment.status === 'due' && payment.lastFailure ? (
              <p className="rounded-lg bg-surface-2 p-3 text-body text-text">
                {lastFailureText}
              </p>
            ) : null}
            {/* No Pay on a bill autopay is about to take, or one waiting on its autopay
                approval: paying it too would be paying twice. */}
            {canPayHere() && showsPayButton(payment) ? <PayButton payment={payment} /> : null}
          </CardContent>
        </Card>
        {payment.status !== 'cancelled' ? (
          <SectionCard title={t('bill.detail.thisBill')} variant="list">
            {month ? <Line label={t('bill.detail.covers')} value={month} /> : null}
            <Line label={t('bill.detail.before')} value={formatPaise(split.beforePaise)} />
            <Line
              label={t('bill.detail.gst', { rate: split.ratePercent })}
              value={formatPaise(split.gstPaise)}
            />
          </SectionCard>
        ) : null}
        {hasReceipt(payment.status) ? (
          <>
            <Receipt payment={payment} />
            <GstDocuments payment={payment} />
          </>
        ) : payment.status !== 'cancelled' ? (
          // A bill not yet paid has no receipt or invoice: say where they will be rather than leave a bare page.
          <p className="break-words px-1 text-body text-text-muted">{t('bill.detail.afterPaid')}</p>
        ) : null}
      </>
    );
  }

  return (
    <SubPage title={t('bill.detail.title')} fallback="/payments" className="gap-3 pb-10">
      {body}
    </SubPage>
  );
}
