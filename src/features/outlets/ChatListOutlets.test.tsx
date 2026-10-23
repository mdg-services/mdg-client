import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
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

const FIRST: OutletChoice = { userId: 'u15', dealerId: 'd15', code: '15E', role: 'dealer-owner' };
const SECOND: OutletChoice = { userId: 'u16', dealerId: 'd16', code: '16E', role: 'dealer-owner' };

function renderList() {
  return renderWithProviders(
    <Routes>
      <Route path="/chat" element={<ChatListPage />} />
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

describe('ChatListPage — the pump chip', () => {
  it('shows "15E ▾" beside Search for a person with another pump, and opens the pumps', async () => {
    signIn({ id: 'u15', personId: 'p1' });
    vi.mocked(api.get).mockResolvedValue({ current: FIRST, outlets: [SECOND] } as never);
    renderList();
    const chip = await screen.findByRole('button', { name: 'Pump 15E. Tap to switch pump' });
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    fireEvent.click(chip);
    expect(await screen.findByRole('dialog', { name: 'Your pumps' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '16E' })).toBeInTheDocument();
  });

  it('is not there for everybody else, who make no request for it', () => {
    signIn({ id: 'u1' });
    renderList();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch pump/i })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
