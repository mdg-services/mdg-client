import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { declarationsKey } from '@/hooks/api/useDeclarations';
import { makeDeclarationsView } from '@/test/declarationsFixtures';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';

import { useDeclarationsSocket } from './useDeclarationsSocket';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

function mount() {
  h.socket = makeFakeSocket(true);
  const qc = makeTestQueryClient();
  const view = renderHookWithProviders(() => useDeclarationsSocket(), {
    queryClient: qc,
    withRouter: false,
  });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  return { qc, spy, ...view };
}

const asked = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(
    ([f]) => JSON.stringify(f) === JSON.stringify({ queryKey: declarationsKey }),
  );

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
});
afterEach(() => cleanup());

describe('useDeclarationsSocket', () => {
  it("asks for the view again when the user's own outlet moved", () => {
    const { spy } = mount();
    act(() => h.socket.server('declarations:changed', { dealerId: 'd1' }));
    expect(asked(spy)).toHaveLength(1);
  });

  it("does not ask when another outlet's event is heard", () => {
    const { spy } = mount();
    act(() => h.socket.server('declarations:changed', { dealerId: 'someone-else' }));
    expect(asked(spy)).toHaveLength(0);
  });

  it('does not answer to the Mock Drill event', () => {
    const { spy } = mount();
    act(() => h.socket.server('mockDrill:changed', { dealerId: 'd1' }));
    expect(asked(spy)).toHaveLength(0);
  });

  it('falls back to the outlet the box already drew when the user record has none', () => {
    signIn({ role: 'dealer-owner', dealerId: null });
    h.socket = makeFakeSocket(true);
    const qc = makeTestQueryClient();
    qc.setQueryData(declarationsKey, makeDeclarationsView({ dealerId: 'd7' }));
    renderHookWithProviders(() => useDeclarationsSocket(), { queryClient: qc, withRouter: false });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    act(() => h.socket.server('declarations:changed', { dealerId: 'd1' }));
    expect(asked(spy)).toHaveLength(0);
    act(() => h.socket.server('declarations:changed', { dealerId: 'd7' }));
    expect(asked(spy)).toHaveLength(1);
  });

  it('stops listening when it is unmounted', () => {
    const { unmount } = mount();
    expect(h.socket.handlerCount('declarations:changed')).toBe(1);
    unmount();
    expect(h.socket.handlerCount('declarations:changed')).toBe(0);
  });
});
