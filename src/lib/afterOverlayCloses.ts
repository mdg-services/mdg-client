/**
 * Run `run` once the overlay that is closing has finished rewinding its history
 * entry — for an overlay item that NAVIGATES.
 *
 * The same dance `OverflowMenu.select` does for the ⋮ menu, for the same
 * reason. An open overlay owns one history entry (`useBackToClose`), and closing
 * it any way but the Back button rewinds that entry with `history.back()`, which
 * is asynchronous. A tap that navigated straight away would push its route on
 * top of the overlay's entry and leave the rewind nowhere to land, so the dealer
 * would need one extra Back press to leave the screen it opened.
 *
 * Call it from the tap handler AFTER asking the overlay to close, so the
 * listener is in place before the rewind fires. A WebView that never sends the
 * `popstate` is covered by a short fallback.
 */
export function afterOverlayCloses(run: () => void): void {
  const state = window.history.state as { __dkSheet?: number } | null;
  if (state?.__dkSheet === undefined) {
    run();
    return;
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', go);
    window.clearTimeout(timer);
    run();
  };
  window.addEventListener('popstate', go);
  const timer = window.setTimeout(go, 400);
}
