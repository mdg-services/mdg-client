import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import {
  makeTestQueryClient,
  renderHookWithProviders,
  resetStores,
  signIn,
} from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

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

function mount(seed?: Conversation[]) {
  h.socket = makeFakeSocket(true);
  signIn({ id: 'u1' });
  const qc = makeTestQueryClient();
  if (seed) qc.setQueryData(myConversationsKey, seed);
  const view = renderHookWithProviders(() => useConversationsListSocket(), {
    queryClient: qc,
    withRouter: false,
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
});
