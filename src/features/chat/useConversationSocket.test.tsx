import { type InfiniteData } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { messagesQueryKey } from '@/hooks/api/useMessages';
import { type ReactVars } from '@/hooks/api/useReactToMessage';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import {
  makeMessage,
  makeTestQueryClient,
  renderHookWithProviders,
  resetStores,
} from '@/test/utils';
import type { Message } from '@dk/shared/types';

import { useConversationSocket } from './useConversationSocket';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

const KEY = messagesQueryKey('c1');
type Pages = InfiniteData<Message[]>;
const ME = 'u1';
const OTHER = 'u2';

function mount(seedMsgs: Message[] = [], connected = true) {
  h.socket = makeFakeSocket(connected);
  const qc = makeTestQueryClient();
  if (seedMsgs.length) {
    qc.setQueryData<Pages>(KEY, { pages: [seedMsgs], pageParams: [undefined] });
  }
  const view = renderHookWithProviders(() => useConversationSocket('c1', ME), {
    queryClient: qc,
    withRouter: false,
  });
  return { qc, ...view };
}
const msgs = (qc: ReturnType<typeof makeTestQueryClient>) =>
  qc.getQueryData<Pages>(KEY)?.pages.flat() ?? [];

describe('useConversationSocket', () => {
  afterEach(() => resetStores());

  it('joins the room on connect', () => {
    mount([], true);
    // effect ran with connected socket → immediate join emit
    expect(h.socket.emit).toHaveBeenCalledWith('conversation:join', 'c1');
  });

  it('does NOT invalidate on the first connect, but backfills on a reconnect', () => {
    const { qc } = mount([], false);
    const spy = vi.spyOn(qc, 'invalidateQueries');

    h.socket.server('connect'); // initial connection
    expect(spy).not.toHaveBeenCalled();

    h.socket.server('connect'); // reconnect
    expect(spy).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it('message:new from the other party prepends, and emits a read receipt', () => {
    const { qc } = mount([]);
    const incoming = makeMessage({ id: 'x1', senderId: OTHER });
    act(() => {
      h.socket.server('message:new', { message: incoming, conversation: {} });
    });
    expect(msgs(qc).map((m) => m.id)).toContain('x1');
    expect(h.socket.emit).toHaveBeenCalledWith('read', {
      conversationId: 'c1',
      messageIds: ['x1'],
    });
  });

  it('message:new dedupes by id across pages', () => {
    const existing = makeMessage({ id: 'dup', senderId: OTHER });
    const { qc } = mount([existing]);
    act(() => {
      h.socket.server('message:new', { message: existing, conversation: {} });
    });
    expect(msgs(qc).filter((m) => m.id === 'dup')).toHaveLength(1);
  });

  it('message:new own echo strips the optimistic temp-* placeholder', () => {
    const temp = makeMessage({ id: 'temp-1', senderId: ME });
    const { qc } = mount([temp]);
    const echo = makeMessage({ id: 'real-1', senderId: ME });
    act(() => {
      h.socket.server('message:new', { message: echo, conversation: {} });
    });
    const ids = msgs(qc).map((m) => m.id);
    expect(ids).toContain('real-1');
    expect(ids).not.toContain('temp-1');
    // Own echo must NOT emit a read receipt for itself.
    expect(h.socket.emit).not.toHaveBeenCalledWith(
      'read',
      expect.objectContaining({ messageIds: ['real-1'] }),
    );
  });

  it('ignores message:new for a different conversation', () => {
    const { qc } = mount([]);
    act(() => {
      h.socket.server('message:new', {
        message: makeMessage({ id: 'other', conversationId: 'c2' }),
        conversation: {},
      });
    });
    expect(msgs(qc)).toHaveLength(0);
  });

  it('delivered receipt merges deliveredTo for matching ids only', () => {
    const { qc } = mount([
      makeMessage({ id: 'm1', senderId: ME }),
      makeMessage({ id: 'm2', senderId: ME }),
    ]);
    act(() => {
      h.socket.server('delivered', {
        conversationId: 'c1',
        userId: OTHER,
        messageIds: ['m1'],
      });
    });
    const byId = Object.fromEntries(msgs(qc).map((m) => [m.id, m]));
    expect(byId.m1.deliveredTo).toContain(OTHER);
    expect(byId.m2.deliveredTo).not.toContain(OTHER);
  });

  it('read receipt advances BOTH deliveredTo and readBy', () => {
    const { qc } = mount([makeMessage({ id: 'm1', senderId: ME })]);
    act(() => {
      h.socket.server('read', {
        conversationId: 'c1',
        userId: OTHER,
        messageIds: ['m1'],
      });
    });
    const m1 = msgs(qc).find((m) => m.id === 'm1')!;
    expect(m1.deliveredTo).toContain(OTHER);
    expect(m1.readBy).toContain(OTHER);
  });

  it('typing shows the indicator then auto-clears after 3s, resetting on new events', () => {
    vi.useFakeTimers();
    try {
      const { result } = mount([]);
      act(() => {
        h.socket.server('typing', {
          conversationId: 'c1',
          userId: OTHER,
          userName: 'Support',
        });
      });
      expect(result.current.typing.active).toBe(true);

      act(() => vi.advanceTimersByTime(2000));
      // another event resets the 3s window
      act(() => {
        h.socket.server('typing', {
          conversationId: 'c1',
          userId: OTHER,
          userName: 'Support',
        });
      });
      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.typing.active).toBe(true); // still typing (reset)

      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.typing.active).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores my own typing events', () => {
    const { result } = mount([]);
    act(() => {
      h.socket.server('typing', {
        conversationId: 'c1',
        userId: ME,
        userName: 'Me',
      });
    });
    expect(result.current.typing.active).toBe(false);
  });

  it('message:reaction replaces that message’s reactions wholesale (idempotent)', () => {
    const seeded = makeMessage({
      id: 'm1',
      senderId: OTHER,
      reactions: [
        { userId: 'stale', emoji: '😂', createdAt: new Date().toISOString() },
      ],
    });
    const { qc } = mount([seeded, makeMessage({ id: 'm2', senderId: OTHER })]);
    const payload = {
      conversationId: 'c1',
      messageId: 'm1',
      reactions: [
        { userId: OTHER, userName: 'Priya', emoji: '👍', createdAt: new Date().toISOString() },
      ],
    };
    act(() => h.socket.server('message:reaction', payload));
    // Duplicate delivery must be a no-op (same authoritative array).
    act(() => h.socket.server('message:reaction', payload));
    const byId = Object.fromEntries(msgs(qc).map((m) => [m.id, m]));
    expect(byId.m1.reactions).toEqual(payload.reactions);
    expect(byId.m2.reactions ?? []).toHaveLength(0);
  });

  it('skips the reaction echo while MY toggle for that message is in flight', () => {
    const seeded = makeMessage({ id: 'm1', senderId: OTHER, reactions: [] });
    const other = makeMessage({ id: 'm2', senderId: OTHER, reactions: [] });
    const { qc } = mount([seeded, other]);
    // A reaction toggle for m1 is mid-flight (same mutationKey + variables
    // shape as useReactToMessage; the request never settles).
    const mutation = qc.getMutationCache().build(qc, {
      mutationKey: ['react'],
      mutationFn: (_vars: ReactVars) => new Promise<never>(() => {}),
    });
    void mutation.execute({
      conversationId: 'c1',
      messageId: 'm1',
      emoji: '👍',
      op: 'add',
    });

    const reactions = [
      { userId: OTHER, emoji: '❤️', createdAt: new Date().toISOString() },
    ];
    // m1's echo may be the OLDER request's snapshot — must be skipped; the
    // final mutation's onSuccess reconciles to server truth instead.
    act(() =>
      h.socket.server('message:reaction', {
        conversationId: 'c1',
        messageId: 'm1',
        reactions,
      }),
    );
    // m2 has no toggle in flight — its echo still applies wholesale.
    act(() =>
      h.socket.server('message:reaction', {
        conversationId: 'c1',
        messageId: 'm2',
        reactions,
      }),
    );
    const byId = Object.fromEntries(msgs(qc).map((m) => [m.id, m]));
    expect(byId.m1.reactions ?? []).toHaveLength(0);
    expect(byId.m2.reactions).toEqual(reactions);
  });

  it('ignores message:reaction for a different conversation', () => {
    const seeded = makeMessage({ id: 'm1', senderId: OTHER });
    const { qc } = mount([seeded]);
    act(() =>
      h.socket.server('message:reaction', {
        conversationId: 'c2',
        messageId: 'm1',
        reactions: [
          { userId: OTHER, emoji: '👍', createdAt: new Date().toISOString() },
        ],
      }),
    );
    expect(msgs(qc)[0]!.reactions ?? []).toHaveLength(0);
  });

  it('cleanup leaves the room and removes all handlers', () => {
    const { unmount } = mount([]);
    expect(h.socket.handlerCount('message:new')).toBe(1);
    unmount();
    expect(h.socket.emit).toHaveBeenCalledWith('conversation:leave', 'c1');
    expect(h.socket.handlerCount('message:new')).toBe(0);
    expect(h.socket.handlerCount('connect')).toBe(0);
    expect(h.socket.handlerCount('read')).toBe(0);
    expect(h.socket.handlerCount('message:reaction')).toBe(0);
  });

  it('no-ops when conversationId is undefined', () => {
    h.socket = makeFakeSocket(true);
    renderHookWithProviders(() => useConversationSocket(undefined, ME), {
      withRouter: false,
    });
    expect(h.socket.handlerCount('message:new')).toBe(0);
  });
});
