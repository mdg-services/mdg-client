import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeSetupView, makeStrip } from '@/test/setupFixtures';
import { renderWithProviders, signIn } from '@/test/utils';
import type { PortalLoginsView } from '@dk/shared/types';

import { SetupJourneyCard } from './SetupJourneyCard';

const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put },
}));

const PORTALS: PortalLoginsView = { portals: [{ portal: 'sdms', needed: true, status: 'missing' }], canEdit: true };

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'dl1' });
  useLangStore.setState({ lang: 'hi' });
  h.get.mockImplementation((path: string) => {
    if (path === '/v1/me/portal-logins') return Promise.resolve(PORTALS);
    if (path.startsWith('/v1/me/guide-videos') || path.startsWith('/v1/guide-videos')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
});
afterEach(cleanup);

describe('the setup as one card (ADR 0059)', () => {
  it('says "3 of 5 done" with its bar, ticks the done steps with what was given, greys the later ones', () => {
    const view = makeSetupView({
      stage: 'logins',
      strip: makeStrip(['done', 'done', 'done', 'current', 'todo']),
      billing: { name: 'Sai Petroleums', address: 'NH 24', stateCode: '06', gstin: null },
      payment: { state: 'paid', amountPaise: 99900, dueOn: null, paidOn: '2026-11-20', paymentId: 'p1' },
    });
    renderWithProviders(<SetupJourneyCard view={view} />);
    const c = screen.getByTestId('setup-journey-card');
    expect(within(c).getByText('डीलर कवच शुरू करें')).toBeTruthy();
    expect(within(c).getAllByText('5 में से 3 पूरे').length).toBeGreaterThan(0);
    expect(within(c).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');
    expect(c.querySelector('[data-row="company"]')?.getAttribute('data-state')).toBe('done');
    expect(within(c).getByText('Sai Petroleums')).toBeTruthy();
    expect(within(c).getByText('भुगतान मिल गया')).toBeTruthy();
    expect(c.querySelector('[data-row="logins"]')?.getAttribute('data-state')).toBe('open');
    expect(c.querySelector('[data-row="start"]')?.getAttribute('data-state')).toBe('later');
  });

  it('opens the current step’s own form inside the card', async () => {
    renderWithProviders(<SetupJourneyCard view={makeSetupView()} />);
    const row = screen.getByTestId('setup-row-billing');
    await waitFor(() => expect(row.querySelector('[data-setup-card="billing"]')).not.toBeNull());
  });

  it('on MDG’s own step, says what the team is doing instead of a form', () => {
    const view = makeSetupView({ stage: 'setup', waitingOn: 'mdg', strip: makeStrip(['done', 'done', 'done', 'done', 'current']) });
    renderWithProviders(<SetupJourneyCard view={view} />);
    const row = screen.getByTestId('setup-row-start');
    expect(row.getAttribute('data-state')).toBe('working');
    expect(row.textContent?.length).toBeGreaterThan(4);
  });
});
