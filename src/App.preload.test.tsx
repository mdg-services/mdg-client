import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { markAccountHere } from '@/features/auth/firstScreen';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

import { App } from './App';

// Which screens the app downloads ahead of the tap. Each page stub notes the moment its
// code is first fetched, so what the preloader asked for can be read back by name.
const h = vi.hoisted(() => ({
  loaded: [] as string[],
  lists: null as null | { all: Array<{ preload: () => Promise<void> }>; slow: Array<{ preload: () => Promise<void> }> },
}));

vi.mock('@/lib/lazyRoute', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    preloadScreens: (all: never[], slow: never[]) => {
      h.lists = { all, slow };
      return () => undefined;
    },
  };
});

vi.mock('@/AppShell', async () => {
  const { Outlet } = await import('react-router-dom');
  return { AppShell: () => <Outlet /> };
});
vi.mock('@/features/chat/OpenMyChat', () => ({ OpenMyChat: () => <div>open-my-chat</div> }));
vi.mock('@/pages/TodayPage', () => {
  h.loaded.push('today');
  return { TodayPage: () => <div>today-page</div> };
});
vi.mock('@/pages/ChatListPage', () => {
  h.loaded.push('chats');
  return { ChatListPage: () => <div>chat-list-page</div> };
});
vi.mock('@/pages/ChatPage', () => {
  h.loaded.push('chat');
  return { ChatPage: () => <div>chat-page</div> };
});
vi.mock('@/pages/SettingsPage', () => {
  h.loaded.push('settings');
  return { SettingsPage: () => <div>settings-page</div> };
});

afterEach(() => resetStores());

describe('the screens the app downloads ahead of the tap (ADR 0055)', () => {
  it('puts the Chats tab\'s list in the short list for a slow link, not the screen already on show', async () => {
    markAccountHere();
    signIn();
    renderWithProviders(<App />, { route: '/asks', withRouter: true });
    expect(await screen.findByText('open-my-chat')).toBeInTheDocument();
    expect(h.lists).not.toBeNull();
    // Nothing has been fetched yet: the route above is a stub of its own.
    expect(h.loaded).toEqual([]);

    await Promise.all(h.lists!.slow.map((s) => s.preload()));
    expect([...h.loaded].sort()).toEqual(['chat', 'chats']);

    // The long list is the short one plus the rest, Today and Settings among them.
    await Promise.all(h.lists!.all.map((s) => s.preload()));
    expect([...h.loaded].sort()).toEqual(['chat', 'chats', 'settings', 'today']);
  });
});
