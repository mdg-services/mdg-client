import { Check } from 'lucide-react';

import { useLang, useT } from '@/lib/i18n';
import type { OutletSetupView } from '@dk/shared/types';

import { Block, CardBox } from './CardParts';
import { formatDay, formatRupees } from './cardView';

/**
 * The bill, read-only: what is due and by when, then that it was paid.
 *
 * NO BUTTON, NO LINK, NO WAY TO PAY, NO WORDS ABOUT HOW. Google Play does not
 * allow an app to ask for payment or point to one (ADR 0022 §1). The bill itself
 * — with how to pay — goes to the dealer on WhatsApp; this card only shows the
 * amount, the due date and, afterwards, that the money arrived. Every state below
 * is words and numbers and nothing to press.
 */
export function PaymentCard({ view }: { view: OutletSetupView }) {
  const t = useT();
  const lang = useLang();
  const { state, amountPaise, dueOn, paidOn } = view.payment;

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
