import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

/** A minimal stand-in for a socket.io client socket, driveable from tests. */
export interface FakeSocket {
  connected: boolean;
  on(event: string, cb: Handler): FakeSocket;
  off(event: string, cb?: Handler): FakeSocket;
  emit: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  /** Test helper: dispatch a server event to all registered handlers. */
  server(event: string, ...args: unknown[]): void;
  /** Test helper: how many handlers are registered for an event. */
  handlerCount(event: string): number;
}

export function makeFakeSocket(connected = true): FakeSocket {
  const handlers = new Map<string, Set<Handler>>();
  const socket: FakeSocket = {
    connected,
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
      return socket;
    },
    off(event, cb) {
      if (cb) handlers.get(event)?.delete(cb);
      else handlers.delete(event);
      return socket;
    },
    emit: vi.fn(),
    removeAllListeners: vi.fn(() => handlers.clear()),
    disconnect: vi.fn(),
    server(event, ...args) {
      handlers.get(event)?.forEach((h) => h(...args));
    },
    handlerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },
  };
  return socket;
}
