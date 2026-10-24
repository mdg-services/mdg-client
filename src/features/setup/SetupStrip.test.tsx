import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeSetupView, makeStrip } from '@/test/setupFixtures';
import { renderWithProviders, signIn } from '@/test/utils';
import type { OutletSetupView, PortalLoginsView } from '@dk/shared/types';

import { SetupStrip } from './SetupStrip';

const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put },
}));

const PORTALS: PortalLoginsView = {
  portals: [{ portal: 'sdms', needed: true, status: 'missing' }],
  canEdit: true,
};

/** The dealer's setup walkthrough as the library lists it. */
const SETUP_VIDEO = {
  id: 'setup_steps',
  title: { hi: 'आपका सेटअप, कदम-दर-कदम', en: 'Your setup, step by step' },
  summary: { hi: 'पाँच कदम', en: 'The five steps' },
  durationMs: 93_500,
  service: null,
  available: true,
};

/** The server: the setup view, the portal logins the login box asks for, and the video list. */
function serve(view: OutletSetupView | Error | (() => OutletSetupView), videos: unknown[] = []) {
  h.get.mockImplementation((path: string) => {
    if (path === '/v1/me/setup') {
      if (view instanceof Error) return Promise.reject(view);
      return Promise.resolve(typeof view === 'function' ? view() : view);
    }
    if (path === '/v1/me/portal-logins') return Promise.resolve(PORTALS);
    if (path === '/v1/me/guide-videos') return Promise.resolve(videos);
    if (path === '/v1/me/guide-videos/setup_steps') {
      return Promise.resolve({ ...SETUP_VIDEO, url: 'https://example.test/setup.mp4', startSec: 0, chapters: [] });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.put.mockReset();
});
afterEach(() => cleanup());

const step = (name: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-step="${name}"]`);
  if (!el) throw new Error(`no ${name} step`);
  return el;
};
const states = () =>
  [...document.querySelectorAll('[data-step]')].map((e) => e.getAttribute('data-state'));

const atBilling = makeSetupView({
  stage: 'billing',
  strip: makeStrip(['done', 'current', 'todo', 'todo', 'todo']),
  services: {
    options: makeSetupView().services.options,
    chosen: ['dsr-report'],
    locked: false,
  },
});

describe('the setup strip', () => {
  it('shows five steps, each with its state, and one line on what is happening now', async () => {
    serve(makeSetupView());
    renderWithProviders(<SetupStrip />);
    await screen.findByText('Choose your services');
    const labels = [...document.querySelectorAll('[data-step]')].map((e) => e.textContent);
    expect(labels).toEqual([
      expect.stringContaining('Services'),
      expect.stringContaining('Bill address'),
      expect.stringContaining('Payment'),
      expect.stringContaining('Logins'),
      expect.stringContaining('Start'),
    ]);
    expect(states()).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
    expect(screen.getByRole('list', { name: 'Getting your services started' })).toBeInTheDocument();
  });

  it('each step says its state to a screen reader', async () => {
    serve(
      makeSetupView({
        stage: 'payment',
        strip: makeStrip(['done', 'done', 'current', 'skipped', 'todo']),
      }),
    );
    renderWithProviders(<SetupStrip />);
    await screen.findByText(/getting your bill ready/);
    expect(step('services')).toHaveTextContent('done');
    expect(step('payment')).toHaveTextContent('now');
    expect(step('logins')).toHaveTextContent('not needed');
    expect(step('start')).toHaveTextContent('later');
  });

  it('draws the labels in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    serve(makeSetupView());
    renderWithProviders(<SetupStrip />);
    await screen.findByText('अपनी सेवाएँ चुनिए');
    for (const word of ['सेवाएँ', 'बिल का पता', 'भुगतान', 'लॉगिन', 'शुरू']) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  it('says whose move it is at each stage, and never about paying', async () => {
    const cases: Array<[Partial<OutletSetupView>, string]> = [
      [{ stage: 'billing' }, 'Fill in the name and address for your bill'],
      [{ stage: 'payment', waitingOn: 'mdg' }, "MDG's team is getting your bill ready"],
      [
        {
          stage: 'payment',
          payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null, paymentId: null },
        },
        'Your bill has been sent',
      ],
      [{ stage: 'logins' }, 'Add your portal logins'],
      [{ stage: 'setup', waitingOn: 'mdg' }, "MDG's team is getting your services ready"],
      [{ stage: 'watch', waitingOn: 'nobody' }, 'Your services have started'],
    ];
    for (const [over, line] of cases) {
      serve(makeSetupView(over));
      const { unmount } = renderWithProviders(<SetupStrip />);
      await screen.findByText(line);
      expect(document.body.textContent).not.toMatch(/\b(pay|upi|bank)\b/i);
      unmount();
      h.get.mockReset();
    }
  });

  describe('is not there', () => {
    it('for an outlet that is not in onboarding', async () => {
      serve(makeSetupView({ active: false }));
      const { container } = renderWithProviders(<SetupStrip />);
      await waitFor(() => expect(h.get).toHaveBeenCalled());
      await act(async () => {});
      expect(container.querySelector('[data-setup-strip]')).toBeNull();
    });

    it.each(['live', 'lost'] as const)('once it is %s', async (stage) => {
      serve(makeSetupView({ stage }));
      const { container } = renderWithProviders(<SetupStrip />);
      await waitFor(() => expect(h.get).toHaveBeenCalled());
      await act(async () => {});
      expect(container.querySelector('[data-setup-strip]')).toBeNull();
    });

    it('while the page asks it to step aside, and comes back after', async () => {
      serve(makeSetupView());
      const { container, rerender } = renderWithProviders(<SetupStrip />);
      await screen.findByText('Choose your services');
      rerender(<SetupStrip hidden />);
      expect(container.querySelector('[data-setup-strip]')).toBeNull();
      rerender(<SetupStrip />);
      expect(container.querySelector('[data-setup-strip]')).not.toBeNull();
    });

    it('when the outlet cannot be had: it takes no room', async () => {
      serve(new ApiError(500, 'INTERNAL', 'boom'));
      const { container } = renderWithProviders(<SetupStrip />);
      await waitFor(() => expect(h.get).toHaveBeenCalled());
      await act(async () => {});
      expect(container.querySelector('[data-setup-strip]')).toBeNull();
    });
  });

  describe('tapping a step', () => {
    it('only the CURRENT step the dealer does is a button', async () => {
      serve(atBilling);
      renderWithProviders(<SetupStrip />);
      await screen.findByText('Fill in the name and address for your bill');
      expect(within(step('billing')).getByRole('button')).toBeInTheDocument();
      for (const other of ['services', 'payment', 'logins', 'start']) {
        expect(within(step(other)).queryByRole('button')).toBeNull();
      }
    });

    it("the last step is MDG's: not a button even when it is the current one", async () => {
      serve(
        makeSetupView({
          stage: 'setup',
          waitingOn: 'mdg',
          strip: makeStrip(['done', 'done', 'done', 'done', 'current']),
        }),
      );
      renderWithProviders(<SetupStrip />);
      await screen.findByText("MDG's team is getting your services ready");
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('opens that card in a sheet over the chat', async () => {
      serve(atBilling);
      renderWithProviders(<SetupStrip />);
      await screen.findByText('Fill in the name and address for your bill');
      fireEvent.click(within(step('billing')).getByRole('button'));
      const sheet = await screen.findByRole('dialog', { name: 'Bill address' });
      // The card itself comes down the first time a step is tapped.
      expect(await within(sheet).findByLabelText('Name on the bill')).toBeInTheDocument();
      expect(sheet).toHaveAttribute('aria-modal', 'true');
    });

    it('opens the services card at the services step, with the ticks', async () => {
      serve(makeSetupView());
      renderWithProviders(<SetupStrip />);
      fireEvent.click(await within(await waitForStep('services')).findByRole('button'));
      const sheet = await screen.findByRole('dialog', { name: 'Services' });
      await within(sheet).findAllByRole('checkbox');
      expect(within(sheet).getAllByRole('checkbox')).toHaveLength(6);
    });

    it('at the payment step shows the bill, read-only', async () => {
      serve(
        makeSetupView({
          stage: 'payment',
          strip: makeStrip(['done', 'done', 'current', 'todo', 'todo']),
          payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null, paymentId: null },
        }),
      );
      renderWithProviders(<SetupStrip />);
      fireEvent.click(await within(await waitForStep('payment')).findByRole('button'));
      const sheet = await screen.findByRole('dialog', { name: 'Payment' });
      expect(await within(sheet).findByText('Bill: ₹3,540 · due 2 November')).toBeInTheDocument();
      // Only the sheet's own ✕: nothing in the card to press.
      expect(within(sheet).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
        'Dismiss',
      ]);
      expect(within(sheet).queryByRole('link')).toBeNull();
    });

    it('at the logins step shows the login box for the portals the services need', async () => {
      serve(
        makeSetupView({
          stage: 'logins',
          strip: makeStrip(['done', 'done', 'done', 'current', 'todo']),
          loginsNeeded: ['sdms'],
        }),
      );
      renderWithProviders(<SetupStrip />);
      fireEvent.click(await within(await waitForStep('logins')).findByRole('button'));
      const sheet = await screen.findByRole('dialog', { name: 'Logins' });
      expect(await within(sheet).findByLabelText('User ID')).toBeInTheDocument();
      expect(within(sheet).getByText('SDMS login')).toBeInTheDocument();
    });

    it('Escape and the ✕ close it', async () => {
      serve(atBilling);
      renderWithProviders(<SetupStrip />);
      fireEvent.click(within(await waitForStep('billing')).getByRole('button'));
      await screen.findByRole('dialog');
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      fireEvent.click(within(step('billing')).getByRole('button'));
      const sheet = await screen.findByRole('dialog');
      fireEvent.click(within(sheet).getByRole('button', { name: 'Dismiss' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it("the phone's Back button closes it, and stays on the page", async () => {
      serve(atBilling);
      renderWithProviders(<SetupStrip />);
      fireEvent.click(within(await waitForStep('billing')).getByRole('button'));
      await screen.findByRole('dialog');
      act(() => window.history.back());
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(step('billing')).toBeInTheDocument();
    });

    it('closes by itself once that step is done: save it and the sheet goes, the strip moves on', async () => {
      serve(makeSetupView());
      renderWithProviders(<SetupStrip />);
      fireEvent.click(await within(await waitForStep('services')).findByRole('button'));
      const sheet = await screen.findByRole('dialog', { name: 'Services' });
      fireEvent.click(await within(sheet).findByRole('checkbox', { name: /^TT Density/ }));
      h.put.mockResolvedValue(
        makeSetupView({
          ...atBilling,
          services: { options: atBilling.services.options, chosen: ['tt-density'], locked: false },
        }),
      );
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save my services' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(states()).toEqual(['done', 'current', 'todo', 'todo', 'todo']);
      expect(screen.getByText('Fill in the name and address for your bill')).toBeInTheDocument();
    });

    it('a manager can open the step and sees it read-only', async () => {
      serve({ ...atBilling, canEdit: false });
      renderWithProviders(<SetupStrip />);
      fireEvent.click(within(await waitForStep('billing')).getByRole('button'));
      const sheet = await screen.findByRole('dialog');
      expect(await within(sheet).findByText('The owner fills this')).toBeInTheDocument();
      expect(within(sheet).queryByLabelText('Name on the bill')).toBeNull();
    });
  });

  it('follows the server when the view changes: the next step becomes the current one', async () => {
    let view = makeSetupView();
    serve(() => view);
    const { queryClient } = renderWithProviders(<SetupStrip />);
    await screen.findByText('Choose your services');
    view = atBilling;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-setup', 'me'] });
    });
    await screen.findByText('Fill in the name and address for your bill');
    expect(states()).toEqual(['done', 'current', 'todo', 'todo', 'todo']);
  });

  /** The strip is drawn once the view has loaded. */
  async function waitForStep(name: string): Promise<HTMLElement> {
    await waitFor(() => expect(document.querySelector(`[data-step="${name}"]`)).not.toBeNull());
    return step(name);
  }
});

describe('the "how setup works" video under the strip', () => {
  it('is offered once the walkthrough is uploaded, and plays in the app', async () => {
    serve(atBilling, [SETUP_VIDEO]);
    renderWithProviders(<SetupStrip />);
    const link = await screen.findByRole('button', { name: /How setup works/ });
    fireEvent.click(link);
    await waitFor(() =>
      expect(h.get).toHaveBeenCalledWith('/v1/me/guide-videos/setup_steps', expect.anything()),
    );
  });

  it('is not there before the video is uploaded — never a dead link', async () => {
    serve(atBilling, [{ ...SETUP_VIDEO, available: false }]);
    renderWithProviders(<SetupStrip />);
    await screen.findByText('Fill in the name and address for your bill');
    expect(screen.queryByRole('button', { name: /How setup works/ })).toBeNull();
  });
});
