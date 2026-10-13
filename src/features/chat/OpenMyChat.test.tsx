import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { makeTestQueryClient, resetStores, signIn } from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

import { OpenMyChat } from './OpenMyChat';

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: h.get } }));

function convo(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-own',
    dealerId: 'd1',
    userId: 'u1',
    kind: 'support',
    participantUserIds: ['u1'],
    status: 'OPEN',
    unreadByAdmin: false,
    unreadByDealer: false,
    unreadDealerUserIds: [],
    lastMessageAt: '',
    lastMessagePreview: '',
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Conversation;
}

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>;
}
function Back() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      back
    </button>
  );
}

/**
 * The four retired addresses — /asks, /documents, /density, /kavach — all mount
 * this. Rendered here inside the real route shapes, with a history behind it so
 * `replace` can be told from `push`.
 */
function mount(route: string, qc = makeTestQueryClient()) {
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/chat', route]} initialIndex={1}>
        <Routes>
          {['/asks', '/documents', '/density', '/kavach'].map((path) => (
            <Route key={path} path={path} element={<OpenMyChat />} />
          ))}
          <Route path="/chat" element={<div>chat-list</div>} />
          <Route path="/chat/:id" element={<div>thread</div>} />
        </Routes>
        <Where />
        <Back />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { qc, ...view };
}

beforeEach(() => {
  h.get.mockReset();
  signIn({ id: 'u1' });
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('OpenMyChat — what the retired addresses do now', () => {
  it.each(['/asks', '/documents', '/documents?ask=a1', '/density', '/kavach'])(
    '%s opens the member\'s own chat',
    async (route) => {
      h.get.mockResolvedValue([convo({ id: 'c-support', userId: 'someone-else' }), convo()]);
      mount(route);
      expect(await screen.findByText('thread')).toBeInTheDocument();
      // The member's OWN thread (the one they are the primary member of), not the first one listed.
      expect(screen.getByTestId('where')).toHaveTextContent('/chat/c-own');
    },
  );

  it('drops the query string — ?ask= named a card on a screen that no longer exists', async () => {
    h.get.mockResolvedValue([convo()]);
    mount('/documents?ask=a1');
    await screen.findByText('thread');
    expect(screen.getByTestId('where').textContent).toBe('/chat/c-own');
  });

  it('REPLACES the address: Back from the chat does not come back to a redirect', async () => {
    h.get.mockResolvedValue([convo()]);
    mount('/documents');
    await screen.findByText('thread');

    fireEvent.click(screen.getByText('back'));

    // Straight to what was behind /documents, not to /documents again.
    expect(await screen.findByText('chat-list')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/chat');
  });

  it('waits for the list while it loads — a spinner, not a guess', async () => {
    let answer!: (c: Conversation[]) => void;
    h.get.mockReturnValue(new Promise<Conversation[]>((r) => (answer = r)));
    mount('/density');

    // Nothing of either destination yet.
    expect(screen.queryByText('thread')).toBeNull();
    expect(screen.queryByText('chat-list')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/density');

    answer([convo({ id: 'late' })]);
    await screen.findByText('thread');
    expect(screen.getByTestId('where')).toHaveTextContent('/chat/late');
  });

  it('opens at once when the list is already loaded', async () => {
    const qc = makeTestQueryClient();
    qc.setQueryData(myConversationsKey, [convo({ id: 'cached' })]);
    h.get.mockReturnValue(new Promise(() => undefined));
    mount('/kavach', qc);
    expect(await screen.findByText('thread')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/chat/cached');
  });

  it('a list that could not be loaded goes to the chat LIST, which says so and offers a retry — never a spinner that never ends', async () => {
    h.get.mockRejectedValue(new Error('boom'));
    mount('/asks');
    expect(await screen.findByText('chat-list')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/chat'));
  });

  it('a phone that is offline goes to the list too — a paused request never settles', async () => {
    onlineManager.setOnline(false);
    try {
      h.get.mockReturnValue(new Promise(() => undefined));
      mount('/kavach');
      expect(await screen.findByText('chat-list')).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('falls back to the list for a member with no thread at all', async () => {
    h.get.mockResolvedValue([]);
    mount('/documents');
    expect(await screen.findByText('chat-list')).toBeInTheDocument();
  });
});
