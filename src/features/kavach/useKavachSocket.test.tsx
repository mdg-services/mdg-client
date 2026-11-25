import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kavachCheckKey, kavachKey } from '@/hooks/api/useKavach';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';

import { kView } from './kavachFixtures';
import { useKavachSocket } from './useKavachSocket';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

function mount(connected = true) {
  h.socket = makeFakeSocket(connected);
  const qc = makeTestQueryClient();
  qc.setQueryData(kavachKey, kView());
  qc.setQueryData(kavachCheckKey('c1'), { item: {}, submission: null, lastApproved: null, history: [] });
  renderHookWithProviders(() => useKavachSocket(), { queryClient: qc, route: '/' });
  return qc;
}

const stale = (qc: ReturnType<typeof makeTestQueryClient>) => ({
  view: qc.getQueryState(kavachKey)?.isInvalidated === true,
  check: qc.getQueryState(kavachCheckKey('c1'))?.isInvalidated === true,
});

beforeEach(() => signIn({ id: 'u1', role: 'dealer-staff', dealerId: 'd1' }));
afterEach(() => cleanup());

describe('the Kavach tab follows the socket', () => {
  it('starts fresh', () => {
    expect(stale(mount())).toEqual({ view: false, check: false });
  });

  it('is marked out of date when its own outlet moves, an open row\'s details with it', () => {
    const qc = mount();
    act(() => h.socket.server('kavach:changed', { dealerId: 'd1' }));
    expect(stale(qc)).toEqual({ view: true, check: true });
  });

  it('ignores another outlet', () => {
    const qc = mount();
    act(() => h.socket.server('kavach:changed', { dealerId: 'someone-else' }));
    expect(stale(qc)).toEqual({ view: false, check: false });
  });

  it('asks again after a reconnect, not on the first connect', () => {
    const qc = mount(false);
    act(() => h.socket.server('connect'));
    expect(stale(qc).view).toBe(false);
    act(() => h.socket.server('connect'));
    expect(stale(qc).view).toBe(true);
  });

  it('fetches nothing when no screen is reading it', () => {
    const qc = mount();
    act(() => h.socket.server('kavach:changed', { dealerId: 'd1' }));
    expect(qc.isFetching({ queryKey: kavachKey })).toBe(0);
  });
});
