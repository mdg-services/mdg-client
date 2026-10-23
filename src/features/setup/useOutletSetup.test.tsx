import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { portalLoginsKey } from '@/hooks/api/usePortalLogins';
import { useAuthStore } from '@/store/auth';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeSetupView, makeStrip } from '@/test/setupFixtures';
import { makeTestQueryClient, renderWithProviders, signIn } from '@/test/utils';
import type { OutletSetupView } from '@dk/shared/types';

import { outletSetupKey, useOutletSetup } from './useOutletSetup';
import { useOutletSetupSocket } from './useOutletSetupSocket';

const h = vi.hoisted(() => ({ socket: null as unknown as FakeSocket, get: vi.fn() }));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));
vi.mock('@/lib/api', () => ({ api: { get: h.get } }));

function Probe() {
  useOutletSetupSocket();
  const q = useOutletSetup();
  return <div data-testid="stage">{q.data ? q.data.stage : q.isError ? 'error' : 'loading'}</div>;
}

const atBilling: OutletSetupView = makeSetupView({
  stage: 'billing',
  strip: makeStrip(['done', 'current', 'todo', 'todo', 'todo']),
});

beforeEach(() => {
  h.socket = makeFakeSocket(true);
  h.get.mockReset();
  h.get.mockResolvedValue(makeSetupView());
  signIn({ role: 'dealer-owner' });
});
afterEach(() => cleanup());

describe('useOutletSetup', () => {
  it('asks for the outlet once, from the dealer route', async () => {
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('services'));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith('/v1/me/setup');
  });

  it('does not ask when signed out, or for an admin who has no outlet', async () => {
    signIn({ role: 'admin' });
    const first = renderWithProviders(<Probe />);
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    first.unmount();

    useAuthStore.setState({ token: null, user: null });
    renderWithProviders(<Probe />);
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
  });

  it('asks again when the window comes back to the front (once the answer has gone stale)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      renderWithProviders(<Probe />);
      await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('services'));
      expect(h.get).toHaveBeenCalledTimes(1);

      // Within the freshness window, coming back asks for nothing.
      window.dispatchEvent(new Event('visibilitychange'));
      await act(async () => {});
      expect(h.get).toHaveBeenCalledTimes(1);

      // Long enough away that the answer is stale.
      h.get.mockResolvedValue(atBilling);
      vi.setSystemTime(Date.now() + 120_000);
      window.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('billing'));
      expect(h.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useOutletSetupSocket', () => {
  it('asks again when the server says the outlet changed, and the card follows', async () => {
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('services'));

    h.get.mockResolvedValue(atBilling);
    act(() => h.socket.server('outletSetup:changed', { dealerId: 'd1' }));
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('billing'));
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it('reads what changed from the server, never from the event', async () => {
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('services'));
    act(() => h.socket.server('outletSetup:changed', { dealerId: 'd1', stage: 'live' }));
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('stage')).toHaveTextContent('services');
  });

  it('asks for the login box again with it: "logins in" moves the stage', async () => {
    const client = makeTestQueryClient();
    client.setQueryData(portalLoginsKey, { portals: [], canEdit: true });
    renderWithProviders(<Probe />, { queryClient: client });
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('services'));
    expect(client.getQueryState(portalLoginsKey)?.isInvalidated).toBe(false);
    act(() => h.socket.server('outletSetup:changed', { dealerId: 'd1' }));
    expect(client.getQueryState(portalLoginsKey)?.isInvalidated).toBe(true);
  });

  it('asks again after the socket reconnects, but not on the first connect', async () => {
    h.socket = makeFakeSocket(false);
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('services'));
    expect(h.get).toHaveBeenCalledTimes(1);

    act(() => h.socket.server('connect'));
    await act(async () => {});
    expect(h.get).toHaveBeenCalledTimes(1);

    act(() => h.socket.server('connect'));
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
  });

  it('lets go of the socket when it goes away', async () => {
    const { unmount } = renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('services'));
    expect(h.socket.handlerCount('outletSetup:changed')).toBe(1);
    unmount();
    expect(h.socket.handlerCount('outletSetup:changed')).toBe(0);
  });

  it('uses the one cache key every card reads', () => {
    expect(outletSetupKey).toEqual(['outlet-setup', 'me']);
  });
});
