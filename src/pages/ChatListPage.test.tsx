import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

/** The slice of the query result ChatListPage reads. */
interface QueryStub {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isError: boolean;
  isFetching: boolean;
  data: Conversation[] | undefined;
  refetch: () => void;
}

function loaded(data: Conversation[]): QueryStub {
  return {
    status: 'success',
    fetchStatus: 'idle',
    isError: false,
    isFetching: false,
    data,
    refetch: h.refetch,
  };
}

const h = vi.hoisted(() => ({
  result: undefined as unknown as QueryStub,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => h.result,
}));

const { ChatListPage } = await import('./ChatListPage');

function conv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    dealerId: 'd1',
    userId: 'owner',
    kind: 'support',
    participantUserIds: ['owner'],
    status: 'OPEN',
    unreadByAdmin: false,
    unreadByDealer: false,
    unreadDealerUserIds: [],
    lastMessageAt: '2026-01-01T10:00:00.000Z',
    lastMessagePreview: 'hi',
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Conversation;
}

function renderList() {
  signIn({ id: 'owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/chat" element={<ChatListPage />} />
      <Route path="/chat/:id" element={<div>thread-page</div>} />
    </Routes>,
    { route: '/chat', withRouter: true },
  );
}

describe('ChatListPage', () => {
  afterEach(() => {
    resetStores();
    h.refetch.mockReset();
  });

  it('shows an empty state when there are no conversations', async () => {
    h.result = loaded([]);
    renderList();
    expect(await screen.findByText('No chats yet')).toBeInTheDocument();
  });

  it('auto-forwards a single-thread member straight into their chat', async () => {
    h.result = loaded([conv({ id: 'only' })]);
    renderList();
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
  });

  it('renders a list of threads and opens one on tap', async () => {
    h.result = loaded([
      conv({ id: 'support', kind: 'support' }),
      conv({ id: 'mgr', kind: 'manager', userId: 'manager' }),
    ]);
    renderList();
    expect(await screen.findByText('Support')).toBeInTheDocument();
    const managerRow = await screen.findByText('Manager chat');
    fireEvent.click(managerRow);
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
  });

  /**
   * The reported bug: the fetch failed and the dealer was told "No chats yet".
   * Their chats were all still on the server — the page turned a transport
   * failure into a confident, wrong, dead-end empty state.
   */
  it('shows a retryable error — NOT "No chats yet" — when the fetch fails', async () => {
    h.result = {
      status: 'error',
      fetchStatus: 'idle',
      isError: true,
      isFetching: false,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();

    expect(await screen.findByText("We couldn't load your chats")).toBeInTheDocument();
    expect(screen.queryByText('No chats yet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  /**
   * Offline: react-query PAUSES the query — status stays 'pending' while
   * fetchStatus is 'paused', so `isLoading` is false. Without this branch the
   * page would fall straight through to the empty state.
   */
  it('shows the retryable error when the query is paused (offline)', async () => {
    h.result = {
      status: 'pending',
      fetchStatus: 'paused',
      isError: false,
      isFetching: false,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();

    expect(await screen.findByText("We couldn't load your chats")).toBeInTheDocument();
    expect(screen.queryByText('No chats yet')).not.toBeInTheDocument();
  });
});
