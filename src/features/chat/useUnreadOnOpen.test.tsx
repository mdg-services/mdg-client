import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeMessage } from '@/test/utils';
import type { Message } from '@dk/shared/types';

import { useUnreadOnOpen } from './useUnreadOnOpen';

const waiting = (id: string, minute: number, readBy: string[] = ['x']): Message =>
  makeMessage({
    id,
    senderId: 'x',
    readBy,
    createdAt: new Date(2026, 0, 1, 12, minute).toISOString(),
  });

type Props = {
  cid?: string;
  messages: Message[];
  fresh: boolean;
};

function mount(initial: Props) {
  return renderHook(
    (p: Props) => useUnreadOnOpen(p.cid ?? 'c1', 'me', p.messages, p.fresh),
    { initialProps: initial },
  );
}

describe('useUnreadOnOpen', () => {
  it('is "not known yet" until the answer to the opening request is in', () => {
    const { result, rerender } = mount({ messages: [waiting('a', 1)], fresh: false });
    expect(result.current).toBeNull();
    rerender({ messages: [waiting('a', 1)], fresh: true });
    expect(result.current).toEqual({ firstId: 'a', count: 1 });
  });

  it('captures the unread set once, and holds it when the server confirms the messages read', () => {
    const unread = [waiting('a', 1), waiting('b', 2)];
    const { result, rerender } = mount({ messages: unread, fresh: true });
    expect(result.current).toEqual({ firstId: 'a', count: 2 });

    // The screen has told the server; the cache now says everything is read.
    rerender({
      messages: [waiting('a', 1, ['x', 'me']), waiting('b', 2, ['x', 'me'])],
      fresh: true,
    });
    expect(result.current).toEqual({ firstId: 'a', count: 2 });
  });

  it('is not moved by a message that arrives afterwards', () => {
    const { result, rerender } = mount({ messages: [waiting('a', 1)], fresh: true });
    rerender({ messages: [waiting('a', 1), waiting('live', 9)], fresh: true });
    expect(result.current).toEqual({ firstId: 'a', count: 1 });
  });

  it('holds "nothing was waiting" too — it does not look again later', () => {
    const { result, rerender } = mount({
      messages: [waiting('a', 1, ['x', 'me'])],
      fresh: true,
    });
    expect(result.current).toEqual({ firstId: null, count: 0 });
    rerender({ messages: [waiting('a', 1, ['x', 'me']), waiting('b', 2)], fresh: true });
    expect(result.current).toEqual({ firstId: null, count: 0 });
  });

  it('starts over for another conversation', () => {
    const { result, rerender } = mount({ cid: 'c1', messages: [waiting('a', 1)], fresh: true });
    expect(result.current).toEqual({ firstId: 'a', count: 1 });
    rerender({ cid: 'c2', messages: [waiting('z', 1, ['x', 'me'])], fresh: false });
    expect(result.current).toBeNull();
    rerender({ cid: 'c2', messages: [waiting('z', 1, ['x', 'me'])], fresh: true });
    expect(result.current).toEqual({ firstId: null, count: 0 });
  });

  it('knows nothing without a signed-in member', () => {
    const { result } = renderHook(() => useUnreadOnOpen('c1', undefined, [waiting('a', 1)], true));
    expect(result.current).toBeNull();
  });
});
