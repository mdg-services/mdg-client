import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { duOtpKey } from '@/hooks/api/useDuOtp';
import { useAuthStore } from '@/store/auth';
import { makeDuOtpView } from '@/test/duOtpFixtures';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';

import { useDuOtpSocket } from './useDuOtpSocket';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

function mount(connected = true) {
  h.socket = makeFakeSocket(connected);
  const qc = makeTestQueryClient();
  const view = renderHookWithProviders(() => useDuOtpSocket(), {
    queryClient: qc,
    withRouter: false,
  });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  return { qc, spy, ...view };
}

const asked = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([f]) => JSON.stringify(f) === JSON.stringify({ queryKey: duOtpKey }));

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
});
afterEach(() => cleanup());

describe('useDuOtpSocket', () => {
  it("asks for the view again when the user's own outlet moved", () => {
    const { spy } = mount();
    act(() => h.socket.server('duOtp:changed', { dealerId: 'd1' }));
    expect(asked(spy)).toHaveLength(1);
  });

  it("does not ask when another outlet's event is heard", () => {
    const { spy } = mount();
    act(() => h.socket.server('duOtp:changed', { dealerId: 'someone-else' }));
    expect(asked(spy)).toHaveLength(0);
  });

  it("falls back to the outlet the box already drew when the user record has none", () => {
    signIn({ role: 'dealer-owner', dealerId: null });
    h.socket = makeFakeSocket(true);
    const qc = makeTestQueryClient();
    qc.setQueryData(duOtpKey, makeDuOtpView({ dealerId: 'd7' }));
    renderHookWithProviders(() => useDuOtpSocket(), { queryClient: qc, withRouter: false });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    act(() => h.socket.server('duOtp:changed', { dealerId: 'd1' }));
    expect(asked(spy)).toHaveLength(0);
    act(() => h.socket.server('duOtp:changed', { dealerId: 'd7' }));
    expect(asked(spy)).toHaveLength(1);
  });

  it('marks a drawn view out of date, and fetches nothing when no box is reading it', () => {
    const { qc } = mount();
    qc.setQueryData(duOtpKey, makeDuOtpView());
    expect(qc.getQueryState(duOtpKey)?.isInvalidated).toBe(false);
    act(() => h.socket.server('duOtp:changed', { dealerId: 'd1' }));
    expect(qc.getQueryState(duOtpKey)?.isInvalidated).toBe(true);
    expect(qc.isFetching({ queryKey: duOtpKey })).toBe(0);
  });

  it('asks again after the socket reconnects, but not on the first connect', () => {
    const { spy } = mount(false);
    act(() => h.socket.server('connect'));
    expect(asked(spy)).toHaveLength(0);
    act(() => h.socket.server('connect'));
    expect(asked(spy)).toHaveLength(1);
  });

  it('listens for nothing while signed out', () => {
    useAuthStore.setState({ token: null, user: null });
    mount();
    expect(h.socket.handlerCount('duOtp:changed')).toBe(0);
  });

  it('lets go of the socket when it goes away', () => {
    const { unmount } = mount();
    expect(h.socket.handlerCount('duOtp:changed')).toBe(1);
    unmount();
    expect(h.socket.handlerCount('duOtp:changed')).toBe(0);
  });
});
