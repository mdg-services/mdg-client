import { Download } from 'lucide-react';

import { Button, Card, CardContent } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { formatPaise, GST_RATE_PERCENT } from '@dk/shared';
import type { DealerPayment, GstDocumentSummary } from '@dk/shared/types';

import { formatDay } from './paymentView';
import { useGstDownload } from './useGstDownload';

/** A label on the left, a figure or a name on the right — on a phone too, never stacked. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-base text-text-muted">{label}</dt>
      <dd
        className={
          strong
            ? 'break-words text-right text-base font-semibold tabular-nums text-text'
            : 'break-words text-right text-base font-medium tabular-nums text-text'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One GST tax invoice or credit note, as the server issued it: its number and
 * date, the split of what was paid into value and tax, and a Download button
 * for the PDF (ADR 0022 §11).
 *
 * Every figure is read off the document, never worked out here. The server
 * fixed them when it issued the document, and the PDF the dealer's accountant
 * files is drawn from the same ones — so a rounding rule written a second time
 * on this screen could only ever make the two disagree by a paisa.
 *
 * Which tax it carries decides the lines: an outlet in our own state pays CGST
 * and SGST, anyone else pays IGST, and a line for a tax that is nil is left
 * out rather than printed as ₹0. The "Round off" line appears only when
 * rounding left something over, so most invoices read taxable + tax = total.
 */
function GstDocumentCard({
  doc,
  busy,
  locked,
  onDownload,
}: {
  doc: GstDocumentSummary;
  /** This document's own PDF is being fetched. */
  busy: boolean;
  /** Another document's is, so this button waits. */
  locked: boolean;
  onDownload: (doc: GstDocumentSummary) => void;
}) {
  const t = useT();
  const lang = useLang();
  const isCreditNote = doc.kind === 'credit_note';
  const half = GST_RATE_PERCENT / 2;
  const headingId = `gst-doc-${doc.id}`;
  // Used to tell the buttons apart for a screen reader: two of them say "Download".
  const buttonName = t(
    isCreditNote ? 'payments.invoice.downloadCreditNoteAs' : 'payments.invoice.downloadInvoiceAs',
    { number: doc.number },
  );

  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardContent className="p-5">
        <h2 id={headingId} className="text-lg font-semibold text-text">
          {t(isCreditNote ? 'payments.invoice.creditNoteTitle' : 'payments.invoice.title')}
        </h2>
        <dl className="mt-1 divide-y divide-border">
          <Row
            label={t(
              isCreditNote ? 'payments.invoice.creditNoteNumber' : 'payments.invoice.number',
            )}
            value={doc.number}
          />
          <Row label={t('payments.invoice.date')} value={formatDay(lang, doc.issuedAt)} />
          {isCreditNote && doc.againstNumber ? (
            <Row label={t('payments.invoice.against')} value={doc.againstNumber} />
          ) : null}
          <Row label={t('payments.invoice.taxable')} value={formatPaise(doc.taxablePaise)} />
          {doc.igstPaise > 0 ? (
            <Row
              label={t('payments.invoice.igst', { rate: GST_RATE_PERCENT })}
              value={formatPaise(doc.igstPaise)}
            />
          ) : (
            <>
              <Row
                label={t('payments.invoice.cgst', { rate: half })}
                value={formatPaise(doc.cgstPaise)}
              />
              <Row
                label={t('payments.invoice.sgst', { rate: half })}
                value={formatPaise(doc.sgstPaise)}
              />
            </>
          )}
          {doc.roundOffPaise !== 0 ? (
            <Row label={t('payments.invoice.roundOff')} value={formatPaise(doc.roundOffPaise)} />
          ) : null}
          <Row
            label={t(isCreditNote ? 'payments.invoice.totalCredited' : 'payments.invoice.total')}
            value={formatPaise(doc.totalPaise)}
            strong
          />
        </dl>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          className="mt-3"
          loading={busy}
          disabled={locked}
          leftIcon={<Download width={18} height={18} strokeWidth={1.75} aria-hidden />}
          aria-label={buttonName}
          onClick={() => onDownload(doc)}
        >
          {t('payments.invoice.download')}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * What the receipt of a paid payment says about its GST paperwork: the tax
 * invoice, then one credit note for every refund that went through.
 *
 * A payment that is paid but has no invoice yet gets one quiet line and nothing
 * else. Why it is waiting — the company's tax details not set, or nobody having
 * said who to bill — is for the admin to fix, and a dealer can do nothing about
 * either, so the reason is never sent to this screen (see `invoiceBlocker` on
 * the admin's payment) and never guessed at here.
 *
 * NOT BEHIND `canPayHere()`. This is a receipt for something already paid, and
 * downloading a document is not a way to pay, so it shows inside the Android
 * app too. The page's policy test still looks at everything in the app's
 * rendering of this card and finds no pay path.
 */
export function GstDocuments({ payment }: { payment: DealerPayment }) {
  const t = useT();
  const { busyId, download } = useGstDownload(payment.id);
  const { invoice, creditNotes } = payment;

  const card = (doc: GstDocumentSummary) => (
    <GstDocumentCard
      key={doc.id}
      doc={doc}
      busy={busyId === doc.id}
      locked={busyId !== null && busyId !== doc.id}
      onDownload={(d) => void download(d)}
    />
  );

  return (
    <>
      {invoice ? (
        card(invoice)
      ) : (
        <p className="px-1 text-base text-text-muted">{t('payments.invoice.preparing')}</p>
      )}
      {creditNotes.map(card)}
    </>
  );
}
