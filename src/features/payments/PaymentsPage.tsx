import { AlertCircle, Wallet } from 'lucide-react';

import { SubPage } from '@/components/SubPage';
import { Button } from '@/components/ui';
import { useOwnerAutopay } from '@/features/autopay/api';
import { AutopayCard } from '@/features/autopay/AutopayCard';
import { useT } from '@/lib/i18n';

import { usePaymentsList } from './api';
import { isNotConfigured } from './errors';
import { PaymentCard } from './PaymentCard';
import { splitPayments } from './paymentView';
import { canPayHere } from './policy';
import { StateBlock } from './StateBlock';

/** Two grey blocks the shape of the cards, while the list comes down the wire. */
function ListSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t('common.loading')}</span>
      {[0, 1].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-2" aria-hidden />
      ))}
    </div>
  );
}

/**
 * Payments — what MDG has asked this pump to pay, and what it has paid
 * (ADR 0022 §9). Reached at `/payments`; there is no menu entry yet, the owner
 * will say where it goes.
 *
 * WHAT THIS SCREEN MAY SAY DEPENDS ON WHERE IT IS RUNNING. In a browser, a due
 * payment has a Pay button and every card opens its own page. Inside the Android
 * app (`canPayHere()` false) it is the same two lists, read-only: no Pay button,
 * no link to a payment that is still open, and no sentence about paying somewhere
 * else — Google Play's Payments policy treats each of those as steering a user
 * away from Play Billing. A payment that was made still opens its receipt.
 */
export function PaymentsPage() {
  const t = useT();
  const query = usePaymentsList();
  // After the bills' own query, so the list is the first thing asked for.
  const autopay = useOwnerAutopay();
  const interactive = canPayHere();

  let body;
  if (query.isLoading) {
    body = <ListSkeleton />;
  } else if (isNotConfigured(query.error)) {
    body = (
      <StateBlock
        icon={<Wallet width={28} strokeWidth={1.5} />}
        title={t('payments.notConfiguredTitle')}
        description={t('payments.notConfiguredDesc')}
      />
    );
  } else if (query.isError || !query.data) {
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
  } else if (query.data.items.length === 0) {
    body = (
      <StateBlock
        icon={<Wallet width={28} strokeWidth={1.5} />}
        title={t('payments.emptyTitle')}
        description={t('payments.emptyDesc')}
      />
    );
  } else {
    const { due, history } = splitPayments(query.data.items);
    body = (
      <>
        <section aria-labelledby="payments-due" className="flex flex-col gap-3">
          <h2 id="payments-due" className="text-lg font-semibold text-text">
            {t('payments.sectionDue')}
          </h2>
          {due.length === 0 ? (
            <p className="text-base text-text-muted">{t('payments.nothingDue')}</p>
          ) : (
            due.map((p) => <PaymentCard key={p.id} payment={p} interactive={interactive} />)
          )}
        </section>
        {history.length > 0 ? (
          <section aria-labelledby="payments-history" className="flex flex-col gap-3">
            <h2 id="payments-history" className="text-lg font-semibold text-text">
              {t('payments.sectionHistory')}
            </h2>
            {history.map((p) => (
              <PaymentCard key={p.id} payment={p} interactive={interactive} />
            ))}
          </section>
        ) : null}
      </>
    );
  }

  return (
    <SubPage title={t('payments.title')} fallback="/chat" className="gap-6 pb-10">
      {/* The owner's autopay, above the bills, when there is one. Its own query: a
          slow or failed answer only leaves the card out, the list never waits. */}
      {autopay ? <AutopayCard autopay={autopay} /> : null}
      {body}
    </SubPage>
  );
}
