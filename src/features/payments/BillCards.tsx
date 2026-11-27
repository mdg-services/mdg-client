import { ChevronDown, Download } from 'lucide-react';

import { Num, ProgressBar, SectionCard, VerdictCard } from '@/components/kit';
import { Button } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { tnIn } from '@/lib/messages/_plural';
import { GST_STATES, GST_STATE_NAMES_HI } from '@dk/shared';
import type { DealerPayment, GstDocumentSummary, SetupBilling } from '@dk/shared/types';

import type { NeedsMe, Paper, Plan, YearSummary } from './billView';
import { PayButton } from './PayButton';
import { formatDay, money, nb } from './paymentView';
import { useGstDownload } from './useGstDownload';

/**
 * The cards of the Bill and plan page that are not the list of bills (spec 4.8). Each is one
 * question, in the order the owner asks them: what needs me, what do I pay, how is this year, which
 * papers, who are the bills made out to. Every number arrives already worked out by `billView.ts`.
 */

/**
 * "What needs me": one word, one shape, one sentence. Plain text in the phone app. In a browser, a
 * bill that can be paid carries its one Pay button inside the card, right under the sentence, so the
 * owner who reads "Bill due" does not have to scroll to find what to do (it was off the first two
 * screens at 200% text). `payment` is that bill, handed over only where paying is allowed.
 */
export function NeedsMeCard({ needs, payment }: { needs: NeedsMe; payment?: DealerPayment | null }) {
  return (
    <VerdictCard status={needs.status} word={needs.word} sentence={needs.text} compact={false}>
      {payment ? <PayButton payment={payment} /> : null}
    </VerdictCard>
  );
}

/** The services a plan covers: a count that opens to a plain list, so 17 names are not one paragraph. */
function CoveredServices({ names }: { names: string[] }) {
  const lang = useLang();
  return (
    <details className="group rounded-lg border border-border" open={names.length <= 3}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-body font-medium text-text [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words">{tnIn(lang, 'bill.plan.covers', names.length)}</span>
        <ChevronDown
          aria-hidden
          className="h-5 w-5 shrink-0 text-text-subtle transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="list-disc space-y-1 border-t border-border py-3 pl-8 pr-3 text-body text-text">
        {names.map((n) => (
          <li key={n} className="break-words">
            {n}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The price of a month, worked out from the data, and the services it covers. The price is two
 * lines by design (the amount, then the sum behind it) so that at 200% text "GST" never sits alone.
 */
export function PlanCard({ plan, services }: { plan: Plan; services: string[] | null }) {
  const t = useT();
  const lang = useLang();
  return (
    <SectionCard title={t('bill.plan.title')}>
      <div className="flex flex-col gap-2">
        <div>
          <p className="break-words text-heading text-text">
            {t('bill.plan.perMonth', { total: money(lang, plan.totalPaise) })}
          </p>
          <p className="break-words text-heading text-text">
            {t('bill.plan.sum', {
              base: money(lang, plan.basePaise),
              tax: nb(`${plan.ratePercent}% GST`),
            })}
          </p>
        </div>
        {services ? <CoveredServices names={services} /> : null}
        {plan.fromBill ? (
          <p className="break-words text-meta text-text-muted">{t('bill.plan.fromBill')}</p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function Figure({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="flex min-h-14 flex-col justify-center gap-0.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="min-w-0 break-words text-body text-text">{label}</p>
        <Num className="text-heading text-text">{value}</Num>
      </div>
      {meta ? <p className="break-words text-meta text-text-muted">{meta}</p> : null}
    </div>
  );
}

/**
 * This financial year (April to March): how many bills were paid and for how much, whether they
 * were on time (said in words first, with a bar only when some were and some were not), and, only
 * when the bills carry a GST number, the GST on the invoices. Worded "GST on your invoices", never
 * "you can claim": that is tax advice, and the accountant's to give.
 */
export function YearCard({ summary, showGst }: { summary: YearSummary; showGst: boolean }) {
  const t = useT();
  const lang = useLang();
  const range = t('bill.year.range', { from: summary.from, to: summary.to });
  const { onTime, withDueDay } = summary;
  return (
    <SectionCard title={t('bill.year.title')} variant="list">
      {summary.paidCount === 0 && summary.paidPaise === 0 ? (
        <p className="py-3 text-body text-text-muted">{t('bill.year.none')}</p>
      ) : (
        <Figure
          label={tnIn(lang, 'bill.year.paidBills', summary.paidCount)}
          value={money(lang, summary.paidPaise)}
          meta={range}
        />
      )}
      {withDueDay > 0 ? (
        <div className="py-3">
          {onTime === 0 || onTime === withDueDay ? (
            // All or none: one plain sentence. A bar at zero or full says nothing the words do not.
            <p className="break-words text-body text-text">
              {tnIn(lang, onTime === 0 ? 'bill.year.noneOnTime' : 'bill.year.allOnTime', withDueDay)}
            </p>
          ) : (
            <ProgressBar
              value={onTime}
              max={withDueDay}
              text={tnIn(lang, 'bill.year.onTime', withDueDay, { ok: onTime })}
            />
          )}
        </div>
      ) : null}
      {showGst && summary.invoiceCount > 0 ? (
        <Figure
          label={t('bill.year.gst')}
          value={money(lang, Math.max(0, summary.gstPaise))}
          meta={t('bill.year.gstNote')}
        />
      ) : null}
    </SectionCard>
  );
}

function PaperRow({
  paper,
  interactive,
}: {
  paper: Paper;
  /** A browser: the row has its Download. The phone app lists the paper and sends the owner to its bill. */
  interactive: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const { busyId, download } = useGstDownload(paper.paymentId);
  const doc: GstDocumentSummary = paper.doc;
  const isCreditNote = doc.kind === 'credit_note';
  return (
    <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words text-body font-medium text-text">
          {t(isCreditNote ? 'bill.papers.creditNote' : 'bill.papers.invoice', { number: doc.number })}
        </p>
        <p className="break-words text-meta text-text-muted">
          {t('bill.papers.meta', {
            date: formatDay(lang, doc.issuedAt),
            total: money(lang, doc.totalPaise),
          })}
        </p>
      </div>
      {interactive ? (
        <Button
          variant="secondary"
          loading={busyId === doc.id}
          disabled={busyId !== null && busyId !== doc.id}
          leftIcon={<Download aria-hidden className="h-5 w-5" strokeWidth={1.75} />}
          aria-label={t(
            isCreditNote
              ? 'payments.invoice.downloadCreditNoteAs'
              : 'payments.invoice.downloadInvoiceAs',
            { number: doc.number },
          )}
          onClick={() => void download(doc)}
        >
          {t('payments.invoice.download')}
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Every GST invoice and credit note in one list, newest first, so the accountant's "send me all the
 * invoices" is one scroll. Downloading is a read of something already paid for, so it is allowed in
 * the phone app too; but the page the app draws is pinned to the Back arrow as its only button
 * (`shellNoPayPath.test.tsx`), so there the rows are plain text and say where the Download is.
 */
export function PapersCard({ papers, interactive }: { papers: Paper[]; interactive: boolean }) {
  const t = useT();
  const hasCreditNote = papers.some((p) => p.doc.kind === 'credit_note');
  return (
    <SectionCard title={t('bill.papers.title')} count={papers.length > 0 ? papers.length : undefined}>
      {papers.length === 0 ? (
        <p className="break-words text-body text-text-muted">{t('bill.papers.empty')}</p>
      ) : (
        <>
          {!interactive ? (
            <p className="break-words text-body text-text-muted">{t('bill.papers.openBill')}</p>
          ) : null}
          <ul className="divide-y divide-border">
            {papers.map((p) => (
              <PaperRow key={`${p.paymentId}-${p.doc.id}`} paper={p} interactive={interactive} />
            ))}
          </ul>
          {hasCreditNote ? (
            <p className="mt-2 break-words text-meta text-text-muted">
              {t('bill.papers.creditNoteHelp')}
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

/** Who the bills are made out to, read-only (it is changed in the chat's billing card). */
export function BilledToCard({ billing }: { billing: SetupBilling | null }) {
  const t = useT();
  const lang = useLang();
  const state = billing
    ? (lang === 'hi' ? GST_STATE_NAMES_HI : GST_STATES)[billing.stateCode]
    : undefined;
  return (
    <SectionCard title={t('bill.to.title')}>
      {billing ? (
        <div className="flex flex-col gap-1">
          <p className="break-words text-body font-medium text-text">{billing.name}</p>
          {billing.address ? (
            <p className="break-words text-body text-text-muted">
              {state ? `${billing.address}, ${state}` : billing.address}
            </p>
          ) : null}
          <p className="break-words text-body text-text">
            {billing.gstin ? t('bill.to.gstin', { gstin: billing.gstin }) : t('bill.to.noGstin')}
          </p>
        </div>
      ) : (
        <p className="break-words text-body text-text-muted">{t('bill.to.empty')}</p>
      )}
    </SectionCard>
  );
}
