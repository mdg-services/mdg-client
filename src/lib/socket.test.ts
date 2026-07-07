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
  })),
}));

type WithDisconnect = { disconnect: ReturnType<typeof vi.fn> };

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

  it('tears down and recreates the socket when the token changes', () => {
    signIn({ id: 'u1' }, 'token-A');
    const a = getSocket() as unknown as WithDisconnect;

    useAuthStore.setState({ token: 'token-B' }); // subscription reconnects
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
