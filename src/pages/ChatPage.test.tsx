import { act, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import { useLangStore } from '@/store/lang';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeMessage, renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation, TicketDealerView } from '@dk/shared/types';

import { ChatPage } from './ChatPage';

const h = vi.hoisted(() => ({
  socket: null as unknown as FakeSocket,
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));
vi.mock('@/lib/api', () => ({ api: h.api }));

/**
 * The dealer's chat, end to end through the real list cache.
 *
 * The status line under a bubble reads `conversation.tickets`, and that comes
 * from the conversations LIST cache, which `useConversationsListSocket` (mounted
 * once in AppShell) upserts on `conversation:updated`. This mounts both, with
 * the real page, list and bubble, and drives the server's event.
 */

const CONVERSATION_ID = 'c1';

function ticket(over: Partial<TicketDealerView> = {}): TicketDealerView {
  return {
    id: 't-42',
    number: 42,
    state: 'OPEN',
    seen: false,
    raisedAt: '2026-10-12T09:00:00.000Z',
    ...over,
  };
}

function conversation(tickets: TicketDealerView[] | undefined): Conversation {
  return {
    id: CONVERSATION_ID,
    dealerId: 'd1',
    userId: 'u1',
    kind: 'support',
    participantUserIds: ['u1'],
    status: 'OPEN',
    unreadByAdmin: false,
    unreadByDealer: false,
    unreadDealerUserIds: [],
    lastMessageAt: '2026-10-12T09:00:05.000Z',
    lastMessagePreview: 'hi',
    ...(tickets ? { tickets } : {}),
    createdAt: '',
    updatedAt: '',
  } as Conversation;
}

const history = [
  makeMessage({
    id: 'q',
    conversationId: CONVERSATION_ID,
    senderId: 'u1',
    body: 'Mera credit limit kab badhega?',
    readBy: ['u1'],
    createdAt: '2026-10-12T09:00:00.000Z',
  }),
  makeMessage({
    id: 'handoff',
    conversationId: CONVERSATION_ID,
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    body: 'Ye MDG team ko bhej diya hai.',
    readBy: ['u1'],
    createdAt: '2026-10-12T09:00:05.000Z',
    ai: {
      turnId: 'turn-1',
      kind: 'handoff',
      intent: 'talk_to_human',
      templateId: 'handoff.escalated',
      ticketId: 't-42',
    } as never,
  }),
];

/** AppShell mounts the list listener; so does this, around the page. */
function Harness() {
  useConversationsListSocket();
  return (
    <Routes>
      <Route path="/chat/:id" element={<ChatPage />} />
    </Routes>
  );
}

function mount(initial: Conversation) {
  h.api.get.mockImplementation((path: string) => {
    if (path === '/v1/conversations/mine') return Promise.resolve([initial]);
    if (path === `/v1/conversations/${CONVERSATION_ID}/messages`) {
      return Promise.resolve(history);
    }
    return Promise.resolve([]);
  });
  return renderWithProviders(<Harness />, { route: `/chat/${CONVERSATION_ID}` });
}

/** What the server sends every dealer participant when a ticket changes. */
function serverUpdates(next: Conversation) {
  act(() => h.socket.server('conversation:updated', { conversation: next }));
}

describe('ChatPage — the ticket status line', () => {
  beforeEach(() => {
    h.socket = makeFakeSocket(true);
    h.api.get.mockReset();
    signIn({ id: 'u1' });
    useLangStore.setState({ lang: 'en', explicit: true });
  });
  afterEach(() => resetStores());

  it('shows where the raised ticket stands under the message that raised it', async () => {
    mount(conversation([ticket()]));
    expect(await screen.findByText('#42 · Sent to the MDG team')).toBeInTheDocument();
  });

  it('updates in place when a conversation:updated arrives with the ticket changed', async () => {
    mount(conversation([ticket()]));
    await screen.findByText('#42 · Sent to the MDG team');

    // An admin opens it.
    serverUpdates(conversation([ticket({ seen: true })]));
    expect(await screen.findByText('#42 · MDG team is looking at it')).toBeInTheDocument();
    expect(screen.queryByText('#42 · Sent to the MDG team')).toBeNull();

    // An admin resolves it.
    serverUpdates(
      conversation([ticket({ seen: true, state: 'RESOLVED', resolvedAt: '2026-10-12T09:30:00.000Z' })]),
    );
    expect(await screen.findByText('#42 · Closed by the MDG team')).toBeInTheDocument();
    expect(screen.queryByText('#42 · MDG team is looking at it')).toBeNull();
  });

  it('draws the line in Hindi when the app is in Hindi, and follows a switch', async () => {
    mount(conversation([ticket({ seen: true })]));
    expect(await screen.findByText('#42 · MDG team is looking at it')).toBeInTheDocument();
    act(() => useLangStore.setState({ lang: 'hi', explicit: true }));
    expect(await screen.findByText('#42 · MDG टीम देख रही है')).toBeInTheDocument();
  });

  it('shows nothing once the conversation stops listing the ticket', async () => {
    mount(conversation([ticket()]));
    await screen.findByText('#42 · Sent to the MDG team');

    // A resolved ticket past the server's seven-day window drops out.
    serverUpdates(conversation([]));
    await waitFor(() => expect(screen.queryByText(/#42/)).toBeNull());
    // The message that raised it is still in the thread.
    expect(screen.getByText('Ye MDG team ko bhej diya hai.')).toBeInTheDocument();
  });

  it('shows nothing from a server that sends no tickets at all', async () => {
    mount(conversation(undefined));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    expect(screen.queryByText(/#42/)).toBeNull();
  });

  it('offers no way to ask for a person: no button under the reply, no chip', async () => {
    mount(conversation([ticket()]));
    await screen.findByText('Ye MDG team ko bhej diya hai.');
    expect(screen.queryByText(/talk to a person/i)).toBeNull();
    expect(screen.queryByText(/talk to support/i)).toBeNull();
    expect(screen.queryByText(/someone from mdg is coming/i)).toBeNull();
  });
});
