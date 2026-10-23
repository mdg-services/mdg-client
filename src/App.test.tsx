import { act, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requirePasswordChange, useAuthStore } from '@/store/auth';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

import { App } from './App';

// Stub the lazy route chunks so the router resolves without loading real pages.
vi.mock('@/AppShell', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    AppShell: () => (
      <div data-testid="shell">
        <Outlet />
      </div>
    ),
  };
});
vi.mock('@/pages/ChatListPage', () => ({
  ChatListPage: () => <div>chat-list-page</div>,
}));
vi.mock('@/pages/ChatPage', () => ({ ChatPage: () => <div>chat-page</div> }));
vi.mock('@/pages/ChatMediaPage', () => ({ ChatMediaPage: () => <div>chat-media-page</div> }));
vi.mock('@/pages/ChatInfoPage', () => ({ ChatInfoPage: () => <div>chat-info-page</div> }));
vi.mock('@/pages/SettingsPage', () => ({ SettingsPage: () => <div>settings-page</div> }));
vi.mock('@/pages/settings/ProfileInfoPage', () => ({
  SettingsProfilePage: () => <div>settings-profile-page</div>,
}));
vi.mock('@/pages/settings/AccountPage', () => ({
  SettingsAccountPage: () => <div>settings-account-page</div>,
}));
vi.mock('@/pages/settings/TeamPage', () => ({
  SettingsTeamPage: () => <div>settings-team-page</div>,
}));
vi.mock('@/pages/ServicesPage', () => ({ ServicesPage: () => <div>services-page</div> }));
vi.mock('@/pages/StaffPage', () => ({ StaffPage: () => <div>staff-page</div> }));
// The redirect the four retired screens' addresses run is tested on its own
// (`OpenMyChat.test.tsx`); here it only has to be the thing those routes mount.
vi.mock('@/features/chat/OpenMyChat', () => ({ OpenMyChat: () => <div>open-my-chat</div> }));
vi.mock('@/pages/RegisterPage', () => ({ RegisterPage: () => <div>register-page</div> }));
// The screen itself is tested on its own (`ForcedPasswordChange.test.tsx`); here
// it only has to be what the gate shows.
vi.mock('@/features/auth/ForcedPasswordChange', () => ({
  ForcedPasswordChange: () => <div>forced-password-change</div>,
}));
vi.mock('@/pages/LoginPage', async () => {
  const { useLocation } = await import('react-router-dom');
  return {
    LoginPage: () => {
      const loc = useLocation();
      return (
        <div>
          login-page
          <span data-testid="from">{(loc.state as { from?: string } | null)?.from ?? ''}</span>
        </div>
      );
    },
  };
});

describe('App routing', () => {
  afterEach(() => resetStores());

  it('redirects an unauthenticated visit to /login carrying the from path', async () => {
    renderWithProviders(<App />, { route: '/settings', withRouter: true });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('from')).toHaveTextContent('/settings');
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('renders the shell + a per-thread ChatPage via the Outlet when authenticated', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/chat/c1' });
    expect(await screen.findByTestId('shell')).toBeInTheDocument();
    expect(await screen.findByText('chat-page')).toBeInTheDocument();
  });

  it('maps "/" to the conversation list under the protected layout', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/' });
    expect(await screen.findByText('chat-list-page')).toBeInTheDocument();
  });

  it('sends unknown paths to /chat (the list) via the catch-all', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/nope-nowhere' });
    expect(await screen.findByText('chat-list-page')).toBeInTheDocument();
  });

  // The Reports tab is gone, and so is its page. A link to it that is already on
  // a phone must land somewhere kind, not on a blank screen.
  it('sends the retired /records to the chat list', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/records' });
    expect(await screen.findByText('chat-list-page')).toBeInTheDocument();
  });

  it('serves a thread\'s media gallery and its info page inside the shell', async () => {
    signIn();
    const media = renderWithProviders(<App />, { route: '/chat/c1/media' });
    expect(await screen.findByText('chat-media-page')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    media.unmount();

    renderWithProviders(<App />, { route: '/chat/c1/info' });
    expect(await screen.findByText('chat-info-page')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  // `/profile` was the Profile tab. It is a second mount of Settings, not a
  // redirect, so nothing about the link is lost on the way.
  it.each(['/settings', '/profile'])('shows Settings at %s', async (route) => {
    signIn();
    renderWithProviders(<App />, { route });
    expect(await screen.findByText('settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  it.each([
    ['/settings/profile', 'settings-profile-page'],
    ['/settings/account', 'settings-account-page'],
    ['/settings/team', 'settings-team-page'],
  ])('serves the Settings sub-page %s', async (route, marker) => {
    signIn();
    renderWithProviders(<App />, { route });
    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  // The feature pages that survive keep the path they always had, because pushes
  // already on phones name them.
  it.each([
    ['/services', 'services-page'],
    ['/staff', 'staff-page'],
  ])('keeps %s', async (route, marker) => {
    signIn();
    renderWithProviders(<App />, { route });
    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  // ASKS LIVE IN THE CHAT. The paper list, the density screen and Pump health are
  // gone, but a push or a link already out there still names them — each must
  // open the member's own chat (not the list, not a blank page), with or without
  // the `?ask=` a push used to carry.
  it.each(['/asks', '/documents', '/documents?ask=a1', '/density', '/kavach'])(
    'opens the member\'s own chat from the retired address %s',
    async (route) => {
      signIn();
      renderWithProviders(<App />, { route });
      expect(await screen.findByText('open-my-chat')).toBeInTheDocument();
      expect(screen.getByTestId('shell')).toBeInTheDocument();
    },
  );

  it('does not serve the retired screens to someone who is signed out', async () => {
    renderWithProviders(<App />, { route: '/documents' });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('open-my-chat')).not.toBeInTheDocument();
  });

  // Someone with no login yet has to reach the sign-up form, so it must not
  // sit behind the sign-in gate.
  it('serves /register signed out, without bouncing to /login', async () => {
    renderWithProviders(<App />, { route: '/register' });
    expect(await screen.findByText('register-page')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  // A temporary password (one MDG's team gave) has to be replaced before anything
  // else: the whole app is swapped for the new-password screen.
  describe('a member on a temporary password', () => {
    it.each(['/', '/chat', '/chat/c1', '/settings', '/services'])(
      'sees only the new-password screen at %s, with no shell behind it',
      async (route) => {
        signIn({ mustChangePassword: true });
        renderWithProviders(<App />, { route });
        expect(await screen.findByText('forced-password-change')).toBeInTheDocument();
        expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
        expect(screen.queryByText('chat-list-page')).not.toBeInTheDocument();
      },
    );

    it('gets the app the moment the password is replaced', async () => {
      const user = signIn({ mustChangePassword: true });
      renderWithProviders(<App />, { route: '/chat' });
      await screen.findByText('forced-password-change');
      act(() => useAuthStore.getState().setUser({ ...user, mustChangePassword: false }));
      expect(await screen.findByTestId('shell')).toBeInTheDocument();
      expect(screen.getByText('chat-list-page')).toBeInTheDocument();
      expect(screen.queryByText('forced-password-change')).not.toBeInTheDocument();
    });

    it('is sent there when any call is refused for it', async () => {
      signIn();
      renderWithProviders(<App />, { route: '/chat' });
      expect(await screen.findByTestId('shell')).toBeInTheDocument();
      act(() => requirePasswordChange());
      expect(await screen.findByText('forced-password-change')).toBeInTheDocument();
      expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    });

    it('is not asked again once it is done', async () => {
      signIn({ mustChangePassword: false });
      renderWithProviders(<App />, { route: '/chat' });
      expect(await screen.findByTestId('shell')).toBeInTheDocument();
      expect(screen.queryByText('forced-password-change')).not.toBeInTheDocument();
    });

    it('still reaches the login and register screens signed out', async () => {
      renderWithProviders(<App />, { route: '/register' });
      expect(await screen.findByText('register-page')).toBeInTheDocument();
    });
  });

  it('serves /login without pulling the shell', async () => {
    renderWithProviders(<App />, { route: '/login' });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });
});
