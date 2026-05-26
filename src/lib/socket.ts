import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dk/shared/types';
import { io, type Socket } from 'socket.io-client';

import { getApiBaseUrl } from './api';
import { getAuthToken } from '@/store/auth';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket | null {
  const token = getAuthToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }
  // Socket.IO connects to the server ORIGIN; the API base may include a path
  // (e.g. /api), which would otherwise be interpreted as a namespace.
  const origin = (() => {
    try {
      return new URL(getApiBaseUrl()).origin;
    } catch {
      return getApiBaseUrl();
    }
  })();
  socket = io(origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  }) as TypedSocket;
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
