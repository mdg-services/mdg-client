import { io } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HIDDEN_RESUME_MS, disconnectSocket, getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { resetStores, signIn } from '@/test/utils';

// A fresh fake socket instance per io() call so we can assert singleton identity.
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    removeAllListeners: vi.fn(),
    connected: false,
    // Socket.IO reads this at handshake time; a refresh re-arms it in place.
    auth: {} as Record<string, unknown>,
  })),
}));

type WithDisconnect = { disconnect: ReturnType<typeof vi.fn> };
type WithConnection = WithDisconnect & { connect: ReturnType<typeof vi.fn>; connected: boolean };
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

/**
 * AN IPHONE FREEZES A BACKGROUNDED APP, AND THE SOCKET WITH IT. The server drops
 * the connection a little later and nothing on the phone notices, so MDG's reply
 * does not show until something else refetches. The moment the app returns, the
 * socket is looked at once.
 */
describe('socket.ts — waking the connection after the app was away', () => {
  const SECOND = 1000;

  function setVisibility(state: 'hidden' | 'visible') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }
  const appState = (detail: 'active' | 'background') =>
    window.dispatchEvent(new CustomEvent('native-app-state', { detail }));

  function liveSocket(connected: boolean) {
    signIn();
    const s = getSocket() as unknown as WithConnection;
    s.connected = connected;
    return s;
  }

  beforeEach(() => {
    resetStores();
    disconnectSocket();
    vi.mocked(io).mockClear();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 26, 10, 0) });
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible'); // also leaves the module's "away since" cleared
    delete (document as unknown as { visibilityState?: string }).visibilityState;
    disconnectSocket();
    resetStores();
  });

  it('reconnects a socket that is down the moment the page is visible again, without waiting out the back-off', () => {
    const s = liveSocket(false);
    setVisibility('hidden');
    vi.advanceTimersByTime(3 * SECOND);
    setVisibility('visible');
    expect(s.connect).toHaveBeenCalledTimes(1);
    // socket.io ignores connect() while it waits out a back-off, so the dead
    // connection is let go of first. Either way the new one starts now.
    expect(s.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      s.connect.mock.invocationCallOrder[0]!,
    );
  });

  it('trusts a connected socket after a short absence', () => {
    const s = liveSocket(true);
    setVisibility('hidden');
    vi.advanceTimersByTime(5 * SECOND);
    setVisibility('visible');
    expect(s.disconnect).not.toHaveBeenCalled();
    expect(s.connect).not.toHaveBeenCalled();
  });

  it('replaces a connected socket after a long absence — a frozen one can be dead without knowing', () => {
    const s = liveSocket(true);
    setVisibility('hidden');
    vi.advanceTimersByTime(HIDDEN_RESUME_MS + SECOND);
    setVisibility('visible');
    expect(s.disconnect).toHaveBeenCalledTimes(1);
    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it('is exactly at the limit not yet "long"', () => {
    const s = liveSocket(true);
    setVisibility('hidden');
    vi.advanceTimersByTime(HIDDEN_RESUME_MS);
    setVisibility('visible');
    expect(s.connect).not.toHaveBeenCalled();
  });

  it('keeps the same socket object, so every handler bound to it stays bound', () => {
    liveSocket(true);
    const before = getSocket();
    setVisibility('hidden');
    vi.advanceTimersByTime(HIDDEN_RESUME_MS + SECOND);
    setVisibility('visible');
    expect(getSocket()).toBe(before);
    expect(io).toHaveBeenCalledTimes(1);
  });

  describe('the shell\'s own word', () => {
    it('counts time in the background from native-app-state, and wakes on active', () => {
      const s = liveSocket(true);
      appState('background');
      vi.advanceTimersByTime(HIDDEN_RESUME_MS + SECOND);
      appState('active');
      expect(s.disconnect).toHaveBeenCalledTimes(1);
      expect(s.connect).toHaveBeenCalledTimes(1);
    });

    it('a short trip to the background leaves a healthy socket alone', () => {
      const s = liveSocket(true);
      appState('background');
      vi.advanceTimersByTime(4 * SECOND);
      appState('active');
      expect(s.connect).not.toHaveBeenCalled();
    });

    it('reconnects a down socket on active even if the page never reported being hidden', () => {
      const s = liveSocket(false);
      appState('active');
      expect(s.connect).toHaveBeenCalledTimes(1);
    });

    it('one return signalled three ways (visible, pageshow, active) restarts the connection once', () => {
      const s = liveSocket(true);
      appState('background');
      setVisibility('hidden');
      vi.advanceTimersByTime(HIDDEN_RESUME_MS + SECOND);
      appState('active');
      setVisibility('visible');
      window.dispatchEvent(new Event('pageshow'));
      expect(s.disconnect).toHaveBeenCalledTimes(1);
      expect(s.connect).toHaveBeenCalledTimes(1);
    });

    it('but a second return, well after the first, is looked at afresh', () => {
      const s = liveSocket(false);
      appState('active');
      vi.advanceTimersByTime(10 * SECOND);
      appState('active');
      expect(s.connect).toHaveBeenCalledTimes(2);
    });
  });

  describe('the network coming back', () => {
    it('reconnects a down socket on online', () => {
      const s = liveSocket(false);
      window.dispatchEvent(new Event('online'));
      expect(s.connect).toHaveBeenCalledTimes(1);
    });

    it('leaves a connected socket alone', () => {
      const s = liveSocket(true);
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('pageshow'));
      expect(s.connect).not.toHaveBeenCalled();
    });

    it('waits for the page to be visible: the visibility change will do it', () => {
      const s = liveSocket(false);
      setVisibility('hidden');
      window.dispatchEvent(new Event('online'));
      expect(s.connect).not.toHaveBeenCalled();
      setVisibility('visible');
      expect(s.connect).toHaveBeenCalledTimes(1);
    });
  });

  it('does nothing, and does not throw, with nobody signed in', () => {
    expect(() => {
      setVisibility('hidden');
      vi.advanceTimersByTime(HIDDEN_RESUME_MS + SECOND);
      setVisibility('visible');
      appState('active');
      window.dispatchEvent(new Event('online'));
    }).not.toThrow();
    expect(io).not.toHaveBeenCalled();
  });
});
