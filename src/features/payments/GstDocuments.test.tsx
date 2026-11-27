import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import type * as DownloadModule from '@/lib/downloadAttachment';
import { deliverDownload } from '@/lib/downloadAttachment';
import { useLangStore } from '@/store/lang';
import {
  enterNativeShell,
  leaveNativeShell,
  makeCreditNote,
  makeInterStateInvoice,
  makeInvoice,
  makePaidPayment,
  makePayment,
} from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import { splitGstInclusive } from '@dk/shared';
import type { DealerPayment, GstDocumentDownload } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});
// The real delivery, watched: the tests below see what it was asked to hand
// over AND what the app's bridge or the browser then did with it.
vi.mock('@/lib/downloadAttachment', async (orig) => {
  const actual = await orig<typeof DownloadModule>();
  return { ...actual, deliverDownload: vi.fn() };
});
const { deliverDownload: realDeliverDownload } = await vi.importActual<typeof DownloadModule>(
  '@/lib/downloadAttachment',
);

const { PaymentDetailPage } = await import('./PaymentDetailPage');

const LINK: GstDocumentDownload = {
  url: 'https://s3.test/gst/invoice?sig=abc',
  filename: 'MDG-26-27-00001.pdf',
};

/**
 * The payment, and what to answer when a document's link is asked for: a link,
 * a promise of one the test settles itself, or an error for the server saying no.
 */
type LinkAnswer = GstDocumentDownload | Promise<GstDocumentDownload> | Error;

function serve(payment: DealerPayment, link: LinkAnswer = LINK) {
  vi.mocked(api.get).mockImplementation((async (path: string) => {
    if (path === `/v1/payments/me/${payment.id}`) return payment;
    if (path.startsWith(`/v1/payments/me/${payment.id}/documents/`)) {
      if (link instanceof Error) throw link;
      return link;
    }
    throw new Error(`unexpected GET ${path}`);
  }) as typeof api.get);
}

function renderDetail(payment: DealerPayment, lang: 'en' | 'hi' = 'en', link?: LinkAnswer) {
  signIn({ dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  serve(payment, link);
  return renderWithProviders(
    <Routes>
      <Route path="/payments/:id" element={<PaymentDetailPage />} />
    </Routes>,
    { route: `/payments/${payment.id}` },
  );
}

/** Record the links the page clicks (jsdom cannot follow one) instead of following them. */
function followLinks() {
  const followed: Array<{ href: string; target: string }> = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    followed.push({ href: this.href, target: this.target });
  });
  return followed;
}

const documentCalls = () =>
  vi.mocked(api.get).mock.calls.filter(([path]) => String(path).includes('/documents/'));

beforeEach(() => {
  vi.mocked(deliverDownload).mockImplementation(realDeliverDownload);
});

afterEach(() => {
  leaveNativeShell();
  resetStores();
});

describe('the figures these tests use', () => {
  // The fixtures are written out in full on purpose; this is the one place they
  // are held up against the shared rule, so the two cannot drift apart unseen.
  it('are what the shared split gives for ₹4,999 and a ₹500 refund', () => {
    const inv = makeInvoice();
    expect(splitGstInclusive(inv.totalPaise, '06')).toMatchObject({
      taxablePaise: inv.taxablePaise,
      cgstPaise: inv.cgstPaise,
      sgstPaise: inv.sgstPaise,
      igstPaise: 0,
      roundOffPaise: inv.roundOffPaise,
    });
    const inter = makeInterStateInvoice();
    expect(splitGstInclusive(inter.totalPaise, '07')).toMatchObject({
      taxablePaise: inter.taxablePaise,
      cgstPaise: 0,
      igstPaise: inter.igstPaise,
      roundOffPaise: inter.roundOffPaise,
    });
    const cn = makeCreditNote();
    expect(splitGstInclusive(cn.totalPaise, '06')).toMatchObject({
      taxablePaise: cn.taxablePaise,
      cgstPaise: cn.cgstPaise,
      sgstPaise: cn.sgstPaise,
      roundOffPaise: cn.roundOffPaise,
    });
  });
});

describe('PaymentDetailPage — the GST invoice', () => {
  it('shows number, date and the CGST + SGST split of an outlet in our own state', async () => {
    renderDetail(makePaidPayment({ invoice: makeInvoice() }));

    const invoice = await screen.findByRole('region', { name: 'GST invoice' });
    expect(within(invoice).getByText('Invoice number')).toBeInTheDocument();
    expect(within(invoice).getByText('MDG/26-27/00001')).toBeInTheDocument();
    // 09:50 UTC is 15:20 in India, still the 5th.
    expect(within(invoice).getByText('5 Oct 2026')).toBeInTheDocument();
    expect(within(invoice).getByText('Value before tax')).toBeInTheDocument();
    expect(within(invoice).getByText('₹4,236.44')).toBeInTheDocument();
    expect(within(invoice).getByText('CGST (9%)')).toBeInTheDocument();
    expect(within(invoice).getByText('SGST (9%)')).toBeInTheDocument();
    expect(within(invoice).getAllByText('₹381.28')).toHaveLength(2);
    expect(within(invoice).queryByText(/IGST/)).not.toBeInTheDocument();
    // Rounding left nothing over, so there is no Round off line to read.
    expect(within(invoice).queryByText('Round off')).not.toBeInTheDocument();
    expect(within(invoice).getByText('Total')).toBeInTheDocument();
    expect(within(invoice).getByText('₹4,999')).toBeInTheDocument();
    expect(
      within(invoice).getByRole('button', { name: 'Download GST invoice MDG/26-27/00001' }),
    ).toBeInTheDocument();
    // The receipt is still there, above it, and the quiet line is not.
    expect(screen.getByRole('region', { name: 'Receipt' })).toBeInTheDocument();
    expect(screen.queryByText('GST invoice is being prepared')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Credit note' })).not.toBeInTheDocument();
  });

  it('shows one IGST line, and no CGST or SGST, for an outlet in another state', async () => {
    renderDetail(makePaidPayment({ invoice: makeInterStateInvoice() }));

    const invoice = await screen.findByRole('region', { name: 'GST invoice' });
    expect(within(invoice).getByText('IGST (18%)')).toBeInTheDocument();
    expect(within(invoice).getByText('₹762.56')).toBeInTheDocument();
    expect(within(invoice).queryByText(/CGST|SGST/)).not.toBeInTheDocument();
    expect(within(invoice).getByText('₹4,236.44')).toBeInTheDocument();
    expect(within(invoice).getByText('₹4,999')).toBeInTheDocument();
  });

  it('shows the Round off line, with its sign, when rounding left something over', async () => {
    // ₹1,001 in Haryana: ₹848.31 + 2 × ₹76.35 = ₹1,001.01, one paisa too much.
    renderDetail(
      makePaidPayment({
        amountPaise: 100100,
        invoice: makeInvoice({
          taxablePaise: 84831,
          cgstPaise: 7635,
          sgstPaise: 7635,
          roundOffPaise: -1,
          totalPaise: 100100,
        }),
      }),
    );

    const invoice = await screen.findByRole('region', { name: 'GST invoice' });
    expect(within(invoice).getByText('Round off')).toBeInTheDocument();
    expect(within(invoice).getByText('−₹0.01')).toBeInTheDocument();
    expect(within(invoice).getByText('₹1,001')).toBeInTheDocument();
  });

  it('shows a credit note for each refund, with the invoice it is against', async () => {
    renderDetail(
      makePaidPayment({
        status: 'partially_refunded',
        refundedPaise: 80000,
        invoice: makeInvoice(),
        creditNotes: [
          makeCreditNote(),
          makeCreditNote({
            id: 'g3',
            number: 'MDGCN/26-27/0002',
            issuedAt: '2026-10-14T05:30:00.000Z',
            taxablePaise: 25424,
            cgstPaise: 2288,
            sgstPaise: 2288,
            roundOffPaise: 0,
            totalPaise: 30000,
          }),
        ],
      }),
    );

    expect(await screen.findByRole('region', { name: 'GST invoice' })).toBeInTheDocument();
    const notes = screen.getAllByRole('region', { name: 'Credit note' });
    expect(notes).toHaveLength(2);

    const first = notes[0] as HTMLElement;
    expect(within(first).getByText('Credit note number')).toBeInTheDocument();
    expect(within(first).getByText('MDGCN/26-27/0001')).toBeInTheDocument();
    expect(within(first).getByText('12 Oct 2026')).toBeInTheDocument();
    expect(within(first).getByText('Against invoice')).toBeInTheDocument();
    expect(within(first).getByText('MDG/26-27/00001')).toBeInTheDocument();
    expect(within(first).getByText('₹423.73')).toBeInTheDocument();
    expect(within(first).getAllByText('₹38.14')).toHaveLength(2);
    expect(within(first).getByText('−₹0.01')).toBeInTheDocument();
    expect(within(first).getByText('Total credited')).toBeInTheDocument();
    expect(within(first).getByText('₹500')).toBeInTheDocument();
    expect(
      within(first).getByRole('button', { name: 'Download credit note MDGCN/26-27/0001' }),
    ).toBeInTheDocument();

    const second = notes[1] as HTMLElement;
    expect(within(second).getByText('MDGCN/26-27/0002')).toBeInTheDocument();
    expect(within(second).getByText('₹300')).toBeInTheDocument();
    expect(within(second).queryByText('Round off')).not.toBeInTheDocument();
  });

  it('says only that it is being prepared when the payment is paid but has no invoice yet', async () => {
    renderDetail(makePaidPayment());

    expect(await screen.findByText('GST invoice is being prepared')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'GST invoice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
    // No reason, no instruction: a dealer can do nothing about why it waits.
    expect(document.body.textContent).not.toMatch(/GSTIN|configur|bill to|blocked|admin/i);
  });

  it('says the same of a payment that was refunded before its invoice was issued', async () => {
    renderDetail(makePaidPayment({ status: 'refunded', refundedPaise: 499900 }));

    expect(await screen.findByText('GST invoice is being prepared')).toBeInTheDocument();
  });

  it('has nothing to say about GST on a payment that is not paid', async () => {
    renderDetail(makePayment());

    await screen.findByRole('button', { name: 'Pay ₹4,999' });
    expect(screen.queryByText('GST invoice is being prepared')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'GST invoice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('has nothing to say about GST on a payment that was cancelled', async () => {
    renderDetail(makePayment({ status: 'cancelled' }));

    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('GST invoice is being prepared')).not.toBeInTheDocument();
  });

  it('reads in Hindi', async () => {
    renderDetail(
      makePaidPayment({ invoice: makeInvoice(), creditNotes: [makeCreditNote()] }),
      'hi',
    );

    const invoice = await screen.findByRole('region', { name: 'GST इनवॉइस' });
    expect(within(invoice).getByText('इनवॉइस नंबर')).toBeInTheDocument();
    expect(within(invoice).getByText('तारीख')).toBeInTheDocument();
    expect(within(invoice).getByText('टैक्स से पहले की रकम')).toBeInTheDocument();
    expect(within(invoice).getByText('CGST (9%)')).toBeInTheDocument();
    expect(within(invoice).getByText('कुल')).toBeInTheDocument();
    expect(
      within(invoice).getByRole('button', { name: 'GST इनवॉइस MDG/26-27/00001 डाउनलोड करें' }),
    ).toBeInTheDocument();
    expect(within(invoice).getByText('डाउनलोड करें')).toBeInTheDocument();

    const note = screen.getByRole('region', { name: 'क्रेडिट नोट' });
    expect(within(note).getByText('क्रेडिट नोट नंबर')).toBeInTheDocument();
    expect(within(note).getByText('किस इनवॉइस पर')).toBeInTheDocument();
    expect(within(note).getByText('कुल क्रेडिट')).toBeInTheDocument();
    expect(within(note).getByText('राउंड ऑफ़')).toBeInTheDocument();
  });

  it('says it in Hindi when the invoice is being prepared', async () => {
    renderDetail(makePaidPayment(), 'hi');

    expect(await screen.findByText('GST इनवॉइस तैयार हो रहा है')).toBeInTheDocument();
  });
});

describe('PaymentDetailPage — downloading', () => {
  // The link is fetched AFTER the tap. A tab opened from there is blocked by Safari
  // without a word, so a browser is taken to the link in this tab instead.
  it('asks the server for the invoice’s link, hands it to the download helper, and goes to it in this tab', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const followed = followLinks();
    renderDetail(makePaidPayment({ invoice: makeInvoice() }));

    await user.click(
      await screen.findByRole('button', { name: 'Download GST invoice MDG/26-27/00001' }),
    );

    await waitFor(() => expect(deliverDownload).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith('/v1/payments/me/p2/documents/g1');
    expect(deliverDownload).toHaveBeenCalledWith(
      {
        url: LINK.url,
        filename: LINK.filename,
        contentType: 'application/pdf',
        kind: 'file',
      },
      { sameTab: true },
    );
    expect(followed).toEqual([{ href: LINK.url, target: '' }]);
    expect(open).not.toHaveBeenCalled();
    expect(await screen.findByText('Your download is starting')).toBeInTheDocument();
    // Nothing was posted: a download is a read.
    expect(api.post).not.toHaveBeenCalled();
  });

  it('downloads a credit note by its own id', async () => {
    const user = userEvent.setup();
    followLinks();
    renderDetail(makePaidPayment({ invoice: makeInvoice(), creditNotes: [makeCreditNote()] }));

    await user.click(
      await screen.findByRole('button', { name: 'Download credit note MDGCN/26-27/0001' }),
    );

    await waitFor(() => expect(deliverDownload).toHaveBeenCalledTimes(1));
    expect(documentCalls()).toEqual([['/v1/payments/me/p2/documents/g2']]);
  });

  it('keeps the other buttons still, and fetches once, while one download is on its way', async () => {
    const user = userEvent.setup();
    followLinks();
    let release!: (link: GstDocumentDownload) => void;
    const slow = new Promise<GstDocumentDownload>((resolve) => {
      release = resolve;
    });
    renderDetail(
      makePaidPayment({ invoice: makeInvoice(), creditNotes: [makeCreditNote()] }),
      'en',
      slow,
    );

    const invoiceButton = await screen.findByRole('button', {
      name: 'Download GST invoice MDG/26-27/00001',
    });
    const noteButton = screen.getByRole('button', {
      name: 'Download credit note MDGCN/26-27/0001',
    });
    await user.click(invoiceButton);
    await user.click(invoiceButton);
    await user.click(noteButton);

    expect(invoiceButton).toBeDisabled();
    expect(noteButton).toBeDisabled();
    expect(documentCalls()).toHaveLength(1);

    release(LINK);
    await waitFor(() => expect(invoiceButton).toBeEnabled());
    expect(noteButton).toBeEnabled();
    expect(deliverDownload).toHaveBeenCalledTimes(1);
  });

  it('says it could not download, and does not open anything, when the server refuses', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const followed = followLinks();
    renderDetail(
      makePaidPayment({ invoice: makeInvoice() }),
      'en',
      new ApiError(404, 'NOT_FOUND', 'Not found'),
    );

    const button = await screen.findByRole('button', {
      name: 'Download GST invoice MDG/26-27/00001',
    });
    await user.click(button);

    expect(
      await screen.findByText("Couldn't download this. Please check your network and try again."),
    ).toBeInTheDocument();
    expect(deliverDownload).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(followed).toHaveLength(0);
    // And it can be tried again.
    expect(button).toBeEnabled();
  });

  // A busy invoice printer passes by itself: say when to try, not "check your network".
  it.each(['INVOICE_PDF_BUSY', 'INVOICE_PDF_FAILED'])(
    'says to try again in a minute when the server answers 503 %s',
    async (code) => {
      const user = userEvent.setup();
      followLinks();
      renderDetail(
        makePaidPayment({ invoice: makeInvoice() }),
        'en',
        new ApiError(503, code, 'The invoice is being prepared for someone else right now.'),
      );

      const button = await screen.findByRole('button', {
        name: 'Download GST invoice MDG/26-27/00001',
      });
      await user.click(button);

      expect(
        await screen.findByText('Your invoice is being prepared. Please try again in a minute.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/check your network/)).not.toBeInTheDocument();
      expect(deliverDownload).not.toHaveBeenCalled();
      expect(button).toBeEnabled();
    },
  );

  it('says the same in Hindi', async () => {
    const user = userEvent.setup();
    followLinks();
    renderDetail(
      makePaidPayment({ invoice: makeInvoice() }),
      'hi',
      new ApiError(503, 'INVOICE_PDF_BUSY', 'busy'),
    );

    await user.click(await screen.findByRole('button', { name: /डाउनलोड करें/ }));

    expect(
      await screen.findByText('आपका इनवॉइस तैयार हो रहा है। कृपया एक मिनट बाद फिर कोशिश करें।'),
    ).toBeInTheDocument();
  });

  it('says it could not download when the app could not save the file', async () => {
    const user = userEvent.setup();
    vi.mocked(deliverDownload).mockRejectedValue(new Error('Download failed'));
    renderDetail(makePaidPayment({ invoice: makeInvoice() }));

    await user.click(
      await screen.findByRole('button', { name: 'Download GST invoice MDG/26-27/00001' }),
    );

    expect(
      await screen.findByText("Couldn't download this. Please check your network and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText('Your download is starting')).not.toBeInTheDocument();
  });
});

describe('PaymentDetailPage — the GST invoice inside the Android app', () => {
  beforeEach(() => enterNativeShell());

  it('is shown, with its Download button — it is a receipt, not a way to pay', async () => {
    renderDetail(makePaidPayment({ invoice: makeInvoice(), creditNotes: [makeCreditNote()] }));

    const invoice = await screen.findByRole('region', { name: 'GST invoice' });
    expect(within(invoice).getByText('MDG/26-27/00001')).toBeInTheDocument();
    expect(within(invoice).getByText('₹4,999')).toBeInTheDocument();
    expect(
      within(invoice).getByRole('button', { name: 'Download GST invoice MDG/26-27/00001' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Credit note' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('is waiting in the same quiet words when it has not been issued yet', async () => {
    renderDetail(makePaidPayment());

    expect(await screen.findByText('GST invoice is being prepared')).toBeInTheDocument();
  });

  it('hands the PDF to the app’s own downloader, not to a new browser tab', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const sent: Array<Record<string, unknown>> = [];
    // The shell acks at once and reports the file saved, as the real one does.
    (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
      postMessage: (raw: string) => {
        const msg = JSON.parse(raw) as { id: string };
        sent.push(msg);
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent('native-media-download-started', { detail: { id: msg.id } }),
          );
          window.dispatchEvent(
            new CustomEvent('native-media-download', {
              detail: { id: msg.id, ok: true, mode: 'browser' },
            }),
          );
        });
      },
    };
    renderDetail(makePaidPayment({ invoice: makeInvoice() }));

    await user.click(
      await screen.findByRole('button', { name: 'Download GST invoice MDG/26-27/00001' }),
    );

    expect(await screen.findByText('Your download is starting')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/v1/payments/me/p2/documents/g1');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'media:download',
      url: LINK.url,
      filename: LINK.filename,
      contentType: 'application/pdf',
      kind: 'file',
    });
    expect(open).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
