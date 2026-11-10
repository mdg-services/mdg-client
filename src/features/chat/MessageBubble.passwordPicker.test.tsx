import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import type { PortalId, PortalLoginState, PortalLoginsView } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// "Which password?" — the list MDG posts when an owner asks to reset or change "my
// password" without saying which. The server is a double; ApiError stays the real one.
const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put, post: h.post },
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.put.mockReset();
  h.post.mockReset();
});
afterEach(() => cleanup());

const saved = (portal: PortalId, over: Partial<PortalLoginState> = {}): PortalLoginState => ({
  portal,
  needed: true,
  status: 'saved',
  savedAt: new Date().toISOString(),
  ...over,
});

const VIEW: PortalLoginsView = {
  portals: [
    saved('sdms', { status: 'refused', refusedAt: new Date().toISOString(), resetPossible: true }),
    saved('iras'),
    saved('xtrapower'),
  ],
  canEdit: true,
};

function picker(portals: PortalId[], opts: { withWemmis?: boolean } = {}) {
  h.get.mockImplementation(async (path: string) => {
    if (path === '/v1/me/portal-logins') return VIEW;
    if (path === '/v1/me/wemmis-login') return { status: 'missing', username: null, canEdit: true, reset: null };
    throw new Error(`unexpected GET ${path}`);
  });
  const message = makeMessage({
    id: 'picker-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    body: 'Which password do you want to change? Choose it below.',
    portalLogin: { portals, pick: true, ...(opts.withWemmis ? { withWemmis: true } : {}) },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

const choices = () =>
  [...document.querySelectorAll<HTMLElement>('[data-choice]')].map((el) => el.getAttribute('data-choice'));

describe('"Which password?"', () => {
  it('lists every login the pump has, then the app’s own password, with where each stands', async () => {
    picker(['sdms', 'iras', 'xtrapower']);
    await screen.findByText('Old password not working');
    expect(choices()).toEqual(['sdms', 'iras', 'xtrapower', 'app']);
    expect(screen.getByRole('button', { name: /SDMS login/ })).toHaveTextContent('Old password not working');
    expect(screen.getByRole('button', { name: /IRAS login/ })).toHaveTextContent('Saved');
    // Nothing to type until a password is chosen.
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('offers eMaaptaul when the pump has it', async () => {
    picker(['sdms'], { withWemmis: true });
    await screen.findByText('Old password not working');
    expect(choices()).toEqual(['sdms', 'wemmis', 'app']);
  });

  it('opens the chosen login ready for the new password, with Forgot password, and goes back to the list', async () => {
    picker(['sdms', 'iras', 'xtrapower']);
    await screen.findByText('Old password not working');
    fireEvent.click(screen.getByRole('button', { name: /IRAS login/ }));
    const iras = document.querySelector<HTMLElement>('[data-portal="iras"]')!;
    // A saved login opens straight on the form: no "Change" to find first.
    expect(within(iras).getByLabelText('Password')).toBeInTheDocument();
    expect(document.querySelector('[data-portal="sdms"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All passwords' }));
    fireEvent.click(await screen.findByRole('button', { name: /SDMS login/ }));
    const sdms = document.querySelector<HTMLElement>('[data-portal="sdms"]')!;
    expect(within(sdms).getByLabelText('Password')).toBeInTheDocument();
    expect(within(sdms).getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('sends the app’s own password to Settings', async () => {
    picker(['sdms']);
    fireEvent.click(await screen.findByRole('button', { name: /Dealer Kavach app/ }));
    expect(screen.getByText(/Settings › Account/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings/account');
  });

  it('does not offer a login the pump no longer has', async () => {
    picker(['sdms', 'partners']);
    await screen.findByText('Old password not working');
    expect(choices()).toEqual(['sdms', 'app']);
  });
});
