import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeSetupView, makeStrip } from '@/test/setupFixtures';
import { renderWithProviders, signIn } from '@/test/utils';
import type { OutletSetupView, PortalLoginsView } from '@dk/shared/types';

import { SetupHero, useSetupHeroActive } from './SetupHero';

const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put },
}));
// The login box is its own (large, separately tested) piece: here it is only ever asked for.
vi.mock('@/features/chat/PortalLoginBox', () => ({
  PortalLoginBox: ({ portals }: { portals?: string[] }) => (
    <div data-testid="portal-login-box">{(portals ?? []).join(',')}</div>
  ),
}));

let view: OutletSetupView | null = null;
let portals: PortalLoginsView = { portals: [], canEdit: true };

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'dl1' });
  useLangStore.setState({ lang: 'en', explicit: true });
  view = makeSetupView();
  portals = { portals: [], canEdit: true };
  h.get.mockImplementation((path: string) => {
    if (path === '/v1/me/setup') return Promise.resolve(view);
    if (path === '/v1/me/portal-logins') return Promise.resolve(portals);
    return Promise.resolve([]);
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const hero = () => screen.findByTestId('setup-hero');
const step = (name: string) => screen.getByTestId(`hero-step-${name}`);

describe('the setup hero on Today (spec 4.9)', () => {
  it('says "Your turn" with how far it has got, and opens the step to do right in the card', async () => {
    renderWithProviders(<SetupHero />);
    const card = await hero();
    expect(card).toHaveAttribute('data-turn', 'dealer');
    expect(within(card).getByRole('heading', { name: 'Setting up your pump' })).toBeInTheDocument();
    expect(within(card).getByText('Your turn')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(within(card).getByText('1 of 5 done')).toBeInTheDocument();

    // The bill address form is in the card itself, not behind "Continue in chat".
    await waitFor(() => expect(step('billing').querySelector('[data-setup-card="billing"]')).not.toBeNull());
    expect(step('billing')).toHaveAttribute('data-state', 'current');
  });

  it('every step has its word as well as its shape, and a later step says what it is for', async () => {
    renderWithProviders(<SetupHero />);
    await hero();
    expect(within(step('company')).getByText('Done')).toBeInTheDocument();
    expect(within(step('billing')).getByText('Now')).toBeInTheDocument();
    for (const later of ['payment', 'logins', 'start']) {
      expect(within(step(later)).getByText('Later')).toBeInTheDocument();
    }
    expect(within(step('logins')).getByText('So MDG can read your portal reports for you.')).toBeInTheDocument();
  });

  it("says \"MDG's turn\" while the team works, and the step is MDG's, with no form", async () => {
    view = makeSetupView({
      stage: 'setup',
      waitingOn: 'mdg',
      strip: makeStrip(['done', 'done', 'done', 'done', 'current']),
      billing: { name: 'Sai Petroleums', address: 'NH 24', stateCode: '06', gstin: null },
      payment: { state: 'paid', amountPaise: 99900, dueOn: null, paidOn: '2026-11-20', paymentId: 'p1' },
    });
    renderWithProviders(<SetupHero />);
    const card = await hero();
    expect(card).toHaveAttribute('data-turn', 'mdg');
    expect(within(card).getByText("MDG's turn")).toBeInTheDocument();
    expect(within(step('start')).getByText('MDG is on it')).toBeInTheDocument();
    expect(step('start').querySelector('[data-setup-card]')).toBeNull();
  });

  it('every button of the form inside the card is a 44px tap or bigger (company step and bill step)', async () => {
    const tall = /(?:min-h|h)-(?:11|12|14)\b/;
    for (const [stage, strip] of [
      ['company', makeStrip(['current', 'todo', 'todo', 'todo', 'todo'])],
      ['billing', makeStrip(['done', 'current', 'todo', 'todo', 'todo'])],
    ] as const) {
      view = makeSetupView({ stage, company: stage === 'company' ? null : undefined, strip } as never);
      const { unmount } = renderWithProviders(<SetupHero />);
      await hero();
      const current = await screen.findByTestId(`hero-step-${stage}`);
      await waitFor(() => expect(current.querySelector('[data-setup-card]')).not.toBeNull());
      const buttons = Array.from(current.querySelectorAll('[data-setup-card] button, [data-setup-card] input[type="submit"]'));
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b.className, b.outerHTML.slice(0, 120)).toMatch(tall);
      unmount();
    }
  });

  it('says "All done" when nobody is waited on', async () => {
    view = makeSetupView({ stage: 'watch', waitingOn: 'nobody', strip: makeStrip(['done', 'done', 'done', 'done', 'done']) });
    renderWithProviders(<SetupHero />);
    const card = await hero();
    expect(within(card).getByText('All done')).toBeInTheDocument();
    expect(within(card).getByText('5 of 5 done')).toBeInTheDocument();
  });

  it('shows a manager the same card read-only: "Owner\'s turn", a note, no company escape hatch', async () => {
    view = makeSetupView({ canEdit: false, stage: 'company', company: null, strip: makeStrip(['current', 'todo', 'todo', 'todo', 'todo']) });
    renderWithProviders(<SetupHero />);
    const card = await hero();
    expect(card).toHaveAttribute('data-turn', 'owner');
    expect(within(card).getByText("Owner's turn")).toBeInTheDocument();
    expect(within(card).getByText(/Your owner fills in these steps/)).toBeInTheDocument();
    expect(screen.queryByText('Pump with another company?')).not.toBeInTheDocument();
  });

  it('the owner can say "my pump is with another company" in the chat, in his own words', async () => {
    view = makeSetupView({ stage: 'company', company: null, strip: makeStrip(['current', 'todo', 'todo', 'todo', 'todo']) });
    renderWithProviders(<SetupHero />);
    await hero();
    expect(within(step('company')).getByText('Pump with another company?')).toBeInTheDocument();
    expect(within(step('company')).getByRole('button', { name: /Ask MDG|MDG/ })).toBeInTheDocument();
  });

  describe('what a done step shows MDG now holds', () => {
    it('the company, the bill name and its due date, who did it', async () => {
      view = makeSetupView({
        stage: 'payment',
        waitingOn: 'dealer',
        strip: makeStrip(['done', 'done', 'current', 'todo', 'todo']),
        companySavedBy: 'mdg',
        billing: { name: 'Sai Petroleums', address: 'NH 24', stateCode: '06', gstin: null },
        billingSavedBy: 'mdg',
        payment: { state: 'sent', amountPaise: 99900, dueOn: '2026-12-05', paidOn: null, paymentId: null },
      });
      renderWithProviders(<SetupHero />);
      await hero();
      expect(within(step('company')).getByText('Indian Oil (IOCL)')).toBeInTheDocument();
      expect(within(step('company')).getByText("Filled in by MDG's team")).toBeInTheDocument();
      expect(within(step('billing')).getByText('Sai Petroleums, bill due 5 December')).toBeInTheDocument();
      expect(within(step('billing')).getByText("Filled in by MDG's team")).toBeInTheDocument();
    });

    it('the first bill is said in days, never in rupees, and has no way to pay', async () => {
      view = makeSetupView({
        stage: 'payment',
        waitingOn: 'dealer',
        strip: makeStrip(['done', 'done', 'current', 'todo', 'todo']),
        billing: { name: 'Sai Petroleums', address: 'NH 24', stateCode: '06', gstin: null },
        payment: { state: 'sent', amountPaise: 99900, dueOn: '2099-12-05', paidOn: null, paymentId: null },
      });
      renderWithProviders(<SetupHero />);
      const card = await hero();
      expect(within(step('payment')).getByText('Your first bill is due on 5 December.')).toBeInTheDocument();
      expect(card.textContent).not.toMatch(/999|₹|Rs\.?/);
      expect(within(card).queryByRole('button', { name: /pay/i })).toBeNull();
      expect(card.querySelector('a[href^="http"]')).toBeNull();
    });

    it('a bill that is not sent yet says MDG is getting it ready', async () => {
      view = makeSetupView({
        stage: 'payment',
        waitingOn: 'mdg',
        strip: makeStrip(['done', 'done', 'current', 'todo', 'todo']),
        billing: { name: 'Sai Petroleums', address: 'NH 24', stateCode: '06', gstin: null },
      });
      renderWithProviders(<SetupHero />);
      await hero();
      expect(within(step('payment')).getByText("MDG's team is getting your bill ready.")).toBeInTheDocument();
      expect(within(step('payment')).getByText('MDG is on it')).toBeInTheDocument();
    });

    it('a paid bill says so and links only to its receipt', async () => {
      view = makeSetupView({
        stage: 'logins',
        strip: makeStrip(['done', 'done', 'done', 'current', 'todo']),
        billing: { name: 'Sai Petroleums', address: 'NH 24', stateCode: '06', gstin: null },
        payment: { state: 'paid', amountPaise: 99900, dueOn: null, paidOn: '2026-11-20', paymentId: 'p1' },
      });
      renderWithProviders(<SetupHero />);
      await hero();
      expect(await within(step('payment')).findByText('Payment received')).toBeInTheDocument();
      expect(within(step('payment')).getByRole('link', { name: 'View receipt' })).toHaveAttribute('href', '/payments/p1');
    });

    it('the logins saved, each with the day and by whom', async () => {
      view = makeSetupView({
        stage: 'setup',
        waitingOn: 'mdg',
        strip: makeStrip(['done', 'done', 'done', 'done', 'current']),
        loginsNeeded: ['sdms', 'iras'],
      });
      portals = {
        canEdit: true,
        portals: [
          { portal: 'sdms', needed: true, status: 'saved', savedAt: '2026-11-12T05:00:00Z', savedBy: 'dealer' },
          { portal: 'iras', needed: true, status: 'saved', savedAt: '2026-11-13T05:00:00Z', savedBy: 'mdg' },
        ],
      };
      renderWithProviders(<SetupHero />);
      await hero();
      expect(await within(step('logins')).findByText('SDMS saved on 12 November')).toBeInTheDocument();
      expect(within(step('logins')).getByText("IRAS saved by MDG's team on 13 November")).toBeInTheDocument();
    });
  });

  describe('a login the portal refused', () => {
    beforeEach(() => {
      view = makeSetupView({
        stage: 'setup',
        waitingOn: 'mdg',
        strip: makeStrip(['done', 'done', 'done', 'done', 'current']),
        loginsNeeded: ['sdms', 'iras'],
      });
      portals = {
        canEdit: true,
        portals: [
          { portal: 'sdms', needed: true, status: 'saved', savedAt: '2026-11-12T05:00:00Z', savedBy: 'dealer' },
          { portal: 'iras', needed: true, status: 'refused', refusedAt: '2026-11-14T05:00:00Z' },
        ],
      };
    });

    it('is a Needs-you row at the top, in a sentence with a shape and a word, and one tap opens its box', async () => {
      renderWithProviders(<SetupHero />);
      const needs = await screen.findByTestId('hero-needs-you');
      expect(within(needs).getByRole('heading', { name: 'Needs you' })).toBeInTheDocument();
      expect(within(needs).getByText('IRAS login was refused on 14 November. Please update it.')).toBeInTheDocument();
      expect(screen.queryByTestId('portal-login-box')).toBeNull();

      fireEvent.click(within(needs).getByRole('button', { name: 'Update login' }));
      expect(screen.getByTestId('portal-login-box')).toHaveTextContent('iras');
      fireEvent.click(within(needs).getByRole('button', { name: 'Close' }));
      expect(screen.queryByTestId('portal-login-box')).toBeNull();
    });

    it('a manager reads it but cannot change it', async () => {
      view = { ...view!, canEdit: false };
      renderWithProviders(<SetupHero />);
      const needs = await screen.findByTestId('hero-needs-you');
      expect(within(needs).getByText(/IRAS login was refused/)).toBeInTheDocument();
      expect(within(needs).queryByRole('button', { name: 'Update login' })).toBeNull();
    });

    it('is not looked for before the logins step is done', async () => {
      view = makeSetupView();
      renderWithProviders(<SetupHero />);
      await hero();
      expect(screen.queryByTestId('hero-needs-you')).toBeNull();
      expect(h.get).not.toHaveBeenCalledWith('/v1/me/portal-logins');
    });
  });

  it('the four numbers Today will show are dashed empty places, named, until the services start', async () => {
    renderWithProviders(<SetupHero />);
    await hero();
    const slots = screen.getByTestId('hero-ghost-slots');
    const items = within(slots).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.getAttribute('data-ghost-slot'))).toEqual([
      'first.setup.slot.sales',
      'first.setup.slot.variation',
      'first.setup.slot.deposit',
      'first.setup.slot.score',
    ]);
    expect(within(slots).getByText('Deposit to the oil company')).toBeInTheDocument();
    for (const item of items) expect(item.className).toMatch(/border-dashed/);
  });

  it('is in Hindi when the app is', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(<SetupHero />);
    const card = await hero();
    expect(within(card).getByRole('heading', { name: 'आपका पंप तैयार हो रहा है' })).toBeInTheDocument();
    expect(within(card).getByText('आपकी बारी')).toBeInTheDocument();
    expect(within(card).getByText('5 में से 1 पूरे')).toBeInTheDocument();
  });

  it('uses only the named text sizes and keeps names wrapping', async () => {
    renderWithProviders(<SetupHero />);
    const card = await hero();
    const html = card.outerHTML;
    expect(html).not.toMatch(/text-\[/);
    expect(html).not.toMatch(/truncate|line-clamp|dark:/);
  });
});

describe('when the hero is not drawn', () => {
  it.each([
    ['a live pump', { stage: 'live' as const }],
    ['a pump that is lost', { stage: 'lost' as const }],
    ['an outlet not set up through the app', { active: false }],
  ])('draws nothing for %s', async (_name, over) => {
    view = makeSetupView(over);
    renderWithProviders(<SetupHero />);
    await waitFor(() => expect(h.get).toHaveBeenCalledWith('/v1/me/setup'));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId('setup-hero')).toBeNull();
  });

  it('draws nothing, and asks nothing, for an admin', async () => {
    signIn({ role: 'admin' });
    renderWithProviders(<SetupHero />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId('setup-hero')).toBeNull();
    expect(h.get).not.toHaveBeenCalledWith('/v1/me/setup');
  });

  it('draws nothing while the answer is on its way', () => {
    h.get.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<SetupHero />);
    expect(screen.queryByTestId('setup-hero')).toBeNull();
  });

  it('draws nothing when the server cannot be reached', async () => {
    h.get.mockRejectedValue(new Error('offline'));
    renderWithProviders(<SetupHero />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('setup-hero')).toBeNull();
  });
});

describe('useSetupHeroActive: whether Today puts the hero in the verdict card\'s place', () => {
  function Probe() {
    return <p data-testid="probe">{String(useSetupHeroActive())}</p>;
  }

  it('is true while setup runs, false before the answer and on a live pump', async () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('true'));
  });

  it('is false on a live pump', async () => {
    view = makeSetupView({ stage: 'live' });
    renderWithProviders(<Probe />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
  });
});
