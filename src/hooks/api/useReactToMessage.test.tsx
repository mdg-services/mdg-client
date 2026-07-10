import { type InfiniteData } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  makeMessage,
  makeTestQueryClient,
  renderHookWithProviders,
  resetStores,
  signIn,
} from '@/test/utils';
import type { Message } from '@dk/shared/types';

import { messagesQueryKey } from './useMessages';
import { useReactToMessage, type ReactVars } from './useReactToMessage';

const api = vi.hoisted(() => ({
  post: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api }));

const KEY = messagesQueryKey('c1');
type Pages = InfiniteData<Message[]>;

function mount(seed: Message[]) {
  const qc = makeTestQueryClient();
  qc.setQueryData<Pages>(KEY, { pages: [seed], pageParams: [undefined] });
  const view = renderHookWithProviders(() => useReactToMessage(), {
    queryClient: qc,
    withRouter: false,
  });
  return { qc, ...view };
}
const reactionsOf = (qc: ReturnType<typeof makeTestQueryClient>, id: string) =>
  qc
    .getQueryData<Pages>(KEY)
    ?.pages.flat()
    .find((m) => m.id === id)?.reactions ?? [];

describe('useReactToMessage', () => {
  afterEach(() => resetStores());

  it('optimistically adds my reaction (replacing any previous one) and POSTs', async () => {
    signIn({ id: 'me', name: 'Ramesh' });
    const msg = makeMessage({
      id: 'm1',
      reactions: [
        { userId: 'me', emoji: '😂', createdAt: new Date().toISOString() },
        { userId: 'u2', emoji: '👍', createdAt: new Date().toISOString() },
      ],
    });
    const { qc, result } = mount([msg]);
    // Server echoes the updated message.
    api.post.mockResolvedValue({
      ...msg,
      reactions: [
        { userId: 'u2', emoji: '👍', createdAt: msg.createdAt },
        { userId: 'me', userName: 'Ramesh', emoji: '❤️', createdAt: msg.createdAt },
      ],
    });

    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        messageId: 'm1',
        emoji: '❤️',
        op: 'add',
      });
    });

    // Optimistic: my 😂 replaced by ❤️ immediately, u2 untouched.
    await waitFor(() => {
      const mine = reactionsOf(qc, 'm1').filter((r) => r.userId === 'me');
      expect(mine).toHaveLength(1);
      expect(mine[0]!.emoji).toBe('❤️');
    });
    expect(reactionsOf(qc, 'm1').some((r) => r.userId === 'u2')).toBe(true);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/v1/conversations/c1/messages/m1/reactions',
        { emoji: '❤️' },
      ),
    );
  });

  it('optimistically removes my reaction via DELETE', async () => {
    signIn({ id: 'me', name: 'Ramesh' });
    const msg = makeMessage({
      id: 'm1',
      reactions: [{ userId: 'me', emoji: '👍', createdAt: new Date().toISOString() }],
    });
    const { qc, result } = mount([msg]);
    api.del.mockResolvedValue({ ...msg, reactions: [] });

    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        messageId: 'm1',
        emoji: '👍',
        op: 'remove',
      });
    });

    await waitFor(() => expect(reactionsOf(qc, 'm1')).toHaveLength(0));
    expect(api.del).toHaveBeenCalledWith(
      '/v1/conversations/c1/messages/m1/reactions',
    );
  });

  it('rolls the cache back when the request fails', async () => {
    signIn({ id: 'me', name: 'Ramesh' });
    const original = [
      { userId: 'u2', emoji: '👍', createdAt: new Date().toISOString() },
    ];
    const msg = makeMessage({ id: 'm1', reactions: original });
    const { qc, result } = mount([msg]);
    api.post.mockRejectedValue(new Error('network'));

    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        messageId: 'm1',
        emoji: '❤️',
        op: 'add',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(reactionsOf(qc, 'm1')).toEqual(original);
  });

  it('a message that arrives mid-mutation SURVIVES a failed toggle rollback', async () => {
    signIn({ id: 'me', name: 'Ramesh' });
    const original = [
      { userId: 'u2', emoji: '👍', createdAt: new Date().toISOString() },
    ];
    const msg = makeMessage({ id: 'm1', reactions: original });
    const { qc, result } = mount([msg]);
    let reject: ((e: Error) => void) | undefined;
    api.post.mockImplementation(
      () => new Promise((_res, rej) => { reject = rej; }),
    );

    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        messageId: 'm1',
        emoji: '❤️',
        op: 'add',
      });
    });
    await waitFor(() =>
      expect(reactionsOf(qc, 'm1').some((r) => r.emoji === '❤️')).toBe(true),
    );

    // While the POST hangs, a new message lands over the socket (the same
    // cache write useConversationSocket's message:new performs).
    const incoming = makeMessage({ id: 'm-new', senderId: 'u2' });
    act(() => {
      qc.setQueryData<Pages>(KEY, (old) =>
        old
          ? { ...old, pages: [[incoming, ...old.pages[0]!], ...old.pages.slice(1)] }
          : old,
      );
    });

    act(() => reject!(new Error('network')));
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Rollback restored ONLY the target message's reactions — the message
    // that arrived mid-flight must not be erased.
    expect(reactionsOf(qc, 'm1')).toEqual(original);
    const ids = qc.getQueryData<Pages>(KEY)!.pages.flat().map((m) => m.id);
    expect(ids).toContain('m-new');
  });

  it('an older toggle completing does not clobber a newer in-flight toggle', async () => {
    signIn({ id: 'me', name: 'Ramesh' });
    const msg = makeMessage({ id: 'm1', reactions: [] });
    const { qc, result } = mount([msg]);
    let resolveAdd: ((m: Message) => void) | undefined;
    api.post.mockImplementation(() => new Promise((res) => { resolveAdd = res; }));
    let resolveDel: ((m: Message) => void) | undefined;
    api.del.mockImplementation(() => new Promise((res) => { resolveDel = res; }));

    // Tap 👍 (POST in flight) … then immediately remove it (DELETE in flight).
    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        messageId: 'm1',
        emoji: '👍',
        op: 'add',
      });
    });
    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        messageId: 'm1',
        emoji: '👍',
        op: 'remove',
      });
    });
    await waitFor(() => expect(reactionsOf(qc, 'm1')).toHaveLength(0));

    // The POST's response lands FIRST — it must NOT resurrect the removed chip.
    act(() =>
      resolveAdd!({
        ...msg,
        reactions: [
          { userId: 'me', userName: 'Ramesh', emoji: '👍', createdAt: msg.createdAt },
        ],
      }),
    );
    const addMutation = () =>
      qc
        .getMutationCache()
        .getAll()
        .find((m) => (m.state.variables as ReactVars | undefined)?.op === 'add');
    await waitFor(() => expect(addMutation()?.state.status).toBe('success'));
    expect(reactionsOf(qc, 'm1')).toHaveLength(0);

    // The LAST toggle's response is adopted as server truth.
    const serverAfterRemove = [
      { userId: 'u9', userName: 'Late', emoji: '😮', createdAt: msg.createdAt },
    ];
    act(() => resolveDel!({ ...msg, reactions: serverAfterRemove }));
    await waitFor(() => expect(reactionsOf(qc, 'm1')).toEqual(serverAfterRemove));
  });

  it('reconciles to the server response on success', async () => {
    signIn({ id: 'me', name: 'Ramesh' });
    const msg = makeMessage({ id: 'm1', reactions: [] });
    const { qc, result } = mount([msg]);
    const serverReactions = [
      { userId: 'me', userName: 'Ramesh', emoji: '🙏', createdAt: msg.createdAt },
      { userId: 'u9', userName: 'Late', emoji: '😮', createdAt: msg.createdAt },
    ];
    api.post.mockResolvedValue({ ...msg, reactions: serverReactions });

    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        messageId: 'm1',
        emoji: '🙏',
        op: 'add',
      });
    });

    await waitFor(() => expect(reactionsOf(qc, 'm1')).toEqual(serverReactions));
  });
});
