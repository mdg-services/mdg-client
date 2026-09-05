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

function mount(
  seedMsgs: Message[] = [],
  connected = true,
  kind?: 'support' | 'manager',
) {
  h.socket = makeFakeSocket(connected);
  const qc = makeTestQueryClient();
  if (seedMsgs.length) {
    qc.setQueryData<Pages>(KEY, { pages: [seedMsgs], pageParams: [undefined] });
  }
  const view = renderHookWithProviders(
    () => useConversationSocket('c1', ME, kind),
    { queryClient: qc, withRouter: false },
  );
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

  /** One `typing` event from the other side of the thread. */
  function serverTyping() {
    act(() => {
      h.socket.server('typing', {
        conversationId: 'c1',
        userId: OTHER,
        userName: 'Support',
      });
    });
  }

  it('holds a person’s typing dots for 3s, resetting on every keystroke', () => {
    vi.useFakeTimers();
    try {
      // A manager's GROUP thread: the AI first line stands down there, so the
      // only thing that can be typing is another person at the pump, and a
      // person emits on every keystroke.
      const { result } = mount([], true, 'manager');
      serverTyping();
      expect(result.current.typing.active).toBe(true);

      act(() => vi.advanceTimersByTime(2000));
      serverTyping(); // another keystroke resets the window
      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.typing.active).toBe(true);

      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.typing.active).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the machine’s dots past 3s — its turn is two model calls', () => {
    // THE REGRESSION THIS GUARDS. The server emits `typing` ONCE, at the top of
    // the turn, and then thinks: a router call and then a writer call, under a
    // nine-second wall clock. A three-second window dropped the dots while MDG
    // was still composing, and the answer then landed into a thread that had
    // been silent — which is the exact "reads as a machine" failure the emit
    // exists to prevent.
    vi.useFakeTimers();
    try {
      const { result } = mount([]); // no kind: a support thread
      serverTyping();

      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.typing.active).toBe(true);

      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.typing.active).toBe(false); // the backstop still fires
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the dots the moment the answer lands', () => {
    // A message is proof they stopped writing. Without this the dots would sit
    // under the answer they announced for the rest of the ten-second hold.
    vi.useFakeTimers();
    try {
      const { result } = mount([]);
      serverTyping();
      expect(result.current.typing.active).toBe(true);

      act(() => {
        h.socket.server('message:new', {
          message: makeMessage({ id: 'a1', senderId: OTHER }),
          conversation: {},
        });
      });
      expect(result.current.typing.active).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes the dots down with the room when the thread changes', () => {
    // The leak: switching threads used to clear the TIMER and leave the STATE,
    // so dots raised on the thread you left were still drawn on the thread you
    // opened — with nothing left running to ever take them away. The hook stays
    // MOUNTED across that switch (same route component, new :id), which is why
    // this rerenders rather than unmounting.
    vi.useFakeTimers();
    try {
      h.socket = makeFakeSocket(true);
      const { result, rerender } = renderHookWithProviders(
        ({ id }: { id: string }) => useConversationSocket(id, ME),
        { withRouter: false, initialProps: { id: 'c1' } },
      );
      serverTyping();
      expect(result.current.typing.active).toBe(true);

      act(() => rerender({ id: 'c2' }));
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

  it('sends at most one typing frame per 1.5s, starting on the first keystroke', () => {
    // The Composer calls this from the textarea's onChange, so a 60-character
    // message used to be 60 frames up a 2G link and 60 `exists()` queries on the
    // server. The receiver holds the dots for 3s after the last event, so the
    // other 59 said nothing it did not already know.
    vi.useFakeTimers();
    try {
      const { result } = mount([]);
      const typingEmits = () =>
        h.socket.emit.mock.calls.filter(([event]) => event === 'typing').length;

      for (let i = 0; i < 10; i += 1) result.current.emitTyping();
      // Leading edge: the first keystroke goes out at once, the rest are dropped.
      expect(typingEmits()).toBe(1);

      act(() => vi.advanceTimersByTime(1600));
      result.current.emitTyping();
      expect(typingEmits()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not swallow the first keystroke in a freshly opened thread', () => {
    // The window is keyed on the conversation too: leaving c1 mid-window and
    // typing into c2 straight away must still raise the dots there.
    vi.useFakeTimers();
    try {
      h.socket = makeFakeSocket(true);
      const { result, rerender } = renderHookWithProviders(
        ({ id }: { id: string }) => useConversationSocket(id, ME),
        { withRouter: false, initialProps: { id: 'c1' } },
      );
      result.current.emitTyping();
      act(() => rerender({ id: 'c2' }));
      result.current.emitTyping();

      const targets = h.socket.emit.mock.calls
        .filter(([event]) => event === 'typing')
        .map(([, id]) => id);
      expect(targets).toEqual(['c1', 'c2']);
    } finally {
      vi.useRealTimers();
    }
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
