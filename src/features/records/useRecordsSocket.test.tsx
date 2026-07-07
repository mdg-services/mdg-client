import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { renderHookWithProviders, resetStores, signIn } from '@/test/utils';

import { useRecordsSocket } from './useRecordsSocket';

const h = vi.hoisted(() => ({
  socket: null as unknown as FakeSocket,
  toastInfo: vi.fn(),
}));

vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));
vi.mock('@/components/ui', async (orig) => {
  const actual = await orig<typeof import('@/components/ui')>();
  const toast = { info: h.toastInfo, success: vi.fn(), error: vi.fn() };
  return { ...actual, useToast: () => toast };
});

describe('useRecordsSocket', () => {
  beforeEach(() => h.toastInfo.mockReset());
  afterEach(() => resetStores());

  it('invalidates the records query and toasts on record:new', () => {
    signIn();
    h.socket = makeFakeSocket(true);
    const { queryClient } = renderHookWithProviders(() => useRecordsSocket(), {
      withRouter: false,
    });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => h.socket.server('record:new', { record: {} }));

    expect(spy).toHaveBeenCalledWith({ queryKey: ['records'] });
    expect(h.toastInfo).toHaveBeenCalledTimes(1);
  });

  it('does NOT invalidate on the first connect (disconnected at mount), only on reconnect', () => {
    signIn();
    h.socket = makeFakeSocket(false);
    const { queryClient } = renderHookWithProviders(() => useRecordsSocket(), {
      withRouter: false,
    });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => h.socket.server('connect')); // initial
    expect(spy).not.toHaveBeenCalled();

    act(() => h.socket.server('connect')); // reconnect
    expect(spy).toHaveBeenCalledWith({ queryKey: ['records'] });
  });

  it('treats the next connect as a reconnect when already connected at mount', () => {
    signIn();
    h.socket = makeFakeSocket(true);
    const { queryClient } = renderHookWithProviders(() => useRecordsSocket(), {
      withRouter: false,
    });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => h.socket.server('connect'));

    expect(spy).toHaveBeenCalledWith({ queryKey: ['records'] });
  });

  it('short-circuits (registers no listeners) without a token', () => {
    h.socket = makeFakeSocket(true);
    renderHookWithProviders(() => useRecordsSocket(), { withRouter: false });
    expect(h.socket.handlerCount('record:new')).toBe(0);
    expect(h.socket.handlerCount('connect')).toBe(0);
  });

  it('cleanup removes the record:new and connect handlers', () => {
    signIn();
    h.socket = makeFakeSocket(true);
    const { unmount } = renderHookWithProviders(() => useRecordsSocket(), {
      withRouter: false,
    });
    expect(h.socket.handlerCount('record:new')).toBe(1);
    expect(h.socket.handlerCount('connect')).toBe(1);

    unmount();

    expect(h.socket.handlerCount('record:new')).toBe(0);
    expect(h.socket.handlerCount('connect')).toBe(0);
  });
});
