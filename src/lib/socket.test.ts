import { io } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disconnectSocket, getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { resetStores, signIn } from '@/test/utils';

// A fresh fake socket instance per io() call so we can assert singleton identity.
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    connected: false,
    // Socket.IO reads this at handshake time; a refresh re-arms it in place.
    auth: {} as Record<string, unknown>,
  })),
}));

type WithDisconnect = { disconnect: ReturnType<typeof vi.fn> };
type WithAuth = { auth: Record<string, unknown> };

describe('socket.ts singleton lifecycle', () => {
  beforeEach(() => {
    resetStores();
    disconnectSocket();
    vi.mocked(io).mockClear();
  });
  afterEach(() => {
    disconnectSocket();
    resetStores();
  });

  it('returns null and does not connect without a token', () => {
    expect(getSocket()).toBeNull();
    expect(io).not.toHaveBeenCalled();
  });

  it('creates a socket with the low-bandwidth reconnection options', () => {
    signIn();
    const s = getSocket();
    expect(s).not.toBeNull();
    const [origin, opts] = vi.mocked(io).mock.calls.at(-1)!;
    expect(origin).toBe('http://localhost:4000'); // API base path stripped to origin
    expect(opts).toMatchObject({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
    });
  });

  it('reuses the singleton for the same token', () => {
    signIn();
    expect(getSocket()).toBe(getSocket());
  });

  /**
   * THE HOUR-LONG BUG. `requireAuth` re-stamps a dealer's token roughly every
   * hour and the client swaps it in from `X-Refreshed-Token`. Rebuilding the
   * socket on that signal called `removeAllListeners()` on the connection every
   * live subscription was bound to — so the open chat went deaf until a reload,
   * and MDG's reply looked like it had never arrived.
   */
  it('keeps the live socket when the same person\'s token is re-stamped', () => {
    signIn({ id: 'u1' }, 'token-A');
    const a = getSocket() as unknown as WithDisconnect & WithAuth;

    useAuthStore.setState({ token: 'token-B' }); // rolling refresh, same account

    expect(getSocket()).toBe(a);
    expect(a.disconnect).not.toHaveBeenCalled();
    // Re-armed for the NEXT handshake, so a later reconnect is authenticated.
    expect(a.auth).toEqual({ token: 'token-B' });
  });

  it('tears down and recreates the socket when a different account signs in', () => {
    signIn({ id: 'u1' }, 'token-A');
    const a = getSocket() as unknown as WithDisconnect;

    signIn({ id: 'u2' }, 'token-B'); // a different person, not a refresh
    const b = getSocket();

    expect(b).not.toBe(a);
    expect(a.disconnect).toHaveBeenCalled();
  });

  it('disconnects on logout (token cleared)', () => {
    signIn();
    const a = getSocket() as unknown as WithDisconnect;
    useAuthStore.setState({ token: null });
    expect(getSocket()).toBeNull();
    expect(a.disconnect).toHaveBeenCalled();
  });

  it('disconnectSocket forces a fresh socket on the next getSocket', () => {
    signIn();
    const a = getSocket();
    disconnectSocket();
    const b = getSocket();
    expect(b).not.toBe(a);
  });
});
