import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useComplaintsSocket } from '@/features/chat/useComplaintsSocket';
import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import { useDeclarationsSocket } from '@/features/chat/useDeclarationsSocket';
import { useDuOtpSocket } from '@/features/chat/useDuOtpSocket';
import { useMockDrillSocket } from '@/features/chat/useMockDrillSocket';
import { useWorkPermitsSocket } from '@/features/chat/useWorkPermitsSocket';
import { useOutletSetupSocket } from '@/features/setup/useOutletSetupSocket';
import { todayFeedKey } from '@/hooks/api/useTodayFeed';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

/**
 * The Today page lists what is still open and the newest reports, so every event
 * that changes a chat or a box marks its feed out of date (ADR 0055 §5).
 */
function mount(connected = true) {
  h.socket = makeFakeSocket(connected);
  const qc = makeTestQueryClient();
  qc.setQueryData(todayFeedKey, { day: '2026-11-24', role: 'owner', tasks: [], reports: [], done: [] });
  qc.setQueryData(['report', 'm1'], { id: 'm1' });
  qc.setQueryData(['report-history', 'all'], { pages: [], pageParams: [] });
  renderHookWithProviders(
    () => {
      useConversationsListSocket();
      useOutletSetupSocket();
      useDuOtpSocket();
      useComplaintsSocket();
      useWorkPermitsSocket();
      useMockDrillSocket();
      useDeclarationsSocket();
    },
    { queryClient: qc, route: '/' },
  );
  return qc;
}

const stale = (qc: ReturnType<typeof makeTestQueryClient>) =>
  qc.getQueryState(todayFeedKey)?.isInvalidated === true;

const reportStale = (qc: ReturnType<typeof makeTestQueryClient>) => ({
  overlay: qc.getQueryState(['report', 'm1'])?.isInvalidated === true,
  history: qc.getQueryState(['report-history', 'all'])?.isInvalidated === true,
});

beforeEach(() => {
  signIn({ id: 'owner', role: 'dealer-owner', dealerId: 'd1' });
});
afterEach(() => cleanup());

describe('the Today feed follows the sockets', () => {
  it('starts fresh', () => {
    expect(stale(mount())).toBe(false);
  });

  it.each([
    ['a new chat message', 'message:new', { conversation: { id: 'c1' }, message: { id: 'm1', senderId: 'mdg' } }],
    ['a chat update', 'conversation:updated', { conversation: { id: 'c1' } }],
    ['a message deleted (not the newest one)', 'message:deleted', { conversationId: 'c1', messageId: 'm1' }],
    ['a paper ask changing', 'document-ask:updated', {}],
    ['a setup step', 'outletSetup:changed', undefined],
    ['the DU OTP box', 'duOtp:changed', { dealerId: 'd1' }],
    ['a complaint', 'complaints:changed', { dealerId: 'd1' }],
    ['a work permit', 'workPermits:changed', { dealerId: 'd1' }],
    ['the mock drill', 'mockDrill:changed', { dealerId: 'd1' }],
    ['the declarations box', 'declarations:changed', { dealerId: 'd1' }],
  ])('is marked out of date by %s', (_label, event, payload) => {
    const qc = mount();
    act(() => h.socket.server(event, ...(payload === undefined ? [] : [payload])));
    expect(stale(qc)).toBe(true);
  });

  it("is not marked by another outlet's box event", () => {
    const qc = mount();
    act(() => h.socket.server('complaints:changed', { dealerId: 'someone-else' }));
    expect(stale(qc)).toBe(false);
  });

  it('is marked after the socket reconnects, not on the first connect', () => {
    const qc = mount(false);
    act(() => h.socket.server('connect'));
    expect(stale(qc)).toBe(false);
    act(() => h.socket.server('connect'));
    expect(stale(qc)).toBe(true);
  });

  it('fetches nothing when no page is reading it', () => {
    const qc = mount();
    act(() => h.socket.server('message:new', { conversation: { id: 'c1' } }));
    expect(qc.isFetching({ queryKey: todayFeedKey })).toBe(0);
  });
});

describe('an open report and the Reports tab follow the chat too', () => {
  it('start fresh', () => {
    expect(reportStale(mount())).toEqual({ overlay: false, history: false });
  });

  it.each([
    ['a new chat message', 'message:new', { conversation: { id: 'c1' }, message: { id: 'm1', senderId: 'mdg' } }],
    ['a chat update', 'conversation:updated', { conversation: { id: 'c1' } }],
    ['a message deleted (so an open report can say it was removed)', 'message:deleted', { conversationId: 'c1', messageId: 'm1' }],
  ])('are marked out of date by %s', (_label, event, payload) => {
    const qc = mount();
    act(() => h.socket.server(event, payload));
    expect(reportStale(qc)).toEqual({ overlay: true, history: true });
  });

  it('are marked after the socket reconnects, not on the first connect', () => {
    const qc = mount(false);
    act(() => h.socket.server('connect'));
    expect(reportStale(qc)).toEqual({ overlay: false, history: false });
    act(() => h.socket.server('connect'));
    expect(reportStale(qc)).toEqual({ overlay: true, history: true });
  });

  it('are not touched by a box event that is not a chat message', () => {
    const qc = mount();
    act(() => h.socket.server('duOtp:changed', { dealerId: 'd1' }));
    expect(reportStale(qc)).toEqual({ overlay: false, history: false });
  });

  it('folds a burst of messages into one more read, not one per message', () => {
    vi.useFakeTimers();
    try {
      const qc = mount();
      const spy = vi.spyOn(qc, 'invalidateQueries');
      const count = () => spy.mock.calls.filter((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey) === '["report"]').length;
      for (let i = 0; i < 5; i += 1) act(() => h.socket.server('message:new', { conversation: { id: 'c1' }, message: { id: `x${i}`, senderId: 'mdg' } }));
      expect(count()).toBe(1);
      act(() => {
        vi.advanceTimersByTime(1600);
      });
      expect(count()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
