import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeTestQueryClient, renderHookWithProviders, resetStores, signIn } from '@/test/utils';
import type { TodayFeed, TodayTask } from '@dk/shared/types';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof ApiModule>();
  return { ...real, api: { ...real.api, get: apiGet, post: apiPost } };
});
const copyText = vi.hoisted(() => vi.fn());
vi.mock('@/lib/clipboard', () => ({ copyText }));

const { useReportActionContext } = await import('./reportActions');
const { todayFeedKey } = await import('@/hooks/api/useTodayFeed');
const { messagesQueryKey } = await import('@/hooks/api/useMessages');

const task = (over: Partial<TodayTask>): TodayTask => ({
  id: 't',
  kind: 'ask',
  title: 'x',
  since: '2026-11-24T05:00:00.000Z',
  conversationId: 'c-box',
  messageId: 'm-box',
  ...over,
});
const feed = (tasks: TodayTask[]): TodayFeed => ({ day: '2026-11-24', role: 'owner', tasks, reports: [], done: [] });

function setup(client = makeTestQueryClient()) {
  const onOpenChat = vi.fn();
  const onNavigate = vi.fn();
  const out = renderHookWithProviders(
    () => useReportActionContext({ conversationId: 'c-rep', messageId: 'm-rep', onOpenChat, onNavigate }),
    { queryClient: client, withRouter: false },
  );
  return { ...out, onOpenChat, onNavigate, client };
}

beforeEach(() => {
  signIn({ role: 'dealer-owner' });
  useLangStore.setState({ lang: 'hl', explicit: true });
  apiGet.mockReset();
  apiPost.mockReset();
});
afterEach(() => {
  cleanup();
  resetStores();
});

describe('what a report\'s buttons can do', () => {
  it('knows the reader\'s language and whether the reader is the owner', () => {
    const a = setup();
    expect(a.result.current.lang).toBe('hl');
    expect(a.result.current.isOwner).toBe(true);
    a.unmount();
    signIn({ role: 'dealer-staff' });
    expect(setup().result.current.isOwner).toBe(false);
  });

  it('opens the chat at a message of this report\'s own chat, and goes to an address', () => {
    const { result, onOpenChat, onNavigate } = setup();
    result.current.openChatAt('m-5');
    expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-rep', messageId: 'm-5' });
    result.current.navigate('/settings');
    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });

  it('opens the chat at the exact ask box found in the Today feed, in the chat the box lives in', () => {
    const client = makeTestQueryClient();
    client.setQueryData(todayFeedKey, feed([task({ id: 'ask:kv:9', conversationId: 'c-box', messageId: 'm-box', action: { type: 'photo', askRef: 'kv:9', acceptsFile: false } })]));
    const { result, onOpenChat } = setup(client);
    result.current.openChatAtAsk('kv:9');
    expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-box', messageId: 'm-box' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('finds the ask in the thread\'s loaded messages when the feed has no such task', () => {
    const client = makeTestQueryClient();
    client.setQueryData(todayFeedKey, feed([]));
    client.setQueryData(messagesQueryKey('c-rep'), {
      pages: [[{ id: 'm-ask', createdAt: '2026-11-24T05:00:00.000Z', ask: { ref: 'kv:9', kind: 'photo', title: 'x' } }]],
      pageParams: [undefined],
    });
    const { result, onOpenChat } = setup(client);
    result.current.openChatAtAsk('kv:9');
    expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-rep', messageId: 'm-ask' });
  });

  it('asks the server for the feed when the app was opened straight on this report (a push), then opens the box', async () => {
    apiGet.mockResolvedValue(feed([task({ id: 'ask:kv:9', action: { type: 'photo', askRef: 'kv:9', acceptsFile: false } })]));
    const { result, onOpenChat } = setup();
    act(() => result.current.openChatAtAsk('kv:9'));
    await waitFor(() => expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-box', messageId: 'm-box' }));
    expect(apiGet).toHaveBeenCalledWith('/v1/me/today-feed');
  });

  it('opens the chat at the report\'s own message when the box cannot be found (never does nothing)', async () => {
    apiGet.mockRejectedValue(new Error('offline'));
    const { result, onOpenChat } = setup();
    act(() => result.current.openChatAtAsk('kv:9'));
    await waitFor(() => expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-rep', messageId: 'm-rep' }));
  });

  it('opens the newest box of an open job (DU OTP, mock drill, declarations)', () => {
    const client = makeTestQueryClient();
    client.setQueryData(todayFeedKey, feed([task({ id: 'du', kind: 'du_otp', messageId: 'm-du' })]));
    const { result, onOpenChat } = setup(client);
    result.current.openChatAtTask('du_otp');
    expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-box', messageId: 'm-du' });
  });

  it('falls back to the report\'s message when no such job is open', async () => {
    apiGet.mockResolvedValue(feed([]));
    const { result, onOpenChat } = setup();
    act(() => result.current.openChatAtTask('mock_drill'));
    await waitFor(() => expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-rep', messageId: 'm-rep' }));
  });

  it('types a sentence in the chat unsent', () => {
    const { result, onOpenChat } = setup();
    result.current.draftInChat('Please place an order for Diesel 8,000 L');
    expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c-rep', draft: 'Please place an order for Diesel 8,000 L' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('sends a sentence into this report\'s chat', async () => {
    apiPost.mockResolvedValue({ id: 'sent', conversationId: 'c-rep', body: 'stock kitna hai', attachments: [] });
    const { result } = setup();
    await act(async () => result.current.sendChat('stock kitna hai'));
    expect(apiPost.mock.calls[0]![0]).toBe('/v1/conversations/c-rep/messages');
    expect(apiPost.mock.calls[0]![1]).toMatchObject({ body: 'stock kitna hai' });
  });

  it('says a failed send failed (the caller\'s button then says it did not go through)', async () => {
    apiPost.mockRejectedValue(new Error('offline'));
    const { result } = setup();
    await expect(result.current.sendChat('x')).rejects.toBeTruthy();
  });

  it('copies through the clipboard and reports whether the phone allowed it', async () => {
    copyText.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { result } = setup();
    expect(await result.current.copy('0.8')).toBe(true);
    expect(await result.current.copy('0.8')).toBe(false);
  });

  it('keeps one identity across renders, so a button list that depends on it does not churn', () => {
    const { result, rerender } = setup();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
