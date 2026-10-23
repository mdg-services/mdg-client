import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLang, useT } from '@/lib/i18n';
import type { OutletSetupView } from '@dk/shared/types';

import { Block, CardBox } from './CardParts';
import { formatDay, formatRupees, isPastDue, istToday } from './cardView';

/**
 * The bill, read-only: what is due and by when, then that it was paid.
 *
 * NO BUTTON, NO WAY TO PAY, NO WORDS ABOUT HOW. Google Play does not allow an app
 * to ask for payment or point to one (ADR 0022 §1). The bill itself — with how to
 * pay — goes to the dealer on WhatsApp and Razorpay's SMS; this card only shows the
 * amount, the due date, that the day has passed when it has, and, afterwards, that
 * the money arrived.
 *
 * THE ONE LINK is on a PAID bill: "View receipt" opens that payment's read-only
 * receipt page (`/payments/:id`), a paper for something already paid, which has no
 * way to pay on it (ADR 0022 §9, §11). A bill that is not paid has no link at all.
 */
export function PaymentCard({ view }: { view: OutletSetupView }) {
  const t = useT();
  const lang = useLang();
  const { state, amountPaise, dueOn, paidOn, paymentId } = view.payment;

  if (state === 'paid') {
    const on = formatDay(paidOn, lang);
    return (
      <CardBox kind="payment">
        <Block>
          <p className="flex items-center gap-1.5 text-[14px] font-medium leading-snug">
            <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
            {t('setup.payPaid')}
          </p>
          {on ? <p className="text-[13px] leading-snug text-wa-meta">{t('setup.payPaidOn', { date: on })}</p> : null}
          {paymentId ? (
            <Link
              to={`/payments/${paymentId}`}
              className="mt-1 inline-block text-[14px] font-medium text-wa-bubble-text underline decoration-wa-meta underline-offset-2"
            >
              {t('setup.viewReceipt')}
            </Link>
          ) : null}
        </Block>
      </CardBox>
    );
  }

  if (state === 'sent' && amountPaise !== null) {
    const due = formatDay(dueOn, lang);
    return (
      <CardBox kind="payment">
        <Block>
          <p className="text-[14px] font-medium leading-snug">
            {due
              ? t('setup.billLine', { amount: formatRupees(amountPaise), date: due })
              : t('setup.billLineNoDate', { amount: formatRupees(amountPaise) })}
          </p>
          {/* A fact about the bill, not a nudge: the day has gone by. */}
          {isPastDue(dueOn, istToday()) ? (
            <p className="text-[13px] font-medium leading-snug text-danger">{t('setup.billOverdue')}</p>
          ) : null}
        </Block>
      </CardBox>
    );
  }

  // Not sent yet: it is MDG's team that has the next move.
  return (
    <CardBox kind="payment">
      <Block>
        <p className="text-[14px] leading-snug">{t('setup.payPreparing')}</p>
      </Block>
    </CardBox>
  );
}
