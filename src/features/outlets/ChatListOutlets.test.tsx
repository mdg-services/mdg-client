import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation, OutletChoice } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => ({
    status: 'success',
    fetchStatus: 'idle',
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    data: [
      {
        id: 'support',
        dealerId: 'd15',
        userId: 'u15',
        kind: 'support',
        participantUserIds: ['u15'],
        status: 'OPEN',
        unreadByAdmin: false,
        unreadByDealer: false,
        unreadDealerUserIds: [],
        lastMessageAt: new Date(2026, 9, 14, 9).toISOString(),
        lastMessagePreview: 'hi',
        createdAt: '',
        updatedAt: '',
      } as Conversation,
    ],
  }),
}));

const { ChatListPage } = await import('@/pages/ChatListPage');
const { PumpPage } = await import('@/pages/PumpPage');

const FIRST: OutletChoice = { userId: 'u15', dealerId: 'd15', code: '15E', role: 'dealer-owner' };
const SECOND: OutletChoice = { userId: 'u16', dealerId: 'd16', code: '16E', role: 'dealer-owner' };

function renderList() {
  return renderWithProviders(
    <Routes>
      <Route path="/chat" element={<ChatListPage />} />
      <Route path="/pump" element={<PumpPage />} />
    </Routes>,
    { route: '/chat', withRouter: true },
  );
}

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.mocked(api.get).mockReset();
});
afterEach(() => {
  resetStores();
});

/** What the server answers: the person's pumps, and the one line My pump needs to draw its card. */
function answer(view: { current: OutletChoice; outlets: OutletChoice[] }) {
  vi.mocked(api.get).mockImplementation(((path: string) => {
    if (path === '/v1/auth/outlets') return Promise.resolve(view);
    if (path === '/v1/me/outlet') return Promise.resolve({ fields: [] });
    return Promise.reject(new ApiError(404, 'NOT_FOUND', `unexpected GET ${path}`));
  }) as never);
}

describe('ChatListPage — switching pump (spec 4.5, 6.6: it moved to My pump)', () => {
  it('draws no pump chip beside Search, and leads a person with another pump to Switch pump on My pump', async () => {
    signIn({ id: 'u15', personId: 'p1' });
    answer({ current: FIRST, outlets: [SECOND] });
    renderList();

    // The old chip ("15E ▾" beside Search) is gone, and so is the sheet it opened.
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    // The one door is the My pump button, which says which pump this is.
    const door = await screen.findByRole('button', { name: 'My pump, 15E' });
    expect(screen.queryByRole('button', { name: /Tap to switch pump/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch pump' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // One tap to My pump, one tap on Switch pump: the same sheet, with the other pump to pick.
    fireEvent.click(door);
    fireEvent.click(await screen.findByRole('button', { name: 'Switch pump' }));
    expect(await screen.findByRole('dialog', { name: 'Your pumps' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '16E' })).toBeInTheDocument();
  });

  it('is not there for everybody else, who make no request for it', () => {
    signIn({ id: 'u1' });
    renderList();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch pump/i })).not.toBeInTheDocument();
    // The list asks for other things (its setup, the glance); nothing asks for the pump list.
    const asked = vi.mocked(api.get).mock.calls.map((c) => String(c[0]));
    expect(asked.filter((url) => url.includes('/auth/outlets'))).toEqual([]);
  });
});
