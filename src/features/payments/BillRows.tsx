import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyCalm, Num, SectionCard } from '@/components/kit';
import { useLang, useT } from '@/lib/i18n';
import type { DealerPayment } from '@dk/shared/types';

import type { BillYear } from './billView';
import { BILL_LIST_CAP, billName } from './billView';
import { PayButton } from './PayButton';
import { PaymentStatusChip } from './PaymentStatusChip';
import {
  dueNote,
  formatDay,
  hasReceipt,
  isWaitingForApproval,
  methodLabel,
  money,
  showsPayButton,
} from './paymentView';

/**
 * One bill as a row of the table: its name (which says its month, in the reader's language), the
 * amount in a column of its own on the right so the figures line up down the list, the status shape
 * and word under the name, and the one line that matters (when it is due, or when it was paid and
 * by what). Three columns do not fit a 360 px phone at 16 px text, so the status sits under the month.
 *
 * `interactive` is `canPayHere()`, decided once by the page. When it is false (the Android app) a
 * bill that is still open is plain text: no link to its page, no Pay button, nothing that leads
 * anywhere (ADR 0022 section 1). A bill that WAS paid opens its receipt and GST papers in the app
 * too: that page is a record of money already paid, with no way to pay (sections 9 and 11).
 */
export function BillRow({
  payment,
  interactive,
  payInBanner = false,
}: {
  payment: DealerPayment;
  interactive: boolean;
  /** The page's top banner already carries this bill's Pay button: the row does not repeat it. */
  payInBanner?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const method = methodLabel(t, payment.method);
  const due = dueNote(t, lang, payment);
  const opensPage = interactive || hasReceipt(payment.status);

  const content = (
    <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1">
      {/* The name keeps at least 10rem: when the text is large and 10rem fills the line, the amount
          drops under the name instead of squeezing it into a column one letter wide. */}
      <p className="min-w-0 flex-1 basis-40 break-words text-body font-medium text-text">
        {billName(t, lang, payment)}
      </p>
      <Num className="ml-auto text-right text-subheading text-text">
        {money(lang, payment.amountPaise)}
      </Num>
      <div className="basis-full">
        <PaymentStatusChip payment={payment} />
      </div>
      <div className="flex basis-full flex-col gap-0.5 empty:hidden">
        {due ? <p className="break-words text-body text-text">{due}</p> : null}
        {isWaitingForApproval(payment) ? (
          <p className="break-words text-body text-text">{t('payments.waitingForApproval')}</p>
        ) : null}
        {payment.status === 'processing' ? (
          <p className="break-words text-body text-text">{t('payments.confirmingNote')}</p>
        ) : null}
        {hasReceipt(payment.status) && payment.paidAt ? (
          <p className="break-words text-meta text-text-muted">
            {method
              ? t('payments.paidOnVia', { date: formatDay(lang, payment.paidAt), method })
              : t('payments.paidOn', { date: formatDay(lang, payment.paidAt) })}
          </p>
        ) : null}
        {payment.refundedPaise > 0 ? (
          <p className="break-words text-meta text-text-muted">
            {t('payments.refundedAmount', { amount: money(lang, payment.refundedPaise) })}
          </p>
        ) : null}
        {hasReceipt(payment.status) ? (
          <p className="break-words text-meta text-text-muted">
            {t('payments.receiptNo', { number: payment.number })}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <li className="py-1">
      {opensPage ? (
        <Link
          to={`/payments/${payment.id}`}
          className="flex min-h-14 items-center gap-2 rounded-lg py-2 active:bg-surface-2"
        >
          {content}
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-text-subtle" />
        </Link>
      ) : (
        <div className="min-h-14 py-2">{content}</div>
      )}
      {/* No Pay on a bill autopay is about to take, or one waiting on its autopay approval:
          paying it too would be paying twice. */}
      {interactive && !payInBanner && showsPayButton(payment) ? (
        <PayButton payment={payment} className="pb-2" />
      ) : null}
    </li>
  );
}

/**
 * The bills, grouped by year, newest year first, with what is still open on top of each year. A
 * light table: hairline between rows, no boxes. Says so when the list is as long as the server
 * sends, because then older bills may be missing.
 */
export function BillsCard({
  years,
  interactive,
  capped,
  bannerPaymentId = null,
}: {
  years: BillYear[];
  interactive: boolean;
  capped: boolean;
  /** The bill whose Pay button sits in the top banner, so its row leaves it out. */
  bannerPaymentId?: string | null;
}) {
  const t = useT();
  return (
    <SectionCard title={t('bill.bills.title')}>
      {years.length === 0 ? (
        <EmptyCalm text={t('bill.bills.empty')} />
      ) : (
        <div className="flex flex-col gap-3">
          {years.map((y) => (
            <div key={y.year}>
              <h3 className="text-subheading text-text-muted">{y.year}</h3>
              <ul className="divide-y divide-border">
                {y.items.map((p) => (
                  <BillRow
                    key={p.id}
                    payment={p}
                    interactive={interactive}
                    payInBanner={p.id === bannerPaymentId}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {capped ? (
        <p className="mt-3 break-words text-meta text-text-muted">
          {t('bill.bills.capped', { n: BILL_LIST_CAP })}
        </p>
      ) : null}
    </SectionCard>
  );
}
