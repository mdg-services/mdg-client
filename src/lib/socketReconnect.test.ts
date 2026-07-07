import { describe, expect, it, vi } from 'vitest';

import type { TypedSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';

const asSocket = (s: FakeSocket) => s as unknown as TypedSocket;

describe('onSocketReconnect', () => {
  it('does NOT fire on the first connect when the socket starts disconnected', () => {
    const socket = makeFakeSocket(false);
    const cb = vi.fn();
    onSocketReconnect(asSocket(socket), cb);

    socket.server('connect'); // initial connection — not a reconnect

    expect(cb).not.toHaveBeenCalled();
  });

  it('fires on the second connect (a real reconnect)', () => {
    const socket = makeFakeSocket(false);
    const cb = vi.fn();
    onSocketReconnect(asSocket(socket), cb);

    socket.server('connect'); // initial
    socket.server('connect'); // reconnect

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('treats the next connect as a reconnect when already connected at registration', () => {
    const socket = makeFakeSocket(true);
    const cb = vi.fn();
    onSocketReconnect(asSocket(socket), cb);

    socket.server('connect');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cleanup detaches the handler', () => {
    const socket = makeFakeSocket(true);
    const cb = vi.fn();
    const off = onSocketReconnect(asSocket(socket), cb);
    expect(socket.handlerCount('connect')).toBe(1);

    off();

    expect(socket.handlerCount('connect')).toBe(0);
    socket.server('connect');
    expect(cb).not.toHaveBeenCalled();
  });
});
