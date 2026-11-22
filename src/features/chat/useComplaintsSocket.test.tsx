import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { complaintsKey } from '@/hooks/api/useComplaints';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';

import { useComplaintsSocket } from './useComplaintsSocket';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

function mount() {
  h.socket = makeFakeSocket(true);
  const qc = makeTestQueryClient();
  const view = renderHookWithProviders(() => useComplaintsSocket(), {
    queryClient: qc,
    withRouter: false,
  });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  return { qc, spy, ...view };
}

const asked = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([f]) => JSON.stringify(f) === JSON.stringify({ queryKey: complaintsKey }));

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
});
afterEach(() => cleanup());

describe('useComplaintsSocket', () => {
  it("asks for the view again when the user's own outlet moved", () => {
    const { spy } = mount();
    act(() => h.socket.server('complaints:changed', { dealerId: 'd1' }));
    expect(asked(spy)).toHaveLength(1);
  });

  it("does not ask when another outlet's event is heard", () => {
    const { spy } = mount();
    act(() => h.socket.server('complaints:changed', { dealerId: 'someone-else' }));
    expect(asked(spy)).toHaveLength(0);
  });

  it('stops listening when it is unmounted', () => {
    const { unmount } = mount();
    expect(h.socket.handlerCount('complaints:changed')).toBe(1);
    unmount();
    expect(h.socket.handlerCount('complaints:changed')).toBe(0);
  });
});
