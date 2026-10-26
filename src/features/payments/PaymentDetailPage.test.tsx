import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import {
  enterNativeShell,
  leaveNativeShell,
  makeCheckout,
  makePaidPayment,
  makePayment,
} from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerPayment } from '@dk/shared/types';

import type * as CheckoutModule from './checkout';
import { loadCheckoutScript, openCheckout } from './checkout';
import { RECEIPT_FOOTER } from './Receipt';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});
vi.mock('./checkout', async (orig) => {
  const actual = await orig<typeof CheckoutModule>();
  return { ...actual, loadCheckoutScript: vi.fn(), openCheckout: vi.fn() };
});

const { PaymentDetailPage } = await import('./PaymentDetailPage');

/** The footer is two names in two spans; it is found by the paragraph's whole text. */
const footer = (_: string, el: Element | null) =>
  el?.tagName === 'P' && el.textContent === RECEIPT_FOOTER;

function renderDetail(payment: DealerPayment | null, lang: 'en' | 'hi' = 'en') {
  signIn({ dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  if (payment) vi.mocked(api.get).mockResolvedValue(payment);
  return renderWithProviders(
    <Routes>
      <Route path="/payments/:id" element={<PaymentDetailPage />} />
    </Routes>,
    { route: `/payments/${payment?.id ?? 'p1'}` },
  );
}

beforeEach(() => {
  vi.mocked(loadCheckoutScript).mockResolvedValue(undefined);
});

afterEach(() => {
  leaveNativeShell();
  resetStores();
});

describe('PaymentDetailPage — the receipt', () => {
  it('shows number, amount, Indian date and time, method, reference and the company', async () => {
    renderDetail(makePaidPayment());

    const receipt = (await screen.findByRole('region', { name: 'Receipt' })) as HTMLElement;
    expect(api.get).toHaveBeenCalledWith('/v1/payments/me/p2');
    expect(within(receipt).getByText('MDG-2026-00007')).toBeInTheDocument();
    expect(within(receipt).getByText('₹4,999')).toBeInTheDocument();
    // 09:50 UTC is 15:20 in India — the phone's own time zone never decides.
    expect(within(receipt).getByText(/^5 Oct 2026, 3:20\spm IST$/)).toBeInTheDocument();
    expect(within(receipt).getByText('UPI')).toBeInTheDocument();
    expect(within(receipt).getByText('Reference')).toBeInTheDocument();
    expect(within(receipt).getByText('pay_Qx12AbCdEfGh34')).toBeInTheDocument();
    expect(RECEIPT_FOOTER).toBe('VRUOOM PRIVATE LIMITED · MDG Services');
    expect(within(receipt).getByText(footer)).toBeInTheDocument();
    // Paid: nothing left to do.
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('reads in Hindi', async () => {
    renderDetail(makePaidPayment(), 'hi');

    expect(await screen.findByRole('heading', { name: 'रसीद' })).toBeInTheDocument();
    expect(screen.getByText('रसीद नंबर')).toBeInTheDocument();
    expect(screen.getByText('चुकाई गई रकम')).toBeInTheDocument();
    expect(screen.getByText('कैसे चुकाया')).toBeInTheDocument();
    expect(screen.getByText('रेफ़रेंस नंबर')).toBeInTheDocument();
    expect(screen.getByText(footer)).toBeInTheDocument();
  });

  it('shows what was given back on a part refund', async () => {
    renderDetail(makePaidPayment({ status: 'partially_refunded', refundedPaise: 50000 }));

    expect(await screen.findByText('Part refunded')).toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(screen.getByText('₹500')).toBeInTheDocument();
  });

  it('still shows the receipt of a payment that was refunded in full', async () => {
    renderDetail(makePaidPayment({ status: 'refunded', refundedPaise: 499900 }));

    expect(await screen.findByRole('heading', { name: 'Receipt' })).toBeInTheDocument();
    expect(screen.getAllByText('Refunded')).toHaveLength(2); // the chip and the receipt line
  });

  it('leaves out a line the server has no value for, instead of printing a dash', async () => {
    renderDetail(makePaidPayment({ method: null, razorpayPaymentId: null }));

    await screen.findByRole('heading', { name: 'Receipt' });
    expect(screen.queryByText('Paid by')).not.toBeInTheDocument();
    expect(screen.queryByText('Reference')).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('names a method it has no word for the way Razorpay does', async () => {
    renderDetail(makePaidPayment({ method: 'cardless_emi' }));

    expect(await screen.findByText('cardless_emi')).toBeInTheDocument();
  });

  it('has no receipt for a payment nothing was paid on', async () => {
    renderDetail(makePayment({ status: 'cancelled' }));

    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Receipt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });
});

describe('PaymentDetailPage — a payment that is due', () => {
  it('shows the amount, what it is for, the note, the date and a Pay button', async () => {
    renderDetail(makePayment({ note: 'November plan\nIncludes setup' }));

    expect(await screen.findByText('Dealer Kavach — Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('₹4,999')).toBeInTheDocument();
    expect(screen.getByText(/November plan/)).toBeInTheDocument();
    expect(screen.getByText('Due by 5 Nov 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ₹4,999' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Receipt' })).not.toBeInTheDocument();
  });

  // Razorpay's text is English and for developers. The dealer gets our phrase for
  // what it means — never Razorpay's own words.
  it('says in plain words what went wrong with the last try', async () => {
    renderDetail(
      makePayment({
        lastFailure: {
          reason: 'Payment processing cancelled by user',
          at: '2026-10-21T05:00:00.000Z',
        },
      }),
    );

    expect(
      await screen.findByText('Your last try did not go through: the payment was cancelled'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/processing cancelled by user/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ₹4,999' })).toBeInTheDocument();
  });

  it('says it in Hindi, with no English from Razorpay inside it', async () => {
    renderDetail(
      makePayment({
        lastFailure: {
          reason: 'Your payment has failed due to insufficient funds',
          at: '2026-10-21T05:00:00.000Z',
        },
      }),
      'hi',
    );

    expect(
      await screen.findByText('आपकी पिछली कोशिश नहीं हो पाई: खाते में पूरे पैसे नहीं थे'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/insufficient/)).not.toBeInTheDocument();
  });

  it('shows only a plain "did not go through" when the reason is one we cannot place', async () => {
    renderDetail(
      makePayment({
        lastFailure: { reason: 'BAD_REQUEST_ERROR: odd thing', at: '2026-10-21T05:00:00.000Z' },
      }),
    );

    expect(await screen.findByText('Your last try did not go through.')).toBeInTheDocument();
    expect(screen.queryByText(/BAD_REQUEST_ERROR/)).not.toBeInTheDocument();
  });

  it('opens the pop-up from here too', async () => {
    const user = userEvent.setup();
    vi.mocked(openCheckout).mockRejectedValue(new Error('stop here'));
    vi.mocked(api.post).mockImplementation((async (path: string) => {
      if (path.endsWith('/checkout')) return makeCheckout();
      throw new Error(`unexpected POST ${path}`);
    }) as typeof api.post);
    renderDetail(makePayment());

    await user.click(await screen.findByRole('button', { name: 'Pay ₹4,999' }));

    await waitFor(() => expect(openCheckout).toHaveBeenCalledWith(makeCheckout()));
    expect(api.post).toHaveBeenCalledWith('/v1/payments/me/p1/checkout');
  });

  it('shows a payment being confirmed without a Pay button', async () => {
    renderDetail(makePayment({ status: 'processing' }));

    expect(await screen.findByText('Being confirmed')).toBeInTheDocument();
    expect(
      screen.getByText('Your payment is being confirmed. You will get a message when it is done.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });
});

describe('PaymentDetailPage — a due payment that autopay will take', () => {
  it('reads "Autopay will take this on …" in place of the due date', async () => {
    renderDetail(makePayment({ autopayOn: '2036-10-28' }));

    expect(await screen.findByText('Autopay will take this on 28 Oct')).toBeInTheDocument();
    expect(screen.queryByText(/Due by/)).not.toBeInTheDocument();
  });

  it('says it in Hindi', async () => {
    renderDetail(makePayment({ autopayOn: '2036-10-28' }), 'hi');

    expect(await screen.findByText(/^ऑटोपे 28 अक्टू.* को काटेगा$/)).toBeInTheDocument();
    expect(screen.queryByText(/तक देना है/)).not.toBeInTheDocument();
  });

  it('keeps the usual due date when autopay is not on for it', async () => {
    renderDetail(makePayment({ autopayOn: null }));

    expect(await screen.findByText('Due by 5 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Autopay will take/)).not.toBeInTheDocument();
  });

  it('says it inside the Android app too, with the page still read-only', async () => {
    enterNativeShell();
    renderDetail(makePayment({ autopayOn: '2036-10-28' }));

    expect(await screen.findByText('Autopay will take this on 28 Oct')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });
});

describe('PaymentDetailPage — autopay that did not go through', () => {
  // The debit day came and went and the bill is still due. A past date after
  // "will take this on" would be a promise already broken.
  it('says autopay is trying again, not a date that has passed, and shows no Pay button', async () => {
    renderDetail(makePayment({ autopayOn: '2020-10-28' }));

    expect(
      await screen.findByText('Autopay could not take this yet. It is trying again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Autopay will take this/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('says it in Hindi', async () => {
    renderDetail(makePayment({ autopayOn: '2020-10-28' }), 'hi');

    expect(
      await screen.findByText('ऑटोपे अभी इसे नहीं काट पाया। वह फिर कोशिश कर रहा है।'),
    ).toBeInTheDocument();
  });
});

describe('PaymentDetailPage — inside the Android app', () => {
  beforeEach(() => enterNativeShell());

  it('shows a due payment read-only: no Pay button, no link, nothing loaded from Razorpay', async () => {
    renderDetail(
      makePayment({
        lastFailure: { reason: 'UPI request expired', at: '2026-10-21T05:00:00.000Z' },
      }),
    );

    expect(await screen.findByText('Dealer Kavach — Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('₹4,999')).toBeInTheDocument();
    expect(screen.getByText('Due by 5 Nov 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Back',
    ]);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(loadCheckoutScript).not.toHaveBeenCalled();
    // A failed try is about paying, and the app says nothing of it — nor shows Razorpay's text.
    expect(screen.queryByText(/did not go through/)).not.toBeInTheDocument();
    expect(screen.queryByText(/UPI request expired/)).not.toBeInTheDocument();
  });

  it('still shows the receipt of what was paid', async () => {
    renderDetail(makePaidPayment());

    expect(await screen.findByRole('heading', { name: 'Receipt' })).toBeInTheDocument();
    expect(screen.getByText('pay_Qx12AbCdEfGh34')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('PaymentDetailPage — when it cannot be shown', () => {
  it('says it could not find a payment that is not this outlet’s (the server answers 404)', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not found'));
    renderDetail(null);

    expect(await screen.findByText("We couldn't find this payment")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('says payments are not switched on yet when the server has no Razorpay keys', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not configured'),
    );
    renderDetail(null);

    expect(await screen.findByText('Payments are not switched on yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('does not call a plain 503 "not switched on": it says to try again in a minute', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(503, 'HTTP_503', 'Service Unavailable'));
    renderDetail(null);

    expect(await screen.findByText("We couldn't show your payments just now")).toBeInTheDocument();
    expect(screen.queryByText('Payments are not switched on yet')).not.toBeInTheDocument();
    expect(
      screen.getByText('The payment service did not answer. Please try again in a minute.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says it could not load, and offers to try again, on any other failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'boom'));
    renderDetail(null);

    expect(await screen.findByText("We couldn't show your payments just now")).toBeInTheDocument();

    vi.mocked(api.get).mockResolvedValue(makePayment());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dealer Kavach — Nov 2026')).toBeInTheDocument();
  });

  it('keeps the bar and its way back while loading', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => undefined));
    renderDetail(null);

    expect(screen.getByText('Payment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});
