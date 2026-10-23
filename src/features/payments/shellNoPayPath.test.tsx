import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { translate } from '@/lib/i18n';
import { useLangStore } from '@/store/lang';
import { enterNativeShell, leaveNativeShell, makePaidPayment, makePayment } from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerPayment } from '@dk/shared/types';

import { CHECKOUT_SCRIPT_URL, resetCheckoutScript } from './checkout';

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
// What each route shows that proves its page has drawn.
const MARKER = {
  '/payments': 'Dealer Kavach — Nov 2026',
  '/payments/p1': 'Dealer Kavach — Nov 2026',
  '/payments/p2': 'MDG-2026-00007',
} as const;
const PAID = makePaidPayment();

function serve(items: DealerPayment[]) {
  vi.mocked(api.get).mockImplementation((async (path: string) => {
    if (path === '/v1/payments/me') return { items };
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

describe.each([
  ['the payments list', '/payments'],
  ['one payment (due)', '/payments/p1'],
  ['one payment (paid, with its receipt)', '/payments/p2'],
])('%s, rendered as the Android app does', (_name, route) => {
  it.each(['en', 'hi'] as const)(
    'offers no way to pay and no pointer to one (%s)',
    async (lang) => {
      enterNativeShell();
      serve([DUE, PAID]);
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      const { container } = await openRoute(route, MARKER[route as keyof typeof MARKER], lang);

      // No link of any kind, and no form to submit.
      expect(container.querySelectorAll('a, [href], form, iframe')).toHaveLength(0);
      // The only thing to press is the bar's Back arrow.
      expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
        translate(lang, 'common.back'),
      ]);

      // Nothing on the page — not an attribute, not a class — names Razorpay or a pay address.
      const attributes = everyAttribute(document.documentElement).join('\n');
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
      expect(open).not.toHaveBeenCalled();
      expect((window as { Razorpay?: unknown }).Razorpay).toBeUndefined();
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
