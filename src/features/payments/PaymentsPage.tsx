import { AlertCircle, Wallet } from 'lucide-react';

import { SkeletonBlock } from '@/components/kit';
import { SubPage } from '@/components/SubPage';
import { Button, Card } from '@/components/ui';
import { useOwnerAutopay } from '@/features/autopay/api';
import { AutopayCard } from '@/features/autopay/AutopayCard';
import { useOutletSetup } from '@/features/setup/useOutletSetup';
import { isEmbedded } from '@/lib/embedMode';
import { useLang, useT } from '@/lib/i18n';

import { usePaymentsList } from './api';
import { BilledToCard, NeedsMeCard, PapersCard, PlanCard, YearCard } from './BillCards';
import { BillsCard } from './BillRows';
import {
  groupByYear,
  isListCapped,
  lastFailedDay,
  mostUrgent,
  needsMe,
  papersOf,
  planOf,
  yearSummary,
} from './billView';
import { isNotConfigured, isTryAgainSoon } from './errors';
import { showsPayButton } from './paymentView';
import { canPayHere } from './policy';
import { StateBlock } from './StateBlock';
import { useCoveredServices } from './useCoveredServices';

/**
 * Bill and plan — what MDG charges this pump, whether it is paid, and whether the services are safe
 * (spec 4.8, ADR 0022 section 9). Reached at `/payments`. Top to bottom: what needs me (one sentence,
 * a shape and a word), the plan and its price, autopay, this year, the bills, the papers, and who
 * the bills are made out to.
 *
 * WHAT THIS SCREEN MAY SAY DEPENDS ON WHERE IT IS RUNNING. In a browser, a due bill has a Pay button
 * and every row opens its own page. Inside the Android app (`canPayHere()` false) it is the same
 * page, read-only: no Pay button, no link to a bill that is still open, and no sentence about paying
 * somewhere else. Google Play's Payments policy treats each of those as steering a user away from
 * Play Billing. A bill that was paid still opens its receipt.
 *
 * Every extra read (the owner's autopay, the setup view, the services list) may fail or be absent
 * on an older server; its section is then simply left out, and the bills never wait on any of them.
 */
export function PaymentsPage() {
  const t = useT();
  const lang = useLang();
  const query = usePaymentsList();
  // After the bills' own query, so the list is the first thing asked for.
  const { autopay, failed: autopayFailed, loaded: autopayLoaded } = useOwnerAutopay();
  const setup = useOutletSetup().data;
  const services = useCoveredServices();
  const interactive = canPayHere();

  let body;
  if (query.isLoading) {
    body = (
      <Card className="p-4">
        <SkeletonBlock lines={6} />
      </Card>
    );
  } else if (isNotConfigured(query.error)) {
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
  } else if (query.isError || !query.data) {
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
  } else {
    const items = query.data.items;
    const plan = planOf(items, autopay);
    const papers = papersOf(items);
    const billing = setup?.billing ?? null;
    // Only a browser, and only for a bill that can be paid: the one Pay button sits in the banner.
    const urgent = interactive ? mostUrgent(items) : null;
    const bannerPayment = urgent && showsPayButton(urgent) ? urgent : null;
    body = (
      <>
        <NeedsMeCard
          needs={needsMe({ t, lang, payments: items, autopay, setup })}
          payment={bannerPayment}
        />
        {plan ? <PlanCard plan={plan} services={services} /> : null}
        {/* The owner's autopay: the row is always there once the server has answered, "Not on at this
            pump" included, so the Autopay screen is not a hidden address. Its own query: the list
            never waits on it, and a failed answer still leaves a row that opens the Autopay screen,
            which has its own Try again. A manager has none (no request is made for one). */}
        {autopay || autopayFailed || autopayLoaded ? (
          <AutopayCard
            autopay={autopay}
            none={!autopay && autopayLoaded}
            lastTryDay={lastFailedDay(items)}
          />
        ) : null}
        {items.length > 0 ? (
          <YearCard summary={yearSummary(items)} showGst={!!billing?.gstin} />
        ) : null}
        <BillsCard
          years={groupByYear(items)}
          interactive={interactive}
          capped={isListCapped(items)}
          bannerPaymentId={bannerPayment?.id ?? null}
        />
        <PapersCard papers={papers} interactive={interactive} />
        {setup ? <BilledToCard billing={billing} /> : null}
      </>
    );
  }

  return (
    // Opened cold (a payment notification) there is nothing behind it: home is Today, and the
    // extension's panel, which has no Today, goes back to its chat.
    <SubPage title={t('bill.title')} fallback={isEmbedded() ? '/chat' : '/'} className="gap-3 pb-10">
      {body}
    </SubPage>
  );
}
