import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { api } from '@/lib/api';
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
import type { DealerAutopayStatus, DealerPayment } from '@dk/shared/types';

import { CHECKOUT_SCRIPT_URL, resetCheckoutScript } from './checkout';
import { formatDayMonth } from './paymentView';

/**
 * THE POLICY TEST (ADR 0022 §1).
 *
 * Google Play's Payments policy forbids an app that sells software to lead a
 * user to any other way of paying — "in-app webviews, buttons, links,
 * messaging". Dealer Kavach on Play is a WebView of this web app, so the whole
 * rule is that the page, as the Android app renders it, offers no way to pay and
 * no pointer towards one. These tests render the real routes inside the app's
 * real layout and look at EVERYTHING on the page — every element, every
 * attribute, every word — rather than at the one button a developer thought of.
 *
 * The same page in a browser is rendered alongside as a control, so a test that
 * stops finding the Pay button cannot pass by finding nothing at all.
 *
 * TWO THINGS MAY BE PRESSED IN THE APP, both for money already paid:
 *   - the Download button of a GST invoice or credit note, beside the Back arrow
 *     (ADR 0022 §11); and
 *   - on the Payments list, a PAID row, which opens that payment's receipt
 *     (§9) — so the Settings promise of "receipts and GST invoices" can be kept.
 * These tests are what keep either from being the thin end of a pay path: the
 * buttons and the links allowed on a page are written out in full, a row that is
 * still due or processing is never one of them, and everything else on the page
 * is held to the same rules as before.
 *
 * AUTOPAY IS SHOWN AND STOPPED, NEVER STARTED (ADR 0022 §13). Two more things
 * may be pressed or opened in the app, and the tests below hold them to the same
 * standard: the Autopay card on the Payments list, a link to `/settings/autopay`;
 * and that screen, whose one button ends an autopay (its dialog has chips, a help
 * line and the stop, and nothing else). Neither may offer to turn autopay on,
 * link anywhere else, or say how.
 */

// The shell's own side effects (sockets, push) are not what this file is about.
vi.mock('@/AppShell', async () => {
  const { Outlet } = await import('react-router-dom');
  return { AppShell: () => <Outlet /> };
});
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

const DUE = makePayment({ note: 'Includes setup' });
const PAID = makePaidPayment();
// Paid, invoiced, and part refunded with a credit note: both kinds of document.
const INVOICED = makePaidPayment({
  id: 'p3',
  number: 'MDG-2026-00008',
  title: 'Dealer Kavach — Sep 2026',
  status: 'partially_refunded',
  refundedPaise: 50000,
  invoice: makeInvoice(),
  creditNotes: [makeCreditNote()],
});
// What each route shows that proves its page has drawn.
const MARKER = {
  '/payments': 'Dealer Kavach — Nov 2026',
  '/payments/p1': 'Dealer Kavach — Nov 2026',
  '/payments/p2': 'MDG-2026-00007',
  '/payments/p3': 'MDG-2026-00008',
} as const;
const DOWNLOAD_LINK = { url: 'https://s3.test/gst/invoice?sig=abc', filename: 'MDG-26-27-00001.pdf' };

const AUTOPAY_PATH = '/v1/payments/me/autopay';

/** The server's answers by address. With no `autopay`, that address is not served (nothing to show). */
function serve(items: DealerPayment[], autopay?: DealerAutopayStatus) {
  vi.mocked(api.get).mockImplementation((async (path: string) => {
    if (path === AUTOPAY_PATH) {
      if (!autopay) throw new Error(`unexpected GET ${path}`);
      return autopay;
    }
    if (path === '/v1/payments/me') return { items };
    if (path.includes('/documents/')) return DOWNLOAD_LINK;
    const id = path.split('/').pop();
    const found = items.find((p) => p.id === id);
    if (!found) throw new Error(`unexpected GET ${path}`);
    return found;
  }) as typeof api.get);
}

/**
 * Open a route in the real App and wait until the page — a lazy chunk, which
 * the first test in a file has to compile — has drawn the payment it was asked
 * to show. The generous limit is for that first compile, not for the page.
 */
async function openRoute(route: string, marker: string, lang: 'en' | 'hi' = 'en') {
  signIn({ dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  const view = renderWithProviders(<App />, { route });
  await screen.findByText(marker, undefined, { timeout: 10_000 });
  return view;
}

/** Every attribute of every element on the page, as `tag@name=value`. */
function everyAttribute(root: ParentNode): string[] {
  const out: string[] = [];
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      out.push(`${el.tagName.toLowerCase()}@${attr.name}=${attr.value}`);
    }
  });
  return out;
}

afterEach(() => {
  leaveNativeShell();
  resetCheckoutScript();
  resetStores();
});

/**
 * The only buttons a page in the app may have: Back, a Download for each
 * document on it, and — while a toast is up — the toast's own Dismiss.
 */
function allowedButtons(lang: 'en' | 'hi', downloads: string[], toast = false): string[] {
  return [
    translate(lang, 'common.back'),
    ...downloads.map((number) =>
      number.startsWith('MDGCN')
        ? translate(lang, 'payments.invoice.downloadCreditNoteAs', { number })
        : translate(lang, 'payments.invoice.downloadInvoiceAs', { number }),
    ),
    ...(toast ? [translate(lang, 'common.dismiss')] : []),
  ];
}

/**
 * Everything the page, as the app shows it, must not contain: a way to pay or a
 * pointer towards one. `downloads` are the numbers of the documents on the page,
 * whose Download buttons are the only buttons allowed beside Back. `receipts` are
 * the addresses of the PAID payments the page may link to — the receipt of money
 * already paid — and the only links it may have, plus `autopayLinks`: the
 * Autopay card's link to the screen that can stop it.
 */
function expectNoPayPath(
  container: HTMLElement,
  lang: 'en' | 'hi',
  downloads: string[],
  toast = false,
  receipts: string[] = [],
  autopayLinks: string[] = [],
) {
  const links = [...receipts, ...autopayLinks];
  // No form to submit and no frame. The only links are the receipts listed, each
  // to a payment that was made, and the Autopay card's; no element other than a
  // link has an address.
  expect(container.querySelectorAll('form, iframe, [href]:not(a), a:not([href])')).toHaveLength(0);
  expect(
    Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href')).sort(),
  ).toEqual([...links].sort());
  // The only things to press are the bar's Back arrow and, on a page with a GST
  // document, that document's Download (and a toast's Dismiss while one shows).
  expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(
    allowedButtons(lang, downloads, toast),
  );

  // Nothing on the page — not an attribute, not a class — names Razorpay or a pay address.
  // (The receipt links above are the one pay-shaped address allowed, so they are
  // taken out before looking; any other address of that shape still fails.)
  const attributes = everyAttribute(document.documentElement)
    .filter((attr) => !links.some((href) => attr === `a@href=${href}`))
    .join('\n');
  expect(attributes).not.toMatch(/razorpay/i);
  expect(attributes).not.toMatch(/\/pay(ments)?\/[^\s"]*/i);
  expect(document.querySelector(`script[src="${CHECKOUT_SCRIPT_URL}"]`)).toBeNull();
  expect(document.querySelector('script[src*="razorpay" i]')).toBeNull();

  // No sentence points at a place or a way to pay.
  const words = (container.textContent ?? '').toLowerCase();
  expect(words).not.toMatch(
    /razorpay|website|web site|browser|payment link|pay (online|here|at|on|via|using|through)|chrome|वेबसाइट|ब्राउज़र|लिंक/,
  );
  // And nothing was started: no order, no window.
  expect(api.post).not.toHaveBeenCalled();
  expect((window as { Razorpay?: unknown }).Razorpay).toBeUndefined();
}

describe.each([
  // The list links the two PAID rows to their receipts, and not the due one.
  ['the payments list', '/payments', [], ['/payments/p2', '/payments/p3']],
  ['one payment (due)', '/payments/p1', [], []],
  ['one payment (paid, with its receipt, its invoice not issued yet)', '/payments/p2', [], []],
  [
    'one payment (paid, with its GST invoice and a credit note)',
    '/payments/p3',
    ['MDG/26-27/00001', 'MDGCN/26-27/0001'],
    [],
  ],
] as const)('%s, rendered as the Android app does', (_name, route, downloads, receipts) => {
  it.each(['en', 'hi'] as const)(
    'offers no way to pay and no pointer to one (%s)',
    async (lang) => {
      enterNativeShell();
      serve([DUE, PAID, INVOICED]);
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      const { container } = await openRoute(route, MARKER[route], lang);

      expectNoPayPath(container, lang, [...downloads], false, [...receipts]);
      expect(open).not.toHaveBeenCalled();
    },
  );
});

describe('the payments list, rendered as the Android app does', () => {
  it.each(['en', 'hi'] as const)(
    'opens the receipt of a paid row, and leaves a due row as plain text (%s)',
    async (lang) => {
      const user = userEvent.setup();
      enterNativeShell();
      serve([DUE, PAID, INVOICED]);

      await openRoute('/payments', MARKER['/payments'], lang);

      // The due row is not in any link; both paid rows are.
      const links = screen.getAllByRole('link');
      expect(links.map((a) => a.getAttribute('href')).sort()).toEqual([
        '/payments/p2',
        '/payments/p3',
      ]);
      expect(links.some((a) => a.textContent?.includes(DUE.title))).toBe(false);
      // The due row is still on the page, as text.
      expect(screen.getByText(DUE.title)).toBeInTheDocument();

      // Pressing a paid row reaches its receipt — the reason the link is there.
      const receipt = links.find((a) => a.getAttribute('href') === '/payments/p2') as HTMLElement;
      await user.click(receipt);
      await screen.findByText(MARKER['/payments/p2']);
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(api.post).not.toHaveBeenCalled();
    },
  );
});

type AutopayState = 'setting_up' | 'on' | 'failing' | 'off';
const AUTOPAY_STATES: AutopayState[] = ['setting_up', 'on', 'failing', 'off'];
const EACH_STATE_AND_LANG = AUTOPAY_STATES.flatMap((state) =>
  (['en', 'hi'] as const).map((lang) => [state, lang] as const),
);

/** What proves the Autopay screen has drawn: the pump on its card, or the Off block. */
function autopayMarker(lang: 'en' | 'hi', state: AutopayState): string {
  return state === 'off'
    ? translate(lang, 'autopay.off.title')
    : translate(lang, 'autopay.pump', { code: '15E' });
}

describe('the payments list with autopay, rendered as the Android app does', () => {
  it.each(EACH_STATE_AND_LANG)(
    'shows the Autopay card (%s, %s) and still offers no way to pay',
    async (state, lang) => {
      const user = userEvent.setup();
      enterNativeShell();
      serve([DUE, PAID, INVOICED], makeAutopayStatus({ state }));
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      const { container } = await openRoute('/payments', MARKER['/payments'], lang);
      // The card has drawn: a link to the screen that can stop it.
      const card = await screen.findByRole('link', {
        name: new RegExp(`^${translate(lang, 'autopay.title')}`),
      });
      expect(card).toHaveAttribute('href', '/settings/autopay');

      expectNoPayPath(
        container,
        lang,
        [],
        false,
        ['/payments/p2', '/payments/p3'],
        ['/settings/autopay'],
      );
      expect(open).not.toHaveBeenCalled();
      // The due bill is still plain text, not a link, and nothing is a Pay button.
      expect(screen.getByText(DUE.title)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Pay|चुकाएँ/ })).not.toBeInTheDocument();

      // The card leads to the Autopay screen, and only there.
      await user.click(card);
      await screen.findByText(autopayMarker(lang, state), undefined, { timeout: 10_000 });
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it.each(['en', 'hi'] as const)(
    'says a due bill is taken by autopay, in words that do not point at paying (%s)',
    async (lang) => {
      enterNativeShell();
      serve([makePayment({ autopayOn: '2026-10-28' }), PAID], makeAutopayStatus());

      const { container } = await openRoute('/payments', 'Dealer Kavach — Nov 2026', lang);
      await screen.findByText(translate(lang, 'payments.autopayWillTake', { date: formatDayMonth(lang, '2026-10-28') }));

      expectNoPayPath(container, lang, [], false, ['/payments/p2'], ['/settings/autopay']);
    },
  );
});

// What each state of the Autopay screen has to press, by name: the bar's Back,
// the one button that ends it, and the chat where the screen has a line for it.
function autopayButtons(lang: 'en' | 'hi', state: AutopayState): string[] {
  const tr = (key: Parameters<typeof translate>[1]) => translate(lang, key);
  const back = tr('common.back');
  switch (state) {
    case 'setting_up':
      return [back, tr('autopay.cancelSetup')];
    case 'on':
      return [back, tr('autopay.stop')];
    case 'failing':
      return [back, tr('autopay.stop'), `${tr('help.askInChat')}${tr('help.askInChatDesc')}`];
    case 'off':
      return [back, tr('autopay.off.stopService')];
  }
}

/** The Autopay screen, as the Android app draws it: shown and stopped, never started. */
function expectAutopayScreenIsShowAndStopOnly(
  container: HTMLElement,
  lang: 'en' | 'hi',
  buttons: string[],
) {
  // No link and no address anywhere: nothing on the screen leads off it.
  expect(document.querySelectorAll('a, form, iframe, [href], [src]')).toHaveLength(0);
  expect(
    screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent),
  ).toEqual(buttons);
  // Nothing names Razorpay or an address of a payment.
  const attributes = everyAttribute(document.documentElement).join('\n');
  expect(attributes).not.toMatch(/razorpay/i);
  expect(attributes).not.toMatch(/\/pay(ments)?\/[^\s"]*/i);
  expect(document.querySelector('script[src*="razorpay" i]')).toBeNull();
  // The same words as every other page, and nothing about turning autopay on.
  const words = (container.textContent ?? '').toLowerCase();
  expect(words).not.toMatch(
    /razorpay|website|web site|browser|payment link|pay (online|here|at|on|via|using|through)|chrome|वेबसाइट|ब्राउज़र|लिंक/,
  );
  expect(words).not.toMatch(
    /turn (it )?on|switch (it )?on|set (it )?up|start autopay|activate|enable|approve|चालू करें|चालू कीजिए|शुरू करें/,
  );
  expect(api.post).not.toHaveBeenCalled();
  expect((window as { Razorpay?: unknown }).Razorpay).toBeUndefined();
  void lang;
}

describe('the Autopay screen, rendered as the Android app does', () => {
  it.each(EACH_STATE_AND_LANG)('only shows and stops (%s, %s)', async (state, lang) => {
    enterNativeShell();
    serve([DUE, PAID, INVOICED], makeAutopayStatus({ state }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const { container } = await openRoute('/settings/autopay', autopayMarker(lang, state), lang);

    expectAutopayScreenIsShowAndStopOnly(container, lang, autopayButtons(lang, state));
    expect(open).not.toHaveBeenCalled();
  });

  it.each(['setting_up', 'on', 'failing'] as const)(
    'has a stop dialog that offers reasons, a help line and the stop — and nothing to turn it on (%s)',
    async (state) => {
      const user = userEvent.setup();
      enterNativeShell();
      serve([DUE, PAID], makeAutopayStatus({ state, firstMonthRefundable: true }));

      const { container } = await openRoute('/settings/autopay', autopayMarker('en', state));
      await user.click(
        screen.getByRole('button', { name: translate('en', state === 'setting_up' ? 'autopay.cancelSetup' : 'autopay.stop') }),
      );
      const dialog = await screen.findByRole('alertdialog');

      // Five reasons, the help line, the stop and the keep: and nothing else.
      expect(within(dialog).getAllByRole('button')).toHaveLength(8);
      expect(document.querySelectorAll('a, form, iframe, [href], [src]')).toHaveLength(0);
      const words = (container.textContent ?? '').toLowerCase();
      expect(words).not.toMatch(
        /razorpay|website|web site|browser|payment link|pay (online|here|at|on|via|using|through)|chrome|turn (it )?on|switch (it )?on|set (it )?up|activate|enable/,
      );
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it('shows a manager nothing: no amount, no button, no address', async () => {
    enterNativeShell();
    serve([DUE, PAID], makeAutopayStatus());
    signIn({ dealerId: 'd1', role: 'dealer-staff' });
    useLangStore.setState({ lang: 'en', explicit: true });
    const { container } = renderWithProviders(<App />, { route: '/settings/autopay' });
    await screen.findByText('Only the owner can change autopay', undefined, { timeout: 10_000 });

    expect(api.get).not.toHaveBeenCalledWith(AUTOPAY_PATH);
    expect(container.textContent ?? '').not.toMatch(/₹/);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Back']);
    expect(document.querySelectorAll('a, form, iframe, [href], [src]')).toHaveLength(0);
  });
});

describe('a GST document downloaded inside the Android app', () => {
  it.each(['en', 'hi'] as const)(
    'is handed to the app’s downloader, and the page still has no way to pay (%s)',
    async (lang) => {
      const user = userEvent.setup();
      enterNativeShell();
      // The shell takes the job at once and reports the file saved, as the real one does.
      const sent: Array<{ type: string; url: string }> = [];
      (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
        postMessage: (raw: string) => {
          const msg = JSON.parse(raw) as { id: string; type: string; url: string };
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
      serve([DUE, PAID, INVOICED]);
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const numbers = ['MDG/26-27/00001', 'MDGCN/26-27/0001'];

      const { container } = await openRoute('/payments/p3', MARKER['/payments/p3'], lang);
      await user.click(
        screen.getByRole('button', { name: allowedButtons(lang, numbers)[1] as string }),
      );

      // The toast that follows is on the page now, and is held to the same rules.
      await screen.findByText(translate(lang, 'payments.invoice.downloading'));
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ type: 'media:download', url: DOWNLOAD_LINK.url });
      expect(api.get).toHaveBeenCalledWith('/v1/payments/me/p3/documents/g1');
      expect(open).not.toHaveBeenCalled();
      expectNoPayPath(container, lang, numbers, true);
    },
  );
});

describe('the same pages in a browser (the control)', () => {
  it('do offer a Pay button, a link on to the payment, and load Razorpay’s script', async () => {
    serve([DUE, PAID]);

    const { container } = await openRoute('/payments', 'Dealer Kavach — Nov 2026');
    await screen.findByRole('button', { name: 'Pay ₹4,999' });

    expect(container.querySelector('a[href="/payments/p1"]')).not.toBeNull();
    expect(document.querySelector(`script[src="${CHECKOUT_SCRIPT_URL}"]`)).not.toBeNull();
  });

  it('have the Pay button on the payment’s own page', async () => {
    serve([DUE, PAID]);

    await openRoute('/payments/p1', 'Dealer Kavach — Nov 2026');

    expect(await screen.findByRole('button', { name: 'Pay ₹4,999' })).toBeInTheDocument();
  });
});

describe('the routes', () => {
  it('sit inside the signed-in layout: a signed-out visit goes to the login screen', async () => {
    serve([DUE]);
    // Not signed in.
    renderWithProviders(<App />, { route: '/payments' });
    // The login page is a lazy chunk; wait for it rather than for the payments one.
    await waitFor(() => expect(document.body.textContent ?? '').toMatch(/Sign in|साइन इन/), {
      timeout: 4000,
    });
    expect(api.get).not.toHaveBeenCalled();
  });
});
