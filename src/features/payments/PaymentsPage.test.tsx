import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { resetEmbeddedForTests } from '@/lib/embedMode';
import { useLangStore } from '@/store/lang';
import {
  enterNativeShell,
  leaveNativeShell,
  makeAutopayStatus,
  makeCheckout,
  makePaidPayment,
  makePayment,
} from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerAutopayStatus, DealerPayment } from '@dk/shared/types';

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

/** The table of bills: one card, whatever its state (open bills first, then what was paid). */
const bills = () => screen.findByRole('region', { name: 'Your bills' });
/** One bill's row, found by its title. */
const rowOf = (title: string) => within(screen.getByText(title).closest('li') as HTMLElement);

function listReturns(...items: DealerPayment[]) {
  vi.mocked(api.get).mockResolvedValue({ items });
}

function renderPayments(lang: 'en' | 'hi' = 'en', role: 'dealer-owner' | 'dealer-staff' = 'dealer-owner') {
  signIn({ dealerId: 'd1', role });
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
    expect(screen.getByText('Bill and plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('says it could not load, rather than "no payments", and offers to try again', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'boom'));
    renderPayments();

    expect(await screen.findByText("We couldn't show your payments just now")).toBeInTheDocument();
    expect(
      screen.queryByText('Your first bill appears after your services start.'),
    ).not.toBeInTheDocument();

    listReturns(makePayment());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Dealer Kavach, November 2026')).toBeInTheDocument();
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
    // Keys may be switched on at any moment: a way to look again is always there.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('looks again from the "not switched on yet" screen, and shows the bills once they are on', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not configured'),
    );
    renderPayments();
    expect(await screen.findByText('Payments are not switched on yet')).toBeInTheDocument();

    listReturns(makePayment());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Dealer Kavach, November 2026')).toBeInTheDocument();
  });

  // A proxy answering during a restart, or a busy Razorpay, is a 503 too. It is
  // not "switched off": it passes, and the screen says so.
  it.each(['HTTP_503', 'RAZORPAY_UNREACHABLE', 'SERVICE_UNAVAILABLE'])(
    'does not call a 503 %s "not switched on", and says to try again in a minute',
    async (code) => {
      vi.mocked(api.get).mockRejectedValue(new ApiError(503, code, 'Service Unavailable'));
      renderPayments();

      expect(await screen.findByText("We couldn't show your payments just now")).toBeInTheDocument();
      expect(screen.queryByText('Payments are not switched on yet')).not.toBeInTheDocument();
      expect(
        screen.getByText('The payment service did not answer. Please try again in a minute.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    },
  );

  it('shows an empty state when the pump has no payments at all', async () => {
    listReturns();
    renderPayments();

    expect(
      await screen.findByText('Your first bill appears after your services start.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Due')).not.toBeInTheDocument();
  });

  it('says nothing is due when everything is paid, and still lists what was paid', async () => {
    listReturns(makePaidPayment());
    renderPayments();

    expect(await screen.findByText('Nothing is due.')).toBeInTheDocument();
    expect(screen.getByText('Dealer Kavach, October 2026')).toBeInTheDocument();
  });
});

describe('PaymentsPage — in a browser', () => {
  it('shows what is due as a row of the table: its name, amount, date, status and a Pay button', async () => {
    listReturns(makePayment({ note: 'ignored on the list' }), makePaidPayment());
    renderPayments();

    const table = within(await bills());
    const row = rowOf('Dealer Kavach, November 2026');
    expect(table.getByText('Dealer Kavach, November 2026')).toBeInTheDocument();
    expect(row.getByText('Rs 4,999')).toBeInTheDocument();
    expect(row.getByText('Due by 5 Nov 2026')).toBeInTheDocument();
    // The status is a shape and a word, in the kit's pill.
    expect(row.getByText('Due').closest('[data-status]')).toHaveAttribute('data-status', 'attention');
    // The one Pay button sits in the banner under "Bill due", not in the row: the amount is on the
    // screen once in the banner's sentence and once on the row, never a third time on a button.
    expect(row.queryByRole('button')).not.toBeInTheDocument();
    const pay = screen.getByRole('button', { name: 'Pay now, ₹4,999' });
    expect(pay.closest('[data-verdict]')).not.toBeNull();
    expect(pay).toHaveTextContent('Pay now');
    expect(pay).not.toHaveTextContent('4,999');
  });

  it('shows what was paid in the same table, with its status, date, method and receipt number', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    await bills();
    const row = rowOf('Dealer Kavach, October 2026');
    // Paid on 5 Oct, due 5 Nov: on time.
    expect(row.getByText('Paid on time')).toBeInTheDocument();
    expect(row.getByText('Paid on 5 Oct 2026 · UPI')).toBeInTheDocument();
    expect(row.getByText('Receipt MDG-2026-00007')).toBeInTheDocument();
    // Nothing to pay on a payment already paid.
    expect(row.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says "Paid late" when the money came after the due day', async () => {
    listReturns(makePaidPayment({ dueDate: '2026-09-30' }));
    renderPayments();

    await bills();
    expect(rowOf('Dealer Kavach, October 2026').getByText('Paid late')).toBeInTheDocument();
  });

  it('shows refunded, part refunded and cancelled payments in plain words, with no Pay button', async () => {
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

    const table = within(await bills());
    expect(table.getByText('Refunded')).toBeInTheDocument();
    expect(table.getByText('Part refunded')).toBeInTheDocument();
    expect(table.getByText('Cancelled')).toBeInTheDocument();
    expect(table.getByText('Rs 500 refunded')).toBeInTheDocument();
    expect(table.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens a payment’s own page from its row', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    const table = within(await bills());
    const links = table.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href')).sort()).toEqual(['/payments/p1', '/payments/p2']);
    expect(rowOf('Dealer Kavach, November 2026').getByRole('link')).toHaveAttribute('href', '/payments/p1');
  });

  it('lists the soonest due date first, and a payment with no date last', async () => {
    listReturns(
      makePayment({ id: 'a', title: 'No date', dueDate: null }),
      makePayment({ id: 'b', title: 'Later', dueDate: '2026-12-01' }),
      makePayment({ id: 'c', title: 'Sooner', dueDate: '2026-11-02' }),
    );
    renderPayments();

    const titles = within(await bills())
      .getAllByRole('link')
      .map((a) => a.textContent ?? '');
    expect(titles[0]).toContain('Sooner');
    expect(titles[1]).toContain('Later');
    expect(titles[2]).toContain('No date');
  });

  it('puts what is open above what was paid, inside a year, and the newest year first', async () => {
    listReturns(
      makePaidPayment({ id: 'old', title: 'Paid 2025', dueDate: '2025-12-05', paidAt: '2025-12-04T05:00:00.000Z' }),
      makePaidPayment({ id: 'mid', title: 'Paid 2026', dueDate: '2026-09-05', paidAt: '2026-09-04T05:00:00.000Z' }),
      makePayment({ id: 'open', title: 'Open 2026', dueDate: '2026-11-05' }),
    );
    renderPayments();

    const table = within(await bills());
    expect(table.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['2026', '2025']);
    expect(table.getAllByRole('link').map((a) => a.textContent ?? '')).toEqual([
      expect.stringContaining('Open 2026'),
      expect.stringContaining('Paid 2026'),
      expect.stringContaining('Paid 2025'),
    ]);
  });

  it('has no Pay button on a payment that is already being confirmed', async () => {
    listReturns(makePayment({ status: 'processing' }));
    renderPayments();

    await bills();
    const row = rowOf('Dealer Kavach, November 2026');
    expect(row.getByText('Being confirmed')).toBeInTheDocument();
    expect(
      row.getByText('Your payment is being confirmed. You will get a message when it is done.'),
    ).toBeInTheDocument();
    expect(row.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('is in Hindi by default', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments('hi');

    expect(await screen.findByRole('region', { name: 'आपके बिल' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'बिल भरें, ₹4,999' })).toBeInTheDocument();
    expect(screen.getByText('समय पर चुकाया')).toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: 'Pay now, ₹4,999' }));

    await waitFor(() => expect(openCheckout).toHaveBeenCalledWith(makeCheckout()));
    expect(api.post).toHaveBeenCalledWith('/v1/payments/me/p1/checkout');
    expect(await screen.findByText('Payment received. Thank you.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Pay now, ₹4,999' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Nothing is due.')).toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: 'Pay now, ₹4,999' }));

    expect(
      await screen.findByText('The payment was not completed. You can try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay now, ₹4,999' })).toBeEnabled();
  });

  it('says payments are not switched on when the server has no Razorpay keys', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ items: [makePayment()] });
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not configured'),
    );
    renderPayments();

    await user.click(await screen.findByRole('button', { name: 'Pay now, ₹4,999' }));

    expect(
      await screen.findByText('Online payment is not switched on yet. Please try again later.'),
    ).toBeInTheDocument();
    expect(openCheckout).not.toHaveBeenCalled();
  });

  it('loads Razorpay’s script ahead of the tap only when something can be paid', async () => {
    listReturns(makePaidPayment());
    const first = renderPayments();
    await screen.findByText('Nothing is due.');
    expect(loadCheckoutScript).not.toHaveBeenCalled();
    first.unmount();

    listReturns(makePayment());
    renderPayments();
    await screen.findByRole('button', { name: 'Pay now, ₹4,999' });
    expect(loadCheckoutScript).toHaveBeenCalled();
  });
});

describe('PaymentsPage — inside the Android app', () => {
  beforeEach(() => enterNativeShell());

  it('shows the same table, read-only: what is due and what was paid', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    await bills();
    const due = rowOf('Dealer Kavach, November 2026');
    expect(due.getByText('Rs 4,999')).toBeInTheDocument();
    expect(due.getByText('Due by 5 Nov 2026')).toBeInTheDocument();

    const paid = rowOf('Dealer Kavach, October 2026');
    expect(paid.getByText('Paid on 5 Oct 2026 · UPI')).toBeInTheDocument();
    expect(paid.getByText('Receipt MDG-2026-00007')).toBeInTheDocument();
  });

  it('has no Pay button and no link on what is due, and never loads Razorpay', async () => {
    listReturns(makePayment(), makePaidPayment());
    renderPayments();

    await bills();
    // Only the bar's Back arrow is a button.
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Back',
    ]);
    // What is due leads nowhere.
    expect(rowOf('Dealer Kavach, November 2026').queryAllByRole('link')).toHaveLength(0);
    expect(loadCheckoutScript).not.toHaveBeenCalled();
    expect(openCheckout).not.toHaveBeenCalled();
  });

  it('opens the receipt of a paid payment, and of a refunded one, but not of a due or processing one', async () => {
    listReturns(
      makePayment(),
      makePayment({ id: 'p4', number: 'MDG-2026-00013', status: 'processing' }),
      makePaidPayment(),
      makePaidPayment({ id: 'p5', status: 'partially_refunded', refundedPaise: 50000 }),
      makePaidPayment({ id: 'p6', status: 'refunded', refundedPaise: 499900 }),
      makePayment({ id: 'p7', status: 'cancelled' }),
    );
    renderPayments();

    await bills();
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .sort();
    // The three that took money. Not due (p1), not processing (p4), not cancelled (p7).
    expect(hrefs).toEqual(['/payments/p2', '/payments/p5', '/payments/p6']);
    // Still no Pay button anywhere.
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('is read-only in Hindi too', async () => {
    listReturns(makePayment());
    renderPayments('hi');

    await screen.findByRole('region', { name: 'आपके बिल' });
    expect(screen.queryByText(/चुकाएँ/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

const AUTOPAY_PATH = '/v1/payments/me/autopay';

/** The server answers by address: the bills, and the owner's autopay (`'pending'` never answers). */
function serveWithAutopay(
  items: DealerPayment[],
  autopay: DealerAutopayStatus | Error | 'pending' = makeAutopayStatus(),
) {
  vi.mocked(api.get).mockImplementation((async (path: string) => {
    if (path === '/v1/payments/me') return { items };
    if (path === AUTOPAY_PATH) {
      if (autopay === 'pending') return new Promise(() => undefined);
      if (autopay instanceof Error) throw autopay;
      return autopay;
    }
    throw new Error(`unexpected GET ${path}`);
  }) as typeof api.get);
}

describe('PaymentsPage — the autopay card', () => {
  const card = () => screen.queryByRole('link', { name: /^Autopay/ });

  it('sits above the table of bills, and says what autopay is doing', async () => {
    serveWithAutopay([makePayment(), makePaidPayment()]);
    renderPayments();

    const autopay = await screen.findByRole('link', { name: /^Autopay/ });
    expect(within(autopay).getByText('Rs 3,540')).toBeInTheDocument();
    expect(within(autopay).getByText('On')).toBeInTheDocument();
    expect(within(autopay).getByText('Rs 3,540 a month · next 24 Nov')).toBeInTheDocument();
    const table = await bills();
    expect(autopay.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(AUTOPAY_PATH);
  });

  it('opens the Autopay screen', async () => {
    serveWithAutopay([makePayment()]);
    renderPayments();
    expect(await screen.findByRole('link', { name: /^Autopay/ })).toHaveAttribute(
      'href',
      '/settings/autopay',
    );
  });

  it.each([
    [{ state: 'setting_up', nextDebitOn: null }, 'Waiting', 'Waiting for your approval'],
    [{ state: 'on' }, 'On', 'Rs 3,540 a month · next 24 Nov'],
    [{ state: 'failing' }, 'Needs attention', 'Last payment did not go through'],
    [{ state: 'off', nextDebitOn: null }, 'Off', 'Off · works till 24 Nov'],
  ] as const)('wears the chip for %o', async (over, chip, line) => {
    serveWithAutopay([makePayment()], makeAutopayStatus(over));
    renderPayments();

    const autopay = await screen.findByRole('link', { name: /^Autopay/ });
    expect(within(autopay).getByText(chip)).toBeInTheDocument();
    expect(within(autopay).getByText(line)).toBeInTheDocument();
  });

  // One family of pills: the kit's shape and word, the same for a bill and for autopay.
  it('wears the same pill as a bill that needs a look, a shape with a word, never red', async () => {
    serveWithAutopay([makePayment()], makeAutopayStatus({ state: 'failing' }));
    renderPayments();
    const chip = (await screen.findByText('Needs attention')).closest('[data-status]') as HTMLElement;
    expect(chip).toHaveAttribute('data-status', 'attention');
    expect(chip.querySelector('svg')).not.toBeNull();
    const bill = screen.getByText('Due').closest('[data-status]') as HTMLElement;
    expect(bill.className).toBe(chip.className);
    expect(chip.className).not.toMatch(/danger|red/);
  });

  it('is in Hindi', async () => {
    serveWithAutopay([makePayment()]);
    renderPayments('hi');

    const autopay = await screen.findByRole('link', { name: /^ऑटोपे/ });
    expect(within(autopay).getByText('चालू')).toBeInTheDocument();
    expect(within(autopay).getByText(/^₹3,540 हर महीने · अगली 24 नव/)).toBeInTheDocument();
  });

  it('stays above the empty state too', async () => {
    serveWithAutopay([]);
    renderPayments();
    expect(
      await screen.findByText('Your first bill appears after your services start.'),
    ).toBeInTheDocument();
    expect(card()).toBeInTheDocument();
  });

  // The row is always there once the server has said so, so the Autopay screen is not a hidden
  // address: with no autopay it says "Not on at this pump" and still opens that screen.
  it('says it is not on when the owner has no autopay, and still opens the Autopay screen', async () => {
    serveWithAutopay([makePayment()], makeAutopayStatus(null));
    renderPayments();
    await bills();
    const autopay = await screen.findByRole('link', { name: /^Autopay/ });
    expect(within(autopay).getByText('Not on at this pump.')).toBeInTheDocument();
    expect(autopay).toHaveAttribute('href', '/settings/autopay');
    expect(within(autopay).queryByText(/₹|Rs/)).not.toBeInTheDocument();
  });

  it('is not there for a manager, who is not even asked about it', async () => {
    serveWithAutopay([makePayment()]);
    renderPayments('en', 'dealer-staff');
    await bills();
    expect(card()).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith(AUTOPAY_PATH);
  });

  it('is not there while it loads, and the bills do not wait on it', async () => {
    serveWithAutopay([makePayment()], 'pending');
    renderPayments();
    const due = await bills();
    expect(within(due).getByText('Dealer Kavach, November 2026')).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });

  // Not silently gone: the card stays, says it could not load, and opens the
  // Autopay screen, which has its own Try again.
  it('is still there when it fails, saying so, and the bills still show', async () => {
    serveWithAutopay([makePayment()], new ApiError(500, 'INTERNAL', 'boom'));
    renderPayments();
    await bills();
    const autopay = await screen.findByRole('link', { name: /^Autopay/ });
    expect(within(autopay).getByText('Could not load just now. Tap to open.')).toBeInTheDocument();
    expect(autopay).toHaveAttribute('href', '/settings/autopay');
    expect(within(autopay).queryByText(/₹/)).not.toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your autopay")).not.toBeInTheDocument();
  });

  it('says the same in Hindi when it fails', async () => {
    serveWithAutopay([makePayment()], new ApiError(0, 'TIMEOUT', 'Request timed out'));
    renderPayments('hi');
    const autopay = await screen.findByRole('link', { name: /^ऑटोपे/ });
    expect(within(autopay).getByText('अभी लोड नहीं हुआ। खोलने के लिए छुएँ।')).toBeInTheDocument();
  });

  it('is not drawn for a manager when nothing was asked', async () => {
    serveWithAutopay([makePayment()], new ApiError(500, 'INTERNAL', 'boom'));
    renderPayments('en', 'dealer-staff');
    await bills();
    expect(card()).not.toBeInTheDocument();
  });

  it('is there inside the Android app too, where it is only shown and stopped', async () => {
    enterNativeShell();
    serveWithAutopay([makePayment(), makePaidPayment()]);
    renderPayments();

    expect(await screen.findByRole('link', { name: /^Autopay/ })).toBeInTheDocument();
    // Still no Pay button anywhere on the page.
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });
});

describe('PaymentsPage — a bill waiting for its autopay approval', () => {
  const WAITING = 'Waiting for your autopay approval. Nothing has been taken yet.';

  it('shows the line instead of a Pay button in a browser', async () => {
    listReturns(makePayment({ waitingForAutopayApproval: true }));
    renderPayments();

    const table = within(await bills());
    expect(table.getByText(WAITING)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('keeps the Pay button on a neighbouring bill that is not waiting', async () => {
    listReturns(
      makePayment({ id: 'a', title: 'Waiting one', waitingForAutopayApproval: true }),
      makePayment({ id: 'b', title: 'Plain one', dueDate: '2026-12-01' }),
    );
    renderPayments();

    const table = within(await bills());
    expect(table.getAllByText(WAITING)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Pay/ })).toHaveLength(1);
  });

  it('shows the line in the Android app too, with no link and no Pay button', async () => {
    enterNativeShell();
    listReturns(makePayment({ waitingForAutopayApproval: true }));
    renderPayments();

    // Said twice: in the sentence at the top, and on the bill's own row.
    const lines = await screen.findAllByText(WAITING);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.textContent).not.toMatch(/link|pay now|pay here/i);
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });
});

describe('PaymentsPage — a due bill that autopay will take', () => {
  // The debit day has gone and the bill is still due: autopay is trying again.
  it('says autopay is trying again once its day has passed, with no Pay button', async () => {
    listReturns(makePayment({ autopayOn: '2020-10-28' }));
    renderPayments();

    const due = await bills();
    expect(
      within(due).getByText('Autopay could not take this yet. It is trying again.'),
    ).toBeInTheDocument();
    expect(within(due).queryByText(/Autopay will take this/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();
  });

  it('reads "Autopay will take this on …" in place of the due date', async () => {
    listReturns(makePayment({ autopayOn: '2036-10-28' }));
    renderPayments();

    const due = await bills();
    expect(within(due).getByText('Autopay will take this on 28 Oct')).toBeInTheDocument();
    expect(within(due).queryByText(/Due by/)).not.toBeInTheDocument();
  });

  it('says it in Hindi', async () => {
    listReturns(makePayment({ autopayOn: '2036-10-28' }));
    renderPayments('hi');

    const due = (await screen.findByRole('region', { name: 'आपके बिल' })) as HTMLElement;
    expect(within(due).getByText(/^ऑटोपे 28 अक्तूबर को काटेगा$/)).toBeInTheDocument();
    expect(within(due).queryByText(/तक देना है/)).not.toBeInTheDocument();
  });

  it('changes only the bill autopay is on for', async () => {
    listReturns(
      makePayment({ id: 'a', title: 'With autopay', autopayOn: '2036-10-28' }),
      makePayment({ id: 'b', title: 'Without', autopayOn: null, dueDate: '2026-12-01' }),
    );
    renderPayments();

    const due = await bills();
    expect(within(due).getAllByText('Autopay will take this on 28 Oct')).toHaveLength(1);
    expect(within(due).getByText('Due by 1 Dec 2026')).toBeInTheDocument();
  });

  it('offers no Pay button in a browser, so the bill is not paid twice', async () => {
    listReturns(
      makePayment({ id: 'a', title: 'With autopay', autopayOn: '2036-10-28' }),
      makePayment({ id: 'b', title: 'Without', autopayOn: null, dueDate: '2026-12-01' }),
    );
    renderPayments();

    const due = await bills();
    expect(within(due).getAllByRole('button', { name: /Pay/ })).toHaveLength(1);
  });

  it('reads the same inside the Android app', async () => {
    enterNativeShell();
    listReturns(makePayment({ autopayOn: '2036-10-28' }));
    renderPayments();

    const due = await bills();
    expect(within(due).getByText('Autopay will take this on 28 Oct')).toBeInTheDocument();
  });
});

describe('PaymentsPage — the back arrow when Payments was the first thing opened', () => {
  function renderCold() {
    signIn({ dealerId: 'd1', role: 'dealer-owner' });
    useLangStore.setState({ lang: 'en', explicit: true });
    vi.mocked(api.get).mockResolvedValue({ items: [] });
    return renderWithProviders(
      <Routes>
        <Route path="/" element={<div>today-page</div>} />
        <Route path="/chat" element={<div>chat-list</div>} />
        <Route path="/payments" element={<PaymentsPage />} />
      </Routes>,
      { route: '/payments', withRouter: true },
    );
  }

  it('goes to Today, the app\'s home', async () => {
    renderCold();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('today-page')).toBeInTheDocument();
    expect(screen.queryByText('chat-list')).not.toBeInTheDocument();
  });

  it('goes to the chat list in the extension\'s panel, which has no Today', async () => {
    window.sessionStorage.setItem('dk.embed', 'extension');
    resetEmbeddedForTests({ framed: true });
    try {
      renderCold();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(await screen.findByText('chat-list')).toBeInTheDocument();
    } finally {
      window.sessionStorage.removeItem('dk.embed');
      resetEmbeddedForTests();
    }
  });
});
