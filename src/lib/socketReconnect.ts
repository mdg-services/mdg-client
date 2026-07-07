import type { TypedSocket } from './socket';

/**
 * Run `onReconnect` each time the socket RE-connects, but NOT on the first
 * connect. Used to backfill data missed while the socket was down (the server
 * does not replay history on rejoin), which is what lets us keep
 * `refetchOnWindowFocus` off in the WebView. Returns a cleanup that detaches the
 * listener.
 *
 * If the socket is already connected when this is called, the first subsequent
 * reconnect counts as a re-connect (the caller's initial query already has the
 * current data).
 */
export function onSocketReconnect(
  socket: TypedSocket,
  onReconnect: () => void,
): () => void {
  let connectedOnce = socket.connected;
  const handler = () => {
    if (connectedOnce) {
      onReconnect();
    } else {
      connectedOnce = true;
    }
  };
  socket.on('connect', handler);
  return () => {
    socket.off('connect', handler);
  };
}
