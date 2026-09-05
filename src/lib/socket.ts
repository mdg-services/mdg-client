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

/**
 * Keep the socket honest about who is signed in — WITHOUT tearing it down every
 * time the same person's token is re-stamped.
 *
 * THE DISTINCTION IS THE WHOLE FUNCTION, AND GETTING IT WRONG COST US REALTIME.
 * This used to treat any change of token as a change of account and rebuild the
 * connection. That was true while a token was only ever replaced at login or
 * logout. It stopped being true the day dealer sessions became year-long and
 * `requireAuth` started re-stamping a token once an hour onto
 * `X-Refreshed-Token` — same person, same `sid`, new clock. Every hour, on the
 * quietest possible signal, the live socket was destroyed with
 * `removeAllListeners()` and replaced by a fresh one that nothing had
 * subscribed to.
 *
 * A hook only survives that if it re-subscribes, which means listing `token` in
 * its dependencies. Three did. The open-conversation hook and the delivery-ack
 * hook did not, so about an hour into any session the thread on screen went
 * deaf: no incoming message, no typing dot, no read receipt, until a reload
 * refetched over HTTP. The reported symptom was "MDG's reply doesn't appear
 * until I reload the page", and the reply was arriving the whole time.
 *
 * So: a refresh KEEPS the connection and only re-arms the handshake for the
 * next reconnect. Only a genuine account change — a different user id, or a
 * token appearing where there was none — rebuilds it.
 */
useAuthStore.subscribe((state, prev) => {
  if (state.token === prev.token) return;

  if (!state.token) {
    disconnectSocket();
    return;
  }

  const live = socket;
  const sameAccount =
    !!live &&
    !!prev.token &&
    !!state.user?.id &&
    state.user.id === prev.user?.id;

  if (live && sameAccount) {
    // The server reads `auth.token` at handshake time only, so the live
    // connection is untouched and stays in every room it joined. This just
    // makes sure a later reconnect presents the current token.
    live.auth = { token: state.token };
    connectedToken = state.token;
    return;
  }

  disconnectSocket();
  getSocket();
});
