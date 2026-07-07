import { io, type Socket } from 'socket.io-client';

import { useAuthStore } from '@/store/auth';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dk/shared/types';

import { getApiBaseUrl } from './api';


export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;
// The token the live socket authenticated with. When the signed-in account
// changes we must tear the socket down and reconnect, otherwise it stays
// authenticated as the previous user and the new user's conversation:join is
// rejected server-side — breaking realtime until a refresh.
let connectedToken: string | null = null;

// Socket.IO connects to the server ORIGIN; the API base may include a path
// (e.g. /api), which would otherwise be interpreted as a namespace.
function socketOrigin(): string {
  try {
    return new URL(getApiBaseUrl()).origin;
  } catch {
    return getApiBaseUrl();
  }
}

export function getSocket(): TypedSocket | null {
  const token = useAuthStore.getState().token;
  if (!token) {
    disconnectSocket();
    return null;
  }
  if (socket && connectedToken === token) return socket;
  // A stale socket from a previous token must be discarded before reconnecting.
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socket = io(socketOrigin(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    // Cap backoff at 30s (was 5s): a quick blip still recovers in ~1s, but a
    // sustained 2G outage stops storming a reconnect every 5s — ~6x fewer
    // handshake round-trips, saving background data + battery on flaky links.
    reconnectionDelayMax: 30_000,
    autoConnect: true,
  }) as TypedSocket;
  connectedToken = token;
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  connectedToken = null;
}

// Reconnect (or disconnect) whenever the signed-in account changes, so the
// socket always carries the current user's token.
useAuthStore.subscribe((state, prev) => {
  if (state.token === prev.token) return;
  if (!state.token) {
    disconnectSocket();
  } else {
    disconnectSocket();
    getSocket();
  }
});
