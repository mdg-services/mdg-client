import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { CheckoutError, loadCheckoutScript, openCheckout } from './checkout';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});
vi.mock('./checkout', async (orig) => {
  const actual = await orig<typeof CheckoutModule>();
  return { ...actual, loadCheckoutScript: vi.fn(), openCheckout: vi.fn() };
});

const { PaymentsPage } = await import('./PaymentsPage');

function listReturns(...items: DealerPayment[]) {
  vi.mocked(api.get).mockResolvedValue({ items });
}

function renderPayments(lang: 'en' | 'hi' = 'en') {
  signIn({ dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(<PaymentsPage />, { route: '/payments' });
}

beforeEach(() => {
  vi.mocked(loadCheckoutScript).mockResolvedValue(undefined);
});

afterEach(() => {
  leaveNativeShell();
  resetStores();
});

describe('PaymentsPage — states', () => {
  it('asks for the signed-in outlet’s payments, and shows a placeholder while they come', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => undefined));

    renderPayments();

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/v1/payments/me'));
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Due')).not.toBeInTheDocument();
    // The bar is there even now, with a way back.
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('says it could not load, rather than "no payments", and offers to try again', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'boom'));
    renderPayments();

    expect(await screen.findByText("We couldn't show your payments just now")).toBeInTheDocument();
    expect(screen.queryByText('No payments yet')).not.toBeInTheDocument();

    listReturns(makePayment());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Dealer Kavach — Nov 2026')).toBeInTheDocument();
    expect(screen.queryByText("We couldn't show your payments just now")).not.toBeInTheDocument();
  });

  // With no Razorpay keys on the server EVERY payments route answers 503, the
  // reading ones too. That is "not switched on", not a broken network.
  it('says payments are not switched on yet when the server has no Razorpay keys', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not configured'),
    );
    renderPayments();

    expect(await screen.findByText('Payments are not switched on yet')).toBeInTheDocument();
    expect(screen.queryByText("We couldn't show your payments just now")).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows an empty state when the pump has no payments at all', async () => {
    listReturns();
    renderPayments();

    expect(await screen.findByText('No payments yet')).toBeInTheDocument();
    expect(screen.queryByText('Due')).not.toBeInTheDocument();
  });

  it('says nothing is due when everything is paid, and still lists what was paid', async () => {
    listReturns(makePaidPayment());
    renderPayments();

    expect(await screen.findByText('Nothing is due right now.')).toBeInTheDocument();
    expect(screen.getByText('Dealer Kavach — Oct 2026')).toBeInTheDocument();
  });
});

describe('PaymentsPage — in a browser', () => {
  it('shows what is due with a big amount, its date and a Pay button', async () => {
    listReturns(makePayment({ note: 'ignored on the list' }), makePaidPayment());
    renderPayments();

    const due = (await screen.findByRole('region', { name: 'Due' })) as HTMLElement;
    expect(within(due).getByText('Dealer Kavach — Nov 2026')).toBeInTheDocument();
    expect(within(due).getByText('₹4,999')).toBeInTheDocument();
    expect(within(due).getByText('Due by 5 Nov 2026')).toBeInTheDocument();
    // The section's own heading, and the card's status chip.
    expect(within(due).getAllByText('Due')).toHaveLength(2);
    expect(within(due).getByRole('button', { name: 'Pay ₹4,999' })).toBeInTheDocument();
  });

  it('shows what was paid below, with its status, date, method and receipt number', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    const history = (await screen.findByRole('region', {
      name: 'Paid and earlier',
    })) as HTMLElement;
    expect(within(history).getByText('Dealer Kavach — Oct 2026')).toBeInTheDocument();
    expect(within(history).getByText('Paid')).toBeInTheDocument();
    expect(within(history).getByText('Paid on 5 Oct 2026 · UPI')).toBeInTheDocument();
    expect(within(history).getByText('Receipt MDG-2026-00007')).toBeInTheDocument();
    // Nothing to pay on a payment already paid.
    expect(within(history).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows refunded, part refunded and cancelled payments as history, in plain words', async () => {
    listReturns(
      makePaidPayment({
        id: 'r1',
        title: 'Refunded one',
        status: 'refunded',
        refundedPaise: 499900,
      }),
      makePaidPayment({
        id: 'r2',
        title: 'Part refunded one',
        status: 'partially_refunded',
        refundedPaise: 50000,
      }),
      makePayment({ id: 'c1', title: 'Cancelled one', status: 'cancelled' }),
    );
    renderPayments();

    const history = (await screen.findByRole('region', {
      name: 'Paid and earlier',
    })) as HTMLElement;
    expect(within(history).getByText('Refunded')).toBeInTheDocument();
    expect(within(history).getByText('Part refunded')).toBeInTheDocument();
    expect(within(history).getByText('Cancelled')).toBeInTheDocument();
    expect(within(history).getByText('₹500 refunded')).toBeInTheDocument();
    expect(within(history).queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens a payment’s own page from its card', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    const due = (await screen.findByRole('region', { name: 'Due' })) as HTMLElement;
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href')).sort()).toEqual([
      '/payments/p1',
      '/payments/p2',
    ]);
    expect(within(due).getByRole('link')).toHaveAttribute('href', '/payments/p1');
  });

  it('lists the soonest due date first, and a payment with no date last', async () => {
    listReturns(
      makePayment({ id: 'a', title: 'No date', dueDate: null }),
      makePayment({ id: 'b', title: 'Later', dueDate: '2026-12-01' }),
      makePayment({ id: 'c', title: 'Sooner', dueDate: '2026-11-02' }),
    );
    renderPayments();

    const due = (await screen.findByRole('region', { name: 'Due' })) as HTMLElement;
    const titles = within(due)
      .getAllByRole('link')
      .map((a) => a.textContent ?? '');
    expect(titles[0]).toContain('Sooner');
    expect(titles[1]).toContain('Later');
    expect(titles[2]).toContain('No date');
  });

  it('has no Pay button on a payment that is already being confirmed', async () => {
    listReturns(makePayment({ status: 'processing' }));
    renderPayments();

    const due = (await screen.findByRole('region', { name: 'Due' })) as HTMLElement;
    expect(within(due).getByText('Being confirmed')).toBeInTheDocument();
    expect(
      within(due).getByText(
        'Your payment is being confirmed. You will get a message when it is done.',
      ),
    ).toBeInTheDocument();
    expect(within(due).queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('is in Hindi by default', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments('hi');

    expect(await screen.findByRole('region', { name: 'बाकी भुगतान' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'हो चुके भुगतान' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '₹4,999 चुकाएँ' })).toBeInTheDocument();
    expect(screen.getByText('चुका दिया')).toBeInTheDocument();
    expect(screen.getByText('रसीद MDG-2026-00007')).toBeInTheDocument();
  });
});

describe('PaymentsPage — tapping Pay', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockImplementation((async (path: string) => {
      if (path.endsWith('/checkout')) return makeCheckout();
      if (path.endsWith('/verify'))
        return makePaidPayment({ id: 'p1', title: 'Dealer Kavach — Nov 2026' });
      throw new Error(`unexpected POST ${path}`);
    }) as typeof api.post);
  });

  it('opens Razorpay’s pop-up for that payment, and moves it to what was paid when the server confirms', async () => {
    const user = userEvent.setup();
    vi.mocked(openCheckout).mockResolvedValue({
      razorpayOrderId: 'order_Qx12AbCdEf',
      razorpayPaymentId: 'pay_Qx12AbCdEfGh34',
      razorpaySignature: 'a'.repeat(64),
    });
    // The list is read again once paid, and by then it says paid.
    vi.mocked(api.get)
      .mockResolvedValueOnce({ items: [makePayment()] })
      .mockResolvedValue({
        items: [makePaidPayment({ id: 'p1', title: 'Dealer Kavach — Nov 2026' })],
      });
    renderPayments();

    await user.click(await screen.findByRole('button', { name: 'Pay ₹4,999' }));

    await waitFor(() => expect(openCheckout).toHaveBeenCalledWith(makeCheckout()));
    expect(api.post).toHaveBeenCalledWith('/v1/payments/me/p1/checkout');
    expect(await screen.findByText('Payment received. Thank you.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Pay ₹4,999' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Nothing is due right now.')).toBeInTheDocument();
  });

  it('keeps the Pay button, and says so in words, when the dealer closes the pop-up', async () => {
    const user = userEvent.setup();
    vi.mocked(openCheckout).mockRejectedValue(new CheckoutError('dismissed', 'closed'));
    vi.mocked(api.get).mockResolvedValue({ items: [makePayment()] });
    vi.mocked(api.post).mockImplementation((async (path: string) => {
      if (path.endsWith('/checkout')) return makeCheckout();
      if (path.endsWith('/refresh')) return makePayment();
      throw new Error(`unexpected POST ${path}`);
    }) as typeof api.post);
    renderPayments();

    await user.click(await screen.findByRole('button', { name: 'Pay ₹4,999' }));

    expect(
      await screen.findByText('The payment was not completed. You can try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay ₹4,999' })).toBeEnabled();
  });

  it('says payments are not switched on when the server has no Razorpay keys', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ items: [makePayment()] });
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not configured'),
    );
    renderPayments();

    await user.click(await screen.findByRole('button', { name: 'Pay ₹4,999' }));

    expect(
      await screen.findByText('Online payment is not switched on yet. Please try again later.'),
    ).toBeInTheDocument();
    expect(openCheckout).not.toHaveBeenCalled();
  });

  it('loads Razorpay’s script ahead of the tap only when something can be paid', async () => {
    listReturns(makePaidPayment());
    const first = renderPayments();
    await screen.findByText('Nothing is due right now.');
    expect(loadCheckoutScript).not.toHaveBeenCalled();
    first.unmount();

    listReturns(makePayment());
    renderPayments();
    await screen.findByRole('button', { name: 'Pay ₹4,999' });
    expect(loadCheckoutScript).toHaveBeenCalled();
  });
});

describe('PaymentsPage — inside the Android app', () => {
  beforeEach(() => enterNativeShell());

  it('shows the same lists, read-only: what is due and what was paid', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    const due = (await screen.findByRole('region', { name: 'Due' })) as HTMLElement;
    expect(within(due).getByText('Dealer Kavach — Nov 2026')).toBeInTheDocument();
    expect(within(due).getByText('₹4,999')).toBeInTheDocument();
    expect(within(due).getByText('Due by 5 Nov 2026')).toBeInTheDocument();

    const history = screen.getByRole('region', { name: 'Paid and earlier' });
    expect(within(history).getByText('Paid on 5 Oct 2026 · UPI')).toBeInTheDocument();
    expect(within(history).getByText('Receipt MDG-2026-00007')).toBeInTheDocument();
  });

  it('has no Pay button and no link, and never loads Razorpay', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    await screen.findByRole('region', { name: 'Due' });
    // Only the bar's Back arrow is a button. Nothing is a link.
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Back',
    ]);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(loadCheckoutScript).not.toHaveBeenCalled();
    expect(openCheckout).not.toHaveBeenCalled();
  });

  it('is read-only in Hindi too', async () => {
    listReturns(makePayment());
    renderPayments('hi');

    await screen.findByRole('region', { name: 'बाकी भुगतान' });
    expect(screen.queryByText(/चुकाएँ/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
