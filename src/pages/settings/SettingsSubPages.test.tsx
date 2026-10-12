import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { User } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  };
});

const { SettingsAccountPage } = await import('./AccountPage');
const { SettingsProfilePage } = await import('./ProfileInfoPage');
const { SettingsTeamPage } = await import('./TeamPage');

/** Every page here is reached from Settings, so that is what sits behind it. */
function renderAt(route: string) {
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/settings" element={<div>settings-page</div>} />
      <Route path="/chat" element={<div>chat-list</div>} />
      <Route path="/settings/profile" element={<SettingsProfilePage />} />
      <Route path="/settings/account" element={<SettingsAccountPage />} />
      <Route path="/settings/team" element={<SettingsTeamPage />} />
    </Routes>,
    { route, withRouter: true },
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.patch).mockReset();
});
afterEach(() => resetStores());

describe('Settings → profile', () => {
  it('shows who this login is', () => {
    signIn({
      id: 'u1',
      name: 'Ramesh Kumar',
      role: 'dealer-owner',
      email: 'ramesh@pump.in',
      phone: '9876543210',
      status: 'ACTIVE',
    });
    renderAt('/settings/profile');

    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Ramesh Kumar', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('ramesh@pump.in')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('says a missing phone is "Not added" rather than leaving a blank', () => {
    signIn({ role: 'dealer-staff', status: 'ACTIVE' });
    renderAt('/settings/profile');
    expect(screen.getByText('Not added')).toBeInTheDocument();
    expect(screen.getByText('Manager', { selector: 'dd' })).toBeInTheDocument();
  });

  it('shows a paused login as paused', () => {
    signIn({ role: 'dealer-staff', status: 'SUSPENDED' as User['status'] });
    renderAt('/settings/profile');
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  // A dealer cannot edit these, so the page does not draw fields that look
  // editable — it says who to ask.
  it('offers no inputs, and points at the MDG team instead', () => {
    signIn({ role: 'dealer-owner', status: 'ACTIVE' });
    renderAt('/settings/profile');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(
      screen.getByText('To change your name, email or phone, message the MDG team.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Message us' }));
    expect(screen.getByText('chat-list')).toBeInTheDocument();
  });

  it('goes back to Settings when it was opened cold', async () => {
    signIn({ role: 'dealer-owner', status: 'ACTIVE' });
    renderAt('/settings/profile');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('settings-page')).toBeInTheDocument();
  });
});

describe('Settings → account (change password)', () => {
  beforeEach(() => signIn({ id: 'u1', role: 'dealer-owner' }));

  async function fill(current: string, next: string, confirm: string) {
    const user = userEvent.setup();
    const [cur, nw, conf] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
    await user.type(cur!, current);
    await user.type(nw!, next);
    await user.type(conf!, confirm);
    await user.click(screen.getByRole('button', { name: 'Update password' }));
  }

  it('is headed Account and holds the password form', () => {
    renderAt('/settings/account');
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update password' })).toBeInTheDocument();
  });

  it('sends the CURRENT password along with the new one', async () => {
    vi.mocked(api.patch).mockResolvedValue({} as never);
    renderAt('/settings/account');
    await fill('old-secret', 'new-secret-1', 'new-secret-1');
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith('/v1/dealer-users/u1', {
      password: 'new-secret-1',
      currentPassword: 'old-secret',
    });
    expect(await screen.findByText('Your password has been changed')).toBeInTheDocument();
  });

  it('does not send anything when the two new passwords differ', async () => {
    renderAt('/settings/account');
    await fill('old-secret', 'new-secret-1', 'something-else');
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('does not send a new password shorter than eight characters', async () => {
    renderAt('/settings/account');
    await fill('old-secret', 'short', 'short');
    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('says the current password was wrong on a 401, and nothing else', async () => {
    vi.mocked(api.patch).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'no'));
    renderAt('/settings/account');
    await fill('wrong', 'new-secret-1', 'new-secret-1');
    expect(await screen.findByText('That current password is not right.')).toBeInTheDocument();
  });
});

describe('Settings → your team', () => {
  const owner = { id: 'u1', dealerId: 'd1', role: 'dealer-owner' as const };
  const member = (over: Partial<User>): User =>
    ({
      id: 'u2',
      name: 'Pump Manager',
      email: 'manager@pump.in',
      role: 'dealer-staff',
      status: 'ACTIVE',
      dealerId: 'd1',
      ...over,
    }) as User;

  it('is the owner\'s: anyone else goes back to Settings', async () => {
    signIn({ id: 'u2', dealerId: 'd1', role: 'dealer-staff' });
    renderAt('/settings/team');
    expect(await screen.findByText('settings-page')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('lists the people who can sign in, with their roles', async () => {
    signIn(owner);
    vi.mocked(api.get).mockResolvedValue([
      member({ id: 'u1', name: 'Ramesh Kumar', email: 'ramesh@pump.in', role: 'dealer-owner' }),
      member({}),
    ] as never);
    renderAt('/settings/team');

    expect(screen.getByText('Your team', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByText('Pump Manager')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/v1/dealers/d1/users');
    expect(screen.getByText('manager@pump.in')).toBeInTheDocument();
    // Only the MANAGER can be paused from here: a co-owner is MDG's to change.
    expect(screen.getAllByRole('button', { name: 'Suspend' })).toHaveLength(1);
  });

  // The failure must not read as "No teammates yet": the obvious next move is to
  // invite the manager again, which then fails on a duplicate email.
  it('shows a retry — not "No teammates yet" — when the list fails to load', async () => {
    signIn(owner);
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'ERR', 'boom'));
    renderAt('/settings/team');

    expect(await screen.findByText(/couldn't load this/i)).toBeInTheDocument();
    expect(screen.queryByText('No teammates yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('invites a manager, and always as a manager', async () => {
    signIn(owner);
    vi.mocked(api.get).mockResolvedValue([] as never);
    vi.mocked(api.post).mockResolvedValue({} as never);
    renderAt('/settings/team');

    await screen.findByText('No teammates yet.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    await user.type(screen.getByPlaceholderText('Full name'), 'New Manager');
    await user.type(screen.getByPlaceholderText('Email'), 'new@pump.in');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'temp-pass-1');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/v1/dealer-users', {
      dealerId: 'd1',
      email: 'new@pump.in',
      name: 'New Manager',
      role: 'dealer-staff',
      password: 'temp-pass-1',
    });
  });

  it('explains a second manager is not allowed, in words', async () => {
    signIn(owner);
    vi.mocked(api.get).mockResolvedValue([] as never);
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'This dealer already has a manager'),
    );
    renderAt('/settings/team');

    await screen.findByText('No teammates yet.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    await user.type(screen.getByPlaceholderText('Full name'), 'Second');
    await user.type(screen.getByPlaceholderText('Email'), 'second@pump.in');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'temp-pass-1');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(
      await screen.findByText(
        'Your pump already has a manager. Pause them first, or ask the MDG team.',
      ),
    ).toBeInTheDocument();
  });
});
