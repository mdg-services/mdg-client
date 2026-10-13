import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), patch: vi.fn() } };
});

const { SettingsPage } = await import('./SettingsPage');

/** A stand-in for each place a row leads, so the test reads where a tap went. */
const DESTINATIONS = [
  '/settings/profile',
  '/settings/account',
  '/settings/team',
  '/services',
  '/staff',
  '/login',
];

function renderSettings(route = '/settings') {
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/chat" element={<Link to="/settings">open-settings</Link>} />
      <Route path="/settings" element={<SettingsPage />} />
      {DESTINATIONS.map((path) => (
        <Route key={path} path={path} element={<div>{`went:${path}`}</div>} />
      ))}
    </Routes>,
    { route, withRouter: true },
  );
}

const rows = () =>
  screen
    .getAllByRole('button')
    // Everything below the profile row and above the end, by its title text.
    .map((b) => b.textContent ?? '');

beforeEach(() => {
  vi.mocked(api.patch).mockResolvedValue({} as never);
  // The sheets lock the page's scroll, and jsdom has no `scrollTo` to do it with.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  resetStores();
});

describe('SettingsPage — what is on it', () => {
  it('lists the owner\'s rows in WhatsApp order, with a line saying what is behind each', () => {
    signIn({ id: 'owner', name: 'Ramesh Kumar', role: 'dealer-owner', email: 'ramesh@pump.in' });
    renderSettings();

    const text = rows();
    const order = [
      'Account',
      'Language',
      'Your team',
      'Your services',
      'Warriors & points',
      'Help',
      'Log out',
    ];
    const positions = order.map((title) => text.findIndex((t) => t.startsWith(title)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    // Each row says one thing under its title.
    expect(screen.getByText('Change your password')).toBeInTheDocument();
    expect(screen.getByText('Add or pause your manager')).toBeInTheDocument();
    expect(screen.getByText('Learn the app with short videos')).toBeInTheDocument();
  });

  it('is headed Settings, with a back arrow', () => {
    signIn({ role: 'dealer-owner' });
    renderSettings();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('shows the profile row first: name, role, and the phone', () => {
    signIn({ name: 'Ramesh Kumar', role: 'dealer-owner', email: 'r@pump.in', phone: '9876543210' });
    renderSettings();
    const profile = screen.getByText('Ramesh Kumar').closest('button')!;
    expect(within(profile).getByText('Owner')).toBeInTheDocument();
    expect(within(profile).getByText('9876543210')).toBeInTheDocument();
    // The phone, when there is one, stands in for the email.
    expect(within(profile).queryByText('r@pump.in')).not.toBeInTheDocument();
  });

  it('falls back to the email when no phone is on file', () => {
    signIn({ name: 'Ramesh Kumar', role: 'dealer-owner', email: 'r@pump.in' });
    renderSettings();
    expect(screen.getByText('r@pump.in')).toBeInTheDocument();
  });

  // Only the owner runs the team, and the server refuses everyone else.
  it('leaves "Your team" out for a manager, who still gets Warriors & points', () => {
    signIn({ role: 'dealer-staff' });
    renderSettings();
    expect(screen.queryByText('Your team')).not.toBeInTheDocument();
    expect(screen.getByText('Warriors & points')).toBeInTheDocument();
  });

  // MDG asks for papers, the register page and Pump health photos IN THE CHAT now,
  // so Settings has no door to a screen for any of them. A row coming back would
  // be a screen the app no longer has.
  it.each(['Your papers', 'Density register', 'Pump health'])(
    'has no "%s" row — that is asked in the chat now',
    (title) => {
      signIn({ role: 'dealer-owner' });
      renderSettings();
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    },
  );

  it('never asks the server about the density service or a Kavach programme', () => {
    signIn({ role: 'dealer-owner' });
    renderSettings();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('says so, with the bar still on screen, when nobody is signed in', () => {
    renderSettings();
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});

describe('SettingsPage — where a row goes', () => {
  beforeEach(() => {
    signIn({ role: 'dealer-owner', name: 'Ramesh Kumar' });
  });

  it.each([
    ['Ramesh Kumar', '/settings/profile'],
    ['Account', '/settings/account'],
    ['Your team', '/settings/team'],
    ['Your services', '/services'],
    ['Warriors & points', '/staff'],
  ])('%s opens %s', (title, path) => {
    renderSettings();
    fireEvent.click(screen.getByText(title).closest('button')!);
    expect(screen.getByText(`went:${path}`)).toBeInTheDocument();
  });

  it('opens the video guide outside the app, in the dealer\'s language', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderSettings();
    fireEvent.click(screen.getByText('Help').closest('button')!);
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0]!;
    expect(String(url)).toMatch(/\?lang=en$/);
    expect(target).toBe('_blank');
    expect(features).toBe('noopener');
  });
});

describe('SettingsPage — the back arrow', () => {
  beforeEach(() => signIn({ role: 'dealer-owner' }));

  it('goes back to where the dealer came from', async () => {
    renderSettings('/chat');
    fireEvent.click(screen.getByText('open-settings'));
    expect(await screen.findByText('Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('open-settings')).toBeInTheDocument();
  });

  // Opened cold from a notification there is nothing behind it: Back would walk
  // off the app, so the arrow takes the dealer to the chat list instead.
  it('goes to the chat list when Settings was the first thing opened', async () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/chat" element={<div>chat-list</div>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('chat-list')).toBeInTheDocument();
  });
});

describe('SettingsPage — language', () => {
  beforeEach(() => signIn({ role: 'dealer-owner' }));

  it('names the current language under the row', () => {
    renderSettings();
    const row = screen.getByText('Language').closest('button')!;
    expect(within(row).getByText('English')).toBeInTheDocument();
  });

  it('opens a sheet with both languages, each in its own script', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    const sheet = screen.getByRole('dialog', { name: 'Language' });
    const options = within(sheet).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['हिंदी', 'English']);
    expect(within(sheet).getByRole('radio', { name: 'English' })).toBeChecked();
  });

  it('switches the whole app at once, saves it to the account, and closes', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: 'हिंदी' }));

    expect(useLangStore.getState().lang).toBe('hi');
    expect(api.patch).toHaveBeenCalledWith('/v1/me', { lang: 'hi' });
    expect(useAuthStore.getState().user?.lang).toBe('hi');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The page redraws in the new language straight away.
    expect(screen.getByText('सेटिंग')).toBeInTheDocument();
  });

  it('does not call the server when the dealer picks the language they already have', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('survives a failed save: the language still switches', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('offline'));
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: 'हिंदी' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(useLangStore.getState().lang).toBe('hi');
  });

  // A sheet that Back walked straight through would take the dealer off Settings.
  it("closes on the phone's Back button and leaves Settings where it is", async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('closes on a tap outside it', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('SettingsPage — log out', () => {
  let logout: ReturnType<typeof vi.fn>;
  const realLogout = useAuthStore.getState().logout;

  beforeEach(() => {
    signIn({ role: 'dealer-owner' });
    // The real one reaches for the push bridge and a network; what matters here
    // is that it was called, and that the session ended.
    logout = vi.fn(() => useAuthStore.setState({ token: null, user: null }));
    useAuthStore.setState({ logout: logout as unknown as () => void });
  });
  afterEach(() => useAuthStore.setState({ logout: realLogout }));

  it('is the last row, in red, and asks before it does anything', () => {
    renderSettings();
    const row = screen.getByText('Log out').closest('button')!;
    expect(screen.getByText('Log out').className).toContain('text-danger');
    expect(rows().at(-1)).toBe('Log out');

    fireEvent.click(row);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('keeps the dealer signed in when they cancel', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Log out').closest('button')!);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('signs out and goes to the login screen when they confirm', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Log out').closest('button')!);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('went:/login')).toBeInTheDocument();
  });

  it('is cancelled by the phone\'s Back button', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Log out').closest('button')!);
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });
});
