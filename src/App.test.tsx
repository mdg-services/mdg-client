import { screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/pages/RegisterPage', () => ({ RegisterPage: () => <div>register-page</div> }));
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
    renderWithProviders(<App />, { route: '/records', withRouter: true });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('from')).toHaveTextContent('/records');
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

  // Someone with no login yet has to reach the sign-up form, so it must not
  // sit behind the sign-in gate.
  it('serves /register signed out, without bouncing to /login', async () => {
    renderWithProviders(<App />, { route: '/register' });
    expect(await screen.findByText('register-page')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('serves /login without pulling the shell', async () => {
    renderWithProviders(<App />, { route: '/login' });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });
});
