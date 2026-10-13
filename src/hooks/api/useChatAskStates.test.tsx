import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMessage, makeTestQueryClient, renderHookWithProviders, resetStores, signIn } from '@/test/utils';
import type { ChatAskState, Message, MessageAsk } from '@dk/shared/types';

import {
  MAX_ASK_REFS,
  chatAskStatesKey,
  chatAskStatesPrefix,
  collectAskRefs,
  invalidateChatAskStates,
  markAskSent,
  useChatAskStates,
} from './useChatAskStates';

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get: h.get } }));

const ask = (ref: string, over: Partial<MessageAsk> = {}): MessageAsk => ({
  ref,
  kind: 'document',
  title: ref,
  ...over,
});

let t = 0;
/** A request MDG posted, `minutes` after the thread began. */
function post(ref: string, minutes: number, over: Partial<Message> = {}): Message {
  t += 1;
  return makeMessage({
    id: `m-${ref}-${minutes}-${t}`,
    conversationId: 'c1',
    senderId: 'system-user',
    senderRole: 'admin',
    createdAt: new Date(Date.UTC(2026, 9, 12, 9, minutes)).toISOString(),
    ask: ask(ref),
    ...over,
  });
}

describe('collectAskRefs', () => {
  it('lists each request once, newest first', () => {
    const { refs } = collectAskRefs([
      post('doc:a', 1),
      post('reg:2026-10-11', 5),
      post('doc:a', 3),
      makeMessage({ body: 'plain' }),
    ]);
    // doc:a was last posted at minute 3, the register page at minute 5.
    expect(refs).toEqual(['reg:2026-10-11', 'doc:a']);
  });

  it('remembers which message is the newest post of each request', () => {
    const older = post('doc:a', 1);
    const newer = post('doc:a', 9);
    const { latestIdByRef } = collectAskRefs([newer, older]);
    expect(latestIdByRef.get('doc:a')).toBe(newer.id);
  });

  it('ignores a message still on its way out — it is the dealer\'s own', () => {
    const { refs } = collectAskRefs([post('doc:a', 1, { id: 'temp-1' })]);
    expect(refs).toEqual([]);
  });

  it('asks about the newest fifty and no more — the server\'s cap', () => {
    const many = Array.from({ length: MAX_ASK_REFS + 7 }, (_, i) => post(`doc:r${i}`, i));
    const { refs } = collectAskRefs(many);
    expect(refs).toHaveLength(MAX_ASK_REFS);
    expect(refs[0]).toBe(`doc:r${MAX_ASK_REFS + 6}`);
    expect(refs).not.toContain('doc:r0');
  });

  it('is empty for a thread with no requests', () => {
    expect(collectAskRefs([makeMessage({ body: 'hi' })])).toEqual({
      refs: [],
      latestIdByRef: new Map(),
    });
  });
});

describe('useChatAskStates', () => {
  beforeEach(() => {
    h.get.mockReset();
    signIn();
  });
  // Unmount first: the shared teardown resets the auth store, which would
  // re-render a hook that is still mounted, outside `act`.
  afterEach(() => {
    cleanup();
    resetStores();
  });

  const open = (ref: string): ChatAskState => ({ ref, status: 'open' });

  it('makes ONE batched call for every request in the thread', async () => {
    h.get.mockResolvedValue([open('doc:a'), open('kv:k1')]);
    const messages = [post('doc:a', 1), post('kv:k1', 2), post('doc:a', 3)];
    const { result } = renderHookWithProviders(() => useChatAskStates('c1', messages), {
      withRouter: false,
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(h.get).toHaveBeenCalledTimes(1);
    const [path, query] = h.get.mock.calls[0]!;
    expect(path).toBe('/v1/asks/me/states');
    expect(String((query as { refs: string }).refs).split(',').sort()).toEqual(['doc:a', 'kv:k1']);
    expect(result.current.byRef.get('doc:a')).toEqual(open('doc:a'));
  });

  it('asks nothing when the thread holds no request', async () => {
    const { result } = renderHookWithProviders(
      () => useChatAskStates('c1', [makeMessage({ body: 'hi' })]),
      { withRouter: false },
    );
    await act(async () => undefined);
    expect(h.get).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');
    expect(result.current.byRef.size).toBe(0);
  });

  it('asks nothing signed out', async () => {
    resetStores();
    renderHookWithProviders(() => useChatAskStates('c1', [post('doc:a', 1)]), { withRouter: false });
    await act(async () => undefined);
    expect(h.get).not.toHaveBeenCalled();
  });

  it('a failed request is "failed" — not an empty answer — and can be retried', async () => {
    h.get.mockRejectedValueOnce(new Error('boom'));
    const messages = [post('doc:a', 1)];
    const { result } = renderHookWithProviders(() => useChatAskStates('c1', messages), {
      withRouter: false,
    });
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.byRef.size).toBe(0);

    h.get.mockResolvedValueOnce([open('doc:a')]);
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.byRef.get('doc:a')?.status).toBe('open');
  });

  it('keeps the answer on screen when a refetch in the background fails', async () => {
    h.get.mockResolvedValueOnce([open('doc:a')]);
    const messages = [post('doc:a', 1)];
    const { result, queryClient } = renderHookWithProviders(
      () => useChatAskStates('c1', messages),
      { withRouter: false },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    h.get.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      invalidateChatAskStates(queryClient, 'c1');
    });
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('ready');
    expect(result.current.byRef.get('doc:a')?.status).toBe('open');
  });

  it('asks again when a request arrives, and keeps the old answers up meanwhile', async () => {
    h.get.mockResolvedValueOnce([open('doc:a')]);
    let messages = [post('doc:a', 1)];
    const { result, rerender } = renderHookWithProviders(() => useChatAskStates('c1', messages), {
      withRouter: false,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let release!: (v: ChatAskState[]) => void;
    h.get.mockReturnValueOnce(new Promise<ChatAskState[]>((r) => (release = r)));
    messages = [...messages, post('reg:2026-10-12', 4)];
    rerender();
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    // The first answer is still drawn while the second is on its way.
    expect(result.current.byRef.get('doc:a')?.status).toBe('open');

    await act(async () => release([open('doc:a'), open('reg:2026-10-12')]));
    await waitFor(() => expect(result.current.byRef.has('reg:2026-10-12')).toBe(true));
  });

  it('is one cache entry per thread and set of requests, whatever order they are listed in', () => {
    expect(chatAskStatesKey('c1', 'a,b')).toEqual([...chatAskStatesPrefix('c1'), 'a,b']);
    expect(chatAskStatesPrefix('c1')).toEqual(['conversation', 'c1', 'ask-states']);
  });
});

describe('markAskSent', () => {
  const key = (refs: string) => chatAskStatesKey('c1', refs);

  it('shows an open request as sent, in every cached answer of the thread', () => {
    const qc = makeTestQueryClient();
    qc.setQueryData(key('doc:a'), [{ ref: 'doc:a', status: 'open', rejectReason: 'blurred' }]);
    qc.setQueryData(key('doc:a,reg:x'), [
      { ref: 'doc:a', status: 'open' },
      { ref: 'reg:x', status: 'open' },
    ]);

    markAskSent(qc, 'c1', 'doc:a');

    expect(qc.getQueryData(key('doc:a'))).toEqual([{ ref: 'doc:a', status: 'sent' }]);
    expect(qc.getQueryData(key('doc:a,reg:x'))).toEqual([
      { ref: 'doc:a', status: 'sent' },
      { ref: 'reg:x', status: 'open' },
    ]);
  });

  it('never takes a request back from received or closed', () => {
    const qc = makeTestQueryClient();
    qc.setQueryData(key('doc:a'), [{ ref: 'doc:a', status: 'received' }]);
    qc.setQueryData(key('doc:b'), [{ ref: 'doc:b', status: 'closed' }]);
    markAskSent(qc, 'c1', 'doc:a');
    markAskSent(qc, 'c1', 'doc:b');
    expect(qc.getQueryData(key('doc:a'))).toEqual([{ ref: 'doc:a', status: 'received' }]);
    expect(qc.getQueryData(key('doc:b'))).toEqual([{ ref: 'doc:b', status: 'closed' }]);
  });

  it('leaves another thread alone, and is fine with nothing cached', () => {
    const qc = makeTestQueryClient();
    qc.setQueryData(chatAskStatesKey('c2', 'doc:a'), [{ ref: 'doc:a', status: 'open' }]);
    expect(() => markAskSent(qc, 'c1', 'doc:a')).not.toThrow();
    expect(qc.getQueryData(chatAskStatesKey('c2', 'doc:a'))).toEqual([
      { ref: 'doc:a', status: 'open' },
    ]);
  });
});
