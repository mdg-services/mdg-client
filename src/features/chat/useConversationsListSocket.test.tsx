import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatAskStatesKey } from '@/hooks/api/useChatAskStates';
import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import {
  makeTestQueryClient,
  renderHookWithProviders,
  resetStores,
  signIn,
} from '@/test/utils';
import type { Conversation, Message } from '@dk/shared/types';

import { useConversationsListSocket } from './useConversationsListSocket';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

function makeConv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    dealerId: 'd1',
    userId: 'u1',
    kind: 'support',
    participantUserIds: ['u1'],
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

/** `route` is where the dealer is standing — `/chat/c1` means thread c1 is open. */
function mount(seed?: Conversation[], route = '/chat') {
  h.socket = makeFakeSocket(true);
  signIn({ id: 'u1' });
  const qc = makeTestQueryClient();
  if (seed) qc.setQueryData(myConversationsKey, seed);
  const view = renderHookWithProviders(() => useConversationsListSocket(), {
    queryClient: qc,
    route,
  });
  return { qc, ...view };
}
const list = (qc: ReturnType<typeof makeTestQueryClient>) =>
  qc.getQueryData<Conversation[]>(myConversationsKey);

describe('useConversationsListSocket', () => {
  afterEach(() => resetStores());

  it('updates an existing conversation in the list on conversation:updated', () => {
    const { qc } = mount([makeConv({ id: 'c1', lastMessagePreview: 'old' })]);
    act(() =>
      h.socket.server('conversation:updated', {
        conversation: makeConv({ id: 'c1', lastMessagePreview: 'new' }),
      }),
    );
    expect(list(qc)!.find((c) => c.id === 'c1')!.lastMessagePreview).toBe('new');
  });

  it('prepends a NEW conversation on message:new and keeps the list newest-first', () => {
    const { qc } = mount([
      makeConv({ id: 'c1', lastMessageAt: '2026-01-01T09:00:00.000Z' }),
    ]);
    act(() =>
      h.socket.server('message:new', {
        message: {},
        conversation: makeConv({ id: 'c2', lastMessageAt: '2026-01-01T12:00:00.000Z' }),
      }),
    );
    expect(list(qc)!.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it("replaces a thread's tickets whole on conversation:updated, so the status line follows", () => {
    const raised = { id: 't1', number: 42, state: 'OPEN' as const, seen: false, raisedAt: '' };
    const { qc } = mount([makeConv({ id: 'c1', tickets: [raised] })]);
    act(() =>
      h.socket.server('conversation:updated', {
        conversation: makeConv({ id: 'c1', tickets: [{ ...raised, seen: true }] }),
      }),
    );
    expect(list(qc)!.find((c) => c.id === 'c1')!.tickets).toEqual([{ ...raised, seen: true }]);

    // A ticket that aged out of the server's window is gone from the payload,
    // and must be gone from the cache — not merged back in.
    act(() =>
      h.socket.server('conversation:updated', { conversation: makeConv({ id: 'c1', tickets: [] }) }),
    );
    expect(list(qc)!.find((c) => c.id === 'c1')!.tickets).toEqual([]);
  });

  it('is a safe no-op when the list has not loaded yet', () => {
    const { qc } = mount(undefined);
    act(() =>
      h.socket.server('conversation:updated', { conversation: makeConv() }),
    );
    expect(list(qc)).toBeUndefined();
  });

  it("clears the viewer's own unread from the list badge on a read echo", () => {
    const { qc } = mount([
      makeConv({ id: 'c1', unreadDealerUserIds: ['u1'], unreadByDealer: true }),
    ]);
    act(() =>
      h.socket.server('read', { conversationId: 'c1', userId: 'u1', messageIds: ['m1'] }),
    );
    const c = list(qc)!.find((x) => x.id === 'c1')!;
    expect(c.unreadDealerUserIds).toEqual([]);
    expect(c.unreadByDealer).toBe(false);
  });

  it('keeps unread for the OTHER participants when only one of them reads', () => {
    const { qc } = mount([
      makeConv({ id: 'c1', unreadDealerUserIds: ['u1', 'u2'], unreadByDealer: true }),
    ]);
    // u1 (me) reads → only u1 is cleared; u2 (e.g. the manager) still unread.
    act(() =>
      h.socket.server('read', { conversationId: 'c1', userId: 'u1', messageIds: ['m1'] }),
    );
    const c = list(qc)!.find((x) => x.id === 'c1')!;
    expect(c.unreadDealerUserIds).toEqual(['u2']);
    expect(c.unreadByDealer).toBe(true);
  });

  it("ignores another participant's read (my badge stays)", () => {
    const { qc } = mount([
      makeConv({ id: 'c1', unreadDealerUserIds: ['u1', 'u2'], unreadByDealer: true }),
    ]);
    act(() =>
      h.socket.server('read', { conversationId: 'c1', userId: 'u2', messageIds: ['m1'] }),
    );
    expect(list(qc)!.find((x) => x.id === 'c1')!.unreadDealerUserIds).toEqual(['u1', 'u2']);
  });

  it('refetches the list on a socket reconnect', () => {
    const { qc } = mount([makeConv()]);
    const spy = vi.spyOn(qc, 'invalidateQueries');
    act(() => h.socket.server('connect')); // first connect on an already-connected socket → reconnect
    expect(spy).toHaveBeenCalledWith({ queryKey: myConversationsKey });
  });

  describe('the unread count in the green pill', () => {
    const incoming = (conversation: Conversation, over: Partial<Message> = {}) =>
      h.socket.server('message:new', {
        message: { id: 'm1', senderId: 'mdg', conversationId: conversation.id, ...over },
        conversation,
      });
    const count = (qc: ReturnType<typeof makeTestQueryClient>, id = 'c1') =>
      list(qc)!.find((c) => c.id === id)!.unreadCount;

    it("adds one for a message from someone else in a thread that is not open", () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 2 })]);
      act(() => incoming(makeConv({ id: 'c1', unreadByDealer: true, unreadDealerUserIds: ['u1'] })));
      expect(count(qc)).toBe(3);
    });

    it('does not count the dealer\'s own message echoing back', () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 0 })]);
      act(() => incoming(makeConv({ id: 'c1' }), { senderId: 'u1' }));
      expect(count(qc)).toBe(0);
    });

    it('does not count a message that lands in the thread on screen', () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 0 })], '/chat/c1');
      act(() => incoming(makeConv({ id: 'c1' })));
      expect(count(qc)).toBe(0);
    });

    it('still counts for the OTHER thread while one is open', () => {
      const { qc } = mount(
        [makeConv({ id: 'c1', unreadCount: 0 }), makeConv({ id: 'c2', unreadCount: 0 })],
        '/chat/c1',
      );
      act(() => incoming(makeConv({ id: 'c2' })));
      expect(count(qc, 'c2')).toBe(1);
    });

    it('counts media and info screens of a thread as not reading it', () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 0 })], '/chat/c1/info');
      act(() => incoming(makeConv({ id: 'c1' })));
      expect(count(qc)).toBe(1);
    });

    // The server sends a message to a member's conversation room and again to
    // their own room, so a phone in both receives it twice.
    it('counts a message once even when the server delivers it twice', () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 0 })]);
      act(() => {
        incoming(makeConv({ id: 'c1' }), { id: 'dup' });
        incoming(makeConv({ id: 'c1' }), { id: 'dup' });
      });
      expect(count(qc)).toBe(1);
      act(() => incoming(makeConv({ id: 'c1' }), { id: 'another' }));
      expect(count(qc)).toBe(2);
    });

    it('keeps the last number when a payload arrives without one', () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 4 })]);
      act(() =>
        h.socket.server('conversation:updated', {
          conversation: makeConv({ id: 'c1', lastMessagePreview: 'new' }),
        }),
      );
      expect(count(qc)).toBe(4);
      expect(list(qc)![0]!.lastMessagePreview).toBe('new');
    });

    it('goes back to zero when the dealer reads the thread', () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 7, unreadDealerUserIds: ['u1'] })]);
      act(() =>
        h.socket.server('read', { conversationId: 'c1', userId: 'u1', messageIds: ['m1'] }),
      );
      expect(count(qc)).toBe(0);
    });

    it("leaves the count alone when somebody ELSE reads", () => {
      const { qc } = mount([
        makeConv({ id: 'c1', unreadCount: 3, unreadDealerUserIds: ['u1', 'u2'] }),
      ]);
      act(() =>
        h.socket.server('read', { conversationId: 'c1', userId: 'u2', messageIds: ['m1'] }),
      );
      expect(count(qc)).toBe(3);
    });

    it('starts a brand-new thread at one', () => {
      const { qc } = mount([makeConv({ id: 'c1', unreadCount: 0 })]);
      act(() => incoming(makeConv({ id: 'c2', lastMessageAt: '2026-02-01T00:00:00.000Z' })));
      expect(count(qc, 'c2')).toBe(1);
    });

    // A server that predates the field. Inventing "1" would be wrong whenever
    // there was already something unread, so the list keeps its dot instead.
    it('does not invent a number for a thread whose count it was never told', () => {
      const { qc } = mount([makeConv({ id: 'c1' })]);
      act(() => incoming(makeConv({ id: 'c1', unreadByDealer: true })));
      expect(count(qc)).toBeUndefined();
    });
  });

  // The same paper can sit in two of the dealer's chats and on a second phone. The
  // "Received" reply reaches only the chat it was written into, so this event is
  // what lets every other copy of the request stop offering "Send photo".
  describe('a paper MDG asked for was asked, nudged or settled (document-ask:updated)', () => {
    const REF = 'doc:ask1';
    const row = { id: 'ask1' };

    it('asks again in EVERY thread, not only the open one', () => {
      const { qc } = mount([makeConv({ id: 'c1' }), makeConv({ id: 'c2', kind: 'manager' })], '/chat/c1');
      qc.setQueryData(chatAskStatesKey('c1', REF), [{ ref: REF, status: 'open' }]);
      qc.setQueryData(chatAskStatesKey('c2', REF), [{ ref: REF, status: 'open' }]);

      act(() => h.socket.server('document-ask:updated', { row }));

      expect(qc.getQueryState(chatAskStatesKey('c1', REF))?.isInvalidated).toBe(true);
      expect(qc.getQueryState(chatAskStatesKey('c2', REF))?.isInvalidated).toBe(true);
    });

    it('leaves every other kind of cached answer alone', () => {
      const { qc } = mount([makeConv({ id: 'c1' })]);
      qc.setQueryData(['conversation', 'c1', 'media'], []);
      act(() => h.socket.server('document-ask:updated', { row }));
      expect(qc.getQueryState(['conversation', 'c1', 'media'])?.isInvalidated).toBe(false);
      expect(qc.getQueryState(myConversationsKey)?.isInvalidated ?? false).toBe(false);
    });

    it('stops listening when the app shell goes', () => {
      const { unmount } = mount([makeConv({ id: 'c1' })]);
      expect(h.socket.handlerCount('document-ask:updated')).toBe(1);
      unmount();
      expect(h.socket.handlerCount('document-ask:updated')).toBe(0);
    });
  });
});
