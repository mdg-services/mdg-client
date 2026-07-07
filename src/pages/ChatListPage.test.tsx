import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import { useLangStore } from '@/store/lang';
import type { Conversation } from '@dk/shared/types';

const h = vi.hoisted(() => ({
  result: { isLoading: false, data: [] as Conversation[] | undefined },
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
    h.result = { isLoading: false, data: [] };
  });

  it('shows an empty state when there are no conversations', async () => {
    h.result = { isLoading: false, data: [] };
    renderList();
    expect(await screen.findByText('No chats yet')).toBeInTheDocument();
  });

  it('auto-forwards a single-thread member straight into their chat', async () => {
    h.result = { isLoading: false, data: [conv({ id: 'only' })] };
    renderList();
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
  });

  it('renders a list of threads and opens one on tap', async () => {
    h.result = {
      isLoading: false,
      data: [
        conv({ id: 'support', kind: 'support' }),
        conv({ id: 'mgr', kind: 'manager', userId: 'manager' }),
      ],
    };
    renderList();
    expect(await screen.findByText('Support')).toBeInTheDocument();
    const managerRow = await screen.findByText('Manager chat');
    fireEvent.click(managerRow);
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
  });
});
