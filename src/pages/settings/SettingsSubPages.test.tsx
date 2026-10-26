import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
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
      <Route path="/login" element={<div>login-page</div>} />
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
    signIn({ role: 'dealer-staff', status: 'ACTIVE', email: 'manager@pump.in' });
    renderAt('/settings/profile');
    expect(screen.getByText('Not added')).toBeInTheDocument();
    expect(screen.getByText('Manager', { selector: 'dd' })).toBeInTheDocument();
  });

  // A dealer who registered with a mobile number only has no email at all.
  it('says a missing email is "Not added" too — the mobile number is what they sign in with', () => {
    signIn({ role: 'dealer-owner', status: 'ACTIVE', email: '', phone: '9876543210' });
    renderAt('/settings/profile');
    expect(screen.getByText('Not added')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
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

describe('Settings → account (delete my account)', () => {
  beforeEach(() => signIn({ id: 'u1', role: 'dealer-owner' }));

  async function openConfirm() {
    const user = userEvent.setup();
    renderAt('/settings/account');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    return user;
  }

  it('asks first, says what happens, and Cancel sends nothing', async () => {
    const user = await openConfirm();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete your account?');
    expect(dialog).toHaveTextContent('your login stops working at once');
    expect(dialog).toHaveTextContent('wiped after 30 days');
    expect(dialog).toHaveTextContent("Your outlet's reports and records stay with the outlet.");
    expect(dialog).toHaveTextContent('within 30 days');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('deletes, signs out and lands on the sign-in screen', async () => {
    vi.mocked(api.post).mockResolvedValue({ wipeOn: '2026-11-25T00:00:00.000Z' } as never);
    const user = await openConfirm();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/v1/me/delete-account', { confirm: true }),
    );
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(useAuthStore.getState().user).toBeNull();
    // The note the sign-in screen shows once.
    expect(sessionStorage.getItem('mdg.client.accountDeleted')).toBe('1');
  });

  it('stays signed in and says so when the server could not do it', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(500, 'INTERNAL', 'no'));
    const user = await openConfirm();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(
      await screen.findByText('Could not delete your account. Check your network and try again.'),
    ).toBeInTheDocument();
    expect(useAuthStore.getState().user).not.toBeNull();
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
    await user.type(
      screen.getByPlaceholderText("Manager's mobile number (they sign in with it)"),
      '+91 98765 43210',
    );
    await user.type(screen.getByPlaceholderText('Email (optional)'), 'new@pump.in');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'temp-pass-1');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/v1/dealer-users', {
      dealerId: 'd1',
      phone: '9876543210',
      email: 'new@pump.in',
      name: 'New Manager',
      role: 'dealer-staff',
      password: 'temp-pass-1',
    });
  });

  it('adds a manager by mobile alone — no email needed — and refuses a number that is not a mobile', async () => {
    signIn(owner);
    vi.mocked(api.get).mockResolvedValue([] as never);
    vi.mocked(api.post).mockResolvedValue({} as never);
    renderAt('/settings/team');

    await screen.findByText('No teammates yet.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    await user.type(screen.getByPlaceholderText('Full name'), 'New Manager');
    const mobile = screen.getByPlaceholderText("Manager's mobile number (they sign in with it)");
    await user.type(mobile, '12345');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'temp-pass-1');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(
      await screen.findByText('Enter a 10-digit mobile number that starts with 6, 7, 8 or 9'),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.clear(mobile);
    await user.type(mobile, '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/v1/dealer-users', {
      dealerId: 'd1',
      phone: '9876543210',
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
    await user.type(
      screen.getByPlaceholderText("Manager's mobile number (they sign in with it)"),
      '9876543211',
    );
    await user.type(screen.getByPlaceholderText('Temporary password'), 'temp-pass-1');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(
      await screen.findByText(
        'Your pump already has a manager. Pause them first, or ask the MDG team.',
      ),
    ).toBeInTheDocument();
  });
});
