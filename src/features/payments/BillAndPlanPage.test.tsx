import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { translate } from '@/lib/i18n';
import { useLangStore } from '@/store/lang';
import {
  enterNativeShell,
  leaveNativeShell,
  makeAutopayStatus,
  makeCreditNote,
  makeInvoice,
  makePaidPayment,
  makePayment,
} from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerAutopayStatus, DealerPayment, OutletSetupView } from '@dk/shared/types';

import { BILL_LIST_CAP } from './billView';
import { resetCheckoutScript } from './checkout';

/**
 * The new cards of the Bill and plan page (spec 4.8): what needs me, the plan, this year, the papers
 * and who the bills are made out to. The bills table and the autopay row are pinned in
 * `PaymentsPage.test.tsx`; what the Android app may show is pinned in `shellNoPayPath.test.tsx`, and
 * the last block here holds the new cards to the same rules.
 */

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

const { PaymentsPage } = await import('./PaymentsPage');

type Answer = unknown | Error | 'pending';
interface Served {
  items?: DealerPayment[];
  autopay?: DealerAutopayStatus | Error;
  setup?: Partial<OutletSetupView> | Error | 'pending';
  services?: Answer;
}

function serve({ items = [], autopay, setup, services }: Served) {
  vi.mocked(api.get).mockImplementation((async (path: string) => {
    if (path === '/v1/payments/me') return { items };
    if (path === '/v1/payments/me/autopay') {
      if (autopay instanceof Error) throw autopay;
      return autopay ?? makeAutopayStatus(null);
    }
    if (path === '/v1/me/setup') {
      if (setup === 'pending') return new Promise(() => undefined);
      if (setup instanceof Error) throw setup;
      return setup ?? { active: false };
    }
    if (path === '/v1/dealers/d1/services') {
      if (services instanceof Error) throw services;
      return services ?? [];
    }
    if (path.includes('/documents/')) return { url: 'https://s3.test/x.pdf', filename: 'x.pdf' };
    throw new Error(`unexpected GET ${path}`);
  }) as typeof api.get);
}

const SERVICES = [
  { serviceId: 'dsr-report', status: 'ACTIVE' },
  { serviceId: 'credit-dod-monitoring', status: 'ACTIVE' },
  { serviceId: 'iras-password-reset', status: 'ACTIVE' },
  { serviceId: 'stock-check', status: 'PAUSED' },
];

const BILLING = {
  name: 'Sharma Fuels',
  address: '12 Mall Road, Hisar',
  stateCode: '06',
  gstin: '06ABCDE1234F1Z5',
};

function renderPage(lang: 'en' | 'hi' | 'hl' = 'en', role: 'dealer-owner' | 'dealer-staff' = 'dealer-owner') {
  signIn({ dealerId: 'd1', role });
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(<PaymentsPage />, { route: '/payments' });
}

/** A paid, invoiced bill in this financial year (the test clock is the real one: Nov 2026 or later). */
const THIS_YEAR = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 3 ? 0 : -1);
const paidThisYear = (id: string, over: Partial<DealerPayment> = {}) =>
  makePaidPayment({
    id,
    title: `Bill ${id}`,
    amountPaise: 354000,
    dueDate: `${THIS_YEAR}-04-05`,
    paidAt: `${THIS_YEAR}-04-04T05:00:00.000Z`,
    ...over,
  });

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => {
  // Unmount first: a page still mounted when the shell is left would draw Pay buttons on its next read.
  cleanup();
  leaveNativeShell();
  resetCheckoutScript();
  resetStores();
});

describe('Bill and plan — what needs me', () => {
  it('is the first card and says what is due in one sentence with a shape and a word', async () => {
    serve({ items: [makePayment({ amountPaise: 354000, dueDate: '2099-11-30' })] });
    renderPage();

    const card = await screen.findByRole('region', { name: 'Bill due' });
    expect(card).toHaveAttribute('data-verdict', 'attention');
    expect(card.querySelector('svg')).not.toBeNull();
    expect(card.textContent).toMatch(/Bill of Rs.3,540 due on .*Nov, \d+ days left\./);
    // First thing on the page, before the plan and the table.
    const first = document.querySelector('section[aria-label], [role="region"]');
    expect(first).toBe(card);
  });

  it('says nothing is due when everything is paid', async () => {
    serve({ items: [makePaidPayment()] });
    renderPage();
    expect(await screen.findByRole('region', { name: 'Nothing due' })).toBeInTheDocument();
    expect(screen.getByText('Nothing is due.')).toBeInTheDocument();
  });

  it('reads in Hindi and in Hinglish', async () => {
    serve({ items: [makePayment({ amountPaise: 354000, dueDate: '2099-11-30' })] });
    const hi = renderPage('hi');
    expect(await screen.findByRole('region', { name: 'बिल बाकी है' })).toBeInTheDocument();
    hi.unmount();
    renderPage('hl');
    expect(await screen.findByRole('region', { name: 'Bill baaki hai' })).toBeInTheDocument();
  });
});

describe('Bill and plan — the plan', () => {
  it('says the monthly price and its split, worked out from the autopay amount', async () => {
    serve({ items: [makePaidPayment()], autopay: makeAutopayStatus({ amountPaise: 354000 }) });
    renderPage();

    const plan = await screen.findByRole('region', { name: 'Your plan' });
    // Two lines by design: the amount, then the sum behind it (so "GST" never sits alone at 200%).
    expect(within(plan).getByText(/^Rs.3,540 a month$/)).toBeInTheDocument();
    expect(within(plan).getByText(/^= Rs.3,000 \+ 18%.GST$/)).toBeInTheDocument();
    expect(within(plan).queryByText('Taken from your latest bill.')).not.toBeInTheDocument();
  });

  it('follows whatever price the server sends', async () => {
    serve({ items: [makePaidPayment()], autopay: makeAutopayStatus({ amountPaise: 118000 }) });
    renderPage();
    expect(await screen.findByText(/^Rs.1,180 a month$/)).toBeInTheDocument();
    expect(screen.getByText(/^= Rs.1,000 \+ 18%.GST$/)).toBeInTheDocument();
  });

  it('with no autopay, reads the newest subscription bill and says so', async () => {
    serve({ items: [makePayment({ amountPaise: 354000 })] });
    renderPage();

    const plan = await screen.findByRole('region', { name: 'Your plan' });
    expect(within(plan).getByText(/^Rs.3,540 a month/)).toBeInTheDocument();
    expect(within(plan).getByText('Taken from your latest bill.')).toBeInTheDocument();
  });

  it('names the services it covers: running ones, in words, never a raw id, never a background one', async () => {
    serve({
      items: [makePayment()],
      autopay: makeAutopayStatus(),
      services: SERVICES,
    });
    renderPage();

    const plan = await screen.findByRole('region', { name: 'Your plan' });
    // A count that opens to a list, not one run-on paragraph.
    await waitFor(() =>
      expect(within(plan).getByText(/Covers \d+ services?, see all/)).toBeInTheDocument(),
    );
    const list = plan.querySelector('details');
    expect(list?.querySelectorAll('li').length).toBeGreaterThan(1);
    const text = list?.textContent ?? '';
    expect(text).toContain('Daily Sales Report');
    expect(text).toContain('Credit');
    expect(text).not.toMatch(/dsr-report|iras-password-reset|credit-dod-monitoring/);
    // Paused and background ones are left out.
    expect(text).not.toMatch(/password/i);
  });

  it('leaves out the owner-only services for a manager', async () => {
    serve({ items: [makePayment()], services: SERVICES });
    renderPage('en', 'dealer-staff');

    const plan = await screen.findByRole('region', { name: 'Your plan' });
    await waitFor(() =>
      expect(within(plan).getByText(/Covers \d+ services?, see all/)).toBeInTheDocument(),
    );
    const text = plan.querySelector('details')?.textContent ?? '';
    expect(text).toContain('Daily Sales Report');
    expect(text).not.toContain('Credit');
  });

  it('keeps the price when the services list fails, is not an array, or is empty', async () => {
    for (const services of [new ApiError(500, 'INTERNAL', 'boom'), { items: [] }, []]) {
      serve({ items: [makePayment()], services });
      const view = renderPage();
      const plan = await screen.findByRole('region', { name: 'Your plan' });
      expect(within(plan).getByText(/a month$/)).toBeInTheDocument();
      expect(within(plan).queryByText(/see all/)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('is not drawn when there is nothing to read a price from', async () => {
    serve({ items: [makePaidPayment({ purpose: 'setup' })] });
    renderPage();
    await screen.findByRole('region', { name: 'Nothing due' });
    expect(screen.queryByRole('region', { name: 'Your plan' })).not.toBeInTheDocument();
  });
});

describe('Bill and plan — this year', () => {
  it('adds what was paid this financial year and how many bills came on time', async () => {
    serve({
      items: [
        paidThisYear('a'),
        paidThisYear('b', { paidAt: `${THIS_YEAR}-04-20T05:00:00.000Z` }),
        paidThisYear('old', {
          dueDate: `${THIS_YEAR - 3}-04-05`,
          paidAt: `${THIS_YEAR - 3}-04-04T05:00:00.000Z`,
        }),
      ],
    });
    renderPage();

    const card = await screen.findByRole('region', { name: 'This year' });
    expect(within(card).getByText('Paid 2 bills this year')).toBeInTheDocument();
    expect(within(card).getByText('Rs 7,080')).toBeInTheDocument();
    expect(
      within(card).getByText(`April ${THIS_YEAR} to March ${THIS_YEAR + 1}`),
    ).toBeInTheDocument();
    // One bill is a day late, one is on time: a bar and its number.
    expect(within(card).getByText('1 of 2 bills paid on time')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('says so plainly when nothing was paid yet this year', async () => {
    serve({ items: [makePayment()] });
    renderPage();
    const card = await screen.findByRole('region', { name: 'This year' });
    expect(within(card).getByText('Nothing paid yet this year.')).toBeInTheDocument();
  });

  it('hides the GST line when the bills carry no GST number, and words it "GST on your invoices" when they do', async () => {
    const invoice = makeInvoice({
      cgstPaise: 27000,
      sgstPaise: 27000,
      igstPaise: 0,
      issuedAt: `${THIS_YEAR}-04-04T05:00:00.000Z`,
    });
    const note = makeCreditNote({
      cgstPaise: 1000,
      sgstPaise: 1000,
      igstPaise: 0,
      issuedAt: `${THIS_YEAR}-04-10T05:00:00.000Z`,
    });
    const items = [paidThisYear('a', { invoice, creditNotes: [note] })];

    serve({ items, setup: { active: true, billing: { ...BILLING, gstin: null } } });
    const first = renderPage();
    const card = await screen.findByRole('region', { name: 'This year' });
    await screen.findByRole('region', { name: 'Bills are made out to' });
    expect(within(card).queryByText('GST on your invoices')).not.toBeInTheDocument();
    first.unmount();

    serve({ items, setup: { active: true, billing: BILLING } });
    renderPage();
    const card2 = await screen.findByRole('region', { name: 'This year' });
    await waitFor(() => expect(within(card2).getByText('GST on your invoices')).toBeInTheDocument());
    // 54,000 of GST on the invoice, less 2,000 on the credit note.
    expect(within(card2).getByText('Rs 520')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/claim/i);
  });
});

describe('Bill and plan — the table', () => {
  it('says when the list is as long as the server sends, because older bills may be missing', async () => {
    const items = Array.from({ length: BILL_LIST_CAP }, (_, i) =>
      paidThisYear(`b${i}`, { number: `MDG-2026-${1000 + i}` }),
    );
    serve({ items });
    renderPage();

    expect(
      await screen.findByText(/This list shows your newest 100 bills\. Older ones are not shown here/),
    ).toBeInTheDocument();
  });

  it('does not say it for a shorter list', async () => {
    serve({ items: [paidThisYear('a')] });
    renderPage();
    await screen.findByRole('region', { name: 'Your bills' });
    expect(screen.queryByText(/newest 100/)).not.toBeInTheDocument();
  });
});

describe('Bill and plan — papers', () => {
  const items = () => [
    paidThisYear('a', {
      invoice: makeInvoice({ id: 'g1', number: 'MDG/26-27/00001', issuedAt: `${THIS_YEAR}-04-04T05:00:00.000Z` }),
      creditNotes: [makeCreditNote({ id: 'g2', number: 'MDGCN/26-27/0001', issuedAt: `${THIS_YEAR}-04-10T05:00:00.000Z` })],
    }),
  ];

  it('lists every invoice and credit note, newest first, each with a Download in a browser', async () => {
    const user = userEvent.setup();
    serve({ items: items() });
    renderPage();

    const papers = await screen.findByRole('region', { name: /^GST invoices and credit notes/ });
    const rows = within(papers).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Credit note MDGCN/26-27/0001');
    expect(rows[1]?.textContent).toContain('GST invoice MDG/26-27/00001');
    // A credit note is explained in one line.
    expect(within(papers).getByText(/paper for money MDG gave back to you/)).toBeInTheDocument();

    await user.click(
      within(papers).getByRole('button', { name: /Download GST invoice MDG\/26-27\/00001/ }),
    );
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/v1/payments/me/a/documents/g1'),
    );
  });

  it('is still there when no bill has a paper, and says when they will appear', async () => {
    serve({ items: [makePaidPayment()] });
    renderPage();
    const papers = await screen.findByRole('region', { name: /^GST invoices and credit notes/ });
    expect(
      within(papers).getByText('Your GST invoices and credit notes appear here once a bill is paid.'),
    ).toBeInTheDocument();
    expect(within(papers).queryByRole('listitem')).not.toBeInTheDocument();
    expect(within(papers).queryByRole('button')).not.toBeInTheDocument();
  });

  it('in the Android app lists the papers as text and sends the owner to the bill, with no button', async () => {
    enterNativeShell();
    serve({ items: items() });
    renderPage();

    const papers = await screen.findByRole('region', { name: /^GST invoices and credit notes/ });
    expect(within(papers).getAllByRole('listitem')).toHaveLength(2);
    expect(within(papers).queryByRole('button')).not.toBeInTheDocument();
    expect(within(papers).getByText(/open its bill in the list above/)).toBeInTheDocument();
  });
});

describe('Bill and plan — bills are made out to', () => {
  it('shows the name, the address with its state, and the GST number, read-only', async () => {
    serve({ items: [makePayment()], setup: { active: true, billing: BILLING } });
    renderPage();

    const card = await screen.findByRole('region', { name: 'Bills are made out to' });
    expect(within(card).getByText('Sharma Fuels')).toBeInTheDocument();
    expect(within(card).getByText(/12 Mall Road, Hisar, /)).toBeInTheDocument();
    expect(within(card).getByText('GST number 06ABCDE1234F1Z5')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  });

  it('says "No GST number" rather than an empty line', async () => {
    serve({ items: [makePayment()], setup: { active: true, billing: { ...BILLING, gstin: null } } });
    renderPage();
    expect(await screen.findByText('No GST number')).toBeInTheDocument();
  });

  it('says nothing is saved yet when the setup view has no billing details', async () => {
    serve({ items: [makePayment()], setup: { active: false, billing: null } });
    renderPage();
    const card = await screen.findByRole('region', { name: 'Bills are made out to' });
    expect(within(card).getByText('No billing details are saved yet.')).toBeInTheDocument();
  });

  it('is left out when the setup view fails or is slow, and the bills still show', async () => {
    for (const setup of [new ApiError(500, 'INTERNAL', 'boom'), 'pending' as const]) {
      serve({ items: [makePayment()], setup });
      const view = renderPage();
      await screen.findByRole('region', { name: 'Your bills' });
      expect(screen.queryByRole('region', { name: 'Bills are made out to' })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('Bill and plan — a manager', () => {
  it('sees the same page without autopay, and is not asked about it', async () => {
    serve({ items: [makePayment()], autopay: makeAutopayStatus() });
    renderPage('en', 'dealer-staff');

    await screen.findByRole('region', { name: 'Your bills' });
    expect(screen.queryByRole('link', { name: /^Autopay/ })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/v1/payments/me/autopay');
  });
});

describe('Bill and plan — the new cards inside the Android app', () => {
  const BANNED =
    /razorpay|website|web site|browser|payment link|pay (online|here|at|on|via|using|through)|chrome|वेबसाइट|ब्राउज़र|लिंक/;

  it.each(['en', 'hi', 'hl'] as const)(
    'offer no way to pay and no pointer to one, with every card on the page (%s)',
    async (lang) => {
      enterNativeShell();
      serve({
        items: [
          makePayment({ amountPaise: 354000, dueDate: '2099-11-30' }),
          paidThisYear('a', {
            invoice: makeInvoice({ id: 'g1', issuedAt: `${THIS_YEAR}-04-04T05:00:00.000Z` }),
            creditNotes: [makeCreditNote({ id: 'g2', issuedAt: `${THIS_YEAR}-04-10T05:00:00.000Z` })],
          }),
        ],
        autopay: makeAutopayStatus(),
        setup: { active: true, billing: BILLING },
        services: SERVICES,
      });
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const { container } = renderPage(lang);

      await screen.findByRole('region', { name: /^(GST invoices and credit notes|GST invoice aur credit note|GST इनवॉइस और क्रेडिट नोट)/ });
      await waitFor(() => expect(container.textContent).toMatch(/Sharma Fuels/));

      // Only the bar's Back arrow is a button.
      expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([translate(lang, 'common.back')]);
      // The only links: the receipt of the paid bill and the Autopay row. Nothing leads anywhere else.
      expect(
        Array.from(container.querySelectorAll('a'))
          .map((a) => a.getAttribute('href'))
          .sort(),
      ).toEqual(['/payments/a', '/settings/autopay']);
      expect(container.querySelectorAll('form, iframe, a:not([href])')).toHaveLength(0);
      expect((container.textContent ?? '').toLowerCase()).not.toMatch(BANNED);
      expect(document.documentElement.outerHTML).not.toMatch(/razorpay/i);
      expect(api.post).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    },
  );
});

describe('Bill and plan — the Pay button sits in the banner', () => {
  it('has one "Pay now" in the banner, under the sentence, and none in the row', async () => {
    serve({ items: [makePayment({ amountPaise: 118000, dueDate: '2099-11-30' })] });
    renderPage();

    const banner = await screen.findByRole('region', { name: 'Bill due' });
    const pay = within(banner).getByRole('button', { name: 'Pay now, ₹1,180' });
    expect(pay).toHaveTextContent(/^Pay now$/);
    expect(screen.getAllByRole('button', { name: /Pay now/ })).toHaveLength(1);
    // The amount: once in the banner's sentence, once on the bill's row, and not on any button.
    expect(banner.textContent).toMatch(/Rs.1,180/);
    expect(banner.compareDocumentPosition(pay) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
  });

  it('still gives every other open bill its own Pay now', async () => {
    serve({
      items: [
        makePayment({ id: 'a', amountPaise: 118000, dueDate: '2099-11-30' }),
        makePayment({ id: 'b', amountPaise: 118000, dueDate: '2099-12-30', title: 'Dealer Kavach, December' }),
      ],
    });
    renderPage();
    await screen.findByRole('region', { name: 'Bill due' });
    expect(screen.getAllByRole('button', { name: /Pay now/ })).toHaveLength(2);
  });

  it('says "Bill bharein" in Hinglish and "बिल भरें" in Hindi', async () => {
    serve({ items: [makePayment({ amountPaise: 118000, dueDate: '2099-11-30' })] });
    const hi = renderPage('hi');
    expect(await screen.findByRole('button', { name: 'बिल भरें, ₹1,180' })).toHaveTextContent('बिल भरें');
    hi.unmount();
    renderPage('hl');
    expect(await screen.findByRole('button', { name: 'Bill bharein, ₹1,180' })).toBeInTheDocument();
  });

  it('draws no button in the banner inside the Android app', async () => {
    enterNativeShell();
    serve({ items: [makePayment({ amountPaise: 118000, dueDate: '2099-11-30' })] });
    renderPage();
    const banner = await screen.findByRole('region', { name: 'Bill due' });
    expect(within(banner).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Bill and plan — the plan and the bills read in the reader\'s language', () => {
  it('shows the plan price on two lines and the services behind a count, in Hindi', async () => {
    serve({ items: [makePayment({ amountPaise: 118000 })], autopay: makeAutopayStatus({ amountPaise: 118000 }), services: SERVICES });
    renderPage('hi');

    const plan = await screen.findByRole('region', { name: 'आपका प्लान' });
    expect(within(plan).getByText(/^₹1,180 हर महीने$/)).toBeInTheDocument();
    expect(within(plan).getByText(/^= ₹1,000 \+ 18%.GST$/)).toBeInTheDocument();
    await waitFor(() => expect(within(plan).getByText(/सेवाएँ शामिल हैं, सब देखें/)).toBeInTheDocument());
  });

  it('opens a short list by itself and keeps a long one closed', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      serviceId: ['dsr-report', 'credit-dod-monitoring', 'stock-check', 'fuel-orders', 'load-planner', 'mock-drill'][i],
      status: 'ACTIVE',
    }));
    serve({ items: [makePayment()], autopay: makeAutopayStatus(), services: many });
    renderPage();
    const plan = await screen.findByRole('region', { name: 'Your plan' });
    await waitFor(() => expect(plan.querySelector('details')).not.toBeNull());
    expect(plan.querySelector('details')?.hasAttribute('open')).toBe(false);
  });

  it('writes a bill\'s name from its month in Hindi', async () => {
    serve({ items: [makePayment({ title: 'Dealer Kavach, November', dueDate: '2099-11-30' })] });
    renderPage('hi');
    const table = within(await screen.findByRole('region', { name: 'आपके बिल' }));
    expect(table.getByText('Dealer Kavach, नवंबर 2099')).toBeInTheDocument();
    expect(table.queryByText(/November/)).not.toBeInTheDocument();
  });
});

describe('Bill and plan — this year says what happened in words', () => {
  it('says a single late bill was late, with no empty bar beside the amount paid', async () => {
    serve({
      items: [paidThisYear('a', { amountPaise: 118000, paidAt: `${THIS_YEAR}-04-09T05:00:00.000Z` })],
    });
    renderPage();
    const card = await screen.findByRole('region', { name: 'This year' });
    expect(within(card).getByText('Paid 1 bill this year')).toBeInTheDocument();
    expect(within(card).getByText('Rs 1,180')).toBeInTheDocument();
    expect(within(card).getByText('It was paid late.')).toBeInTheDocument();
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('says all were on time when they all were', async () => {
    serve({ items: [paidThisYear('a'), paidThisYear('b')] });
    renderPage();
    const card = await screen.findByRole('region', { name: 'This year' });
    expect(within(card).getByText('All 2 were paid on time.')).toBeInTheDocument();
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('Bill and plan — autopay, the papers and the billing name are always on the page', () => {
  it('has an Autopay row that says it is not on, and opens the Autopay screen', async () => {
    serve({ items: [makePayment()] });
    renderPage();
    const row = await screen.findByRole('link', { name: /^Autopay/ });
    expect(within(row).getByText('Not on at this pump.')).toBeInTheDocument();
    expect(row).toHaveAttribute('href', '/settings/autopay');
  });

  it('has the same row in Hindi', async () => {
    serve({ items: [makePayment()] });
    renderPage('hi');
    const row = await screen.findByRole('link', { name: /^ऑटोपे/ });
    expect(within(row).getByText('इस पंप पर ऑटोपे चालू नहीं है।')).toBeInTheDocument();
  });

  it('has the papers block with a calm line when there are none, in Hindi too', async () => {
    serve({ items: [makePayment()] });
    renderPage('hi');
    const papers = await screen.findByRole('region', { name: 'GST इनवॉइस और क्रेडिट नोट' });
    expect(
      within(papers).getByText('बिल चुकाने के बाद आपके GST इनवॉइस और क्रेडिट नोट यहाँ दिखेंगे।'),
    ).toBeInTheDocument();
  });
});
