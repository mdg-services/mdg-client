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

/**
 * ── Waking the connection after the phone has had the app asleep ───────────────
 *
 * An iPhone freezes a backgrounded app within seconds, and the socket with it.
 * The server drops it a little later and nothing on the phone notices: it comes
 * back to the front looking connected (or in the middle of a back-off wait that
 * can run to thirty seconds), and MDG's replies do not arrive until the next
 * thing — a reload, a tap — happens to refetch. The chat screen is the one place
 * where "MDG's reply isn't showing" is the whole complaint.
 *
 * So the moment the app returns, look at the socket once:
 *  - not connected: reconnect NOW, rather than wait out the back-off;
 *  - connected, but the app was away for more than HIDDEN_RESUME_MS: do not
 *    trust it — a socket that was frozen can be dead without knowing — replace it.
 *
 * Replacing it is just `disconnect()` then `connect()` on the same socket, so
 * every handler already bound to it stays bound, and the hooks' own `connect`
 * handlers do what they always do on a connection: rejoin their rooms and refetch.
 * (`connect()` ALONE does nothing while socket.io is in a back-off wait — it
 * only opens a connection that is not already being retried — so a socket that
 * is down is restarted the same way.)
 *
 * "Away" is read from three places, because no single one is reliable: the
 * page's own visibility, the phone saying the app went to the background
 * (`native-app-state`, from the shell), and the network coming back.
 */
export const HIDDEN_RESUME_MS = 20_000;
/** A burst of "we are back" signals (visible, pageshow, app-state) acts once. */
const RESUME_COOLDOWN_MS = 1500;

let hiddenAt: number | null = null;
let lastNudge: { target: TypedSocket; at: number } | null = null;

function markAway(): void {
  if (hiddenAt === null) hiddenAt = Date.now();
}

function nudgeAfterResume(): void {
  const awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
  hiddenAt = null;
  const live = socket;
  if (!live) return;
  const stale = !live.connected || awayMs > HIDDEN_RESUME_MS;
  if (!stale) return;
  const now = Date.now();
  if (lastNudge && lastNudge.target === live && now - lastNudge.at < RESUME_COOLDOWN_MS) return;
  lastNudge = { target: live, at: now };
  live.disconnect();
  live.connect();
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markAway();
    else nudgeAfterResume();
  });
  // A page restored from the back-forward cache, and the network returning: the
  // same check, but never while the page is still hidden — the visibility
  // change that follows will do it.
  const onReturn = () => {
    if (document.visibilityState !== 'hidden') nudgeAfterResume();
  };
  window.addEventListener('pageshow', onReturn);
  window.addEventListener('online', onReturn);
  // The shell's own word, which does not wait for the web view to notice.
  window.addEventListener('native-app-state', (e) => {
    if (e.detail === 'background') markAway();
    else if (e.detail === 'active') nudgeAfterResume();
  });
}
