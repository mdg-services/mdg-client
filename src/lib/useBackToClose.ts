import * as React from 'react';

/** Marks the history entry an overlay pushed, so we only ever pop our own. */
interface SheetHistoryState {
  __dkSheet?: number;
}

let sheetSeq = 0;

/**
 * Make the phone's Back button close this overlay.
 *
 * WHAT IT WAS LIKE WITHOUT IT
 * ---------------------------
 * A dealer has just photographed the density register and the "is this
 * readable?" sheet is up. They press Back — the reflex every Android user has,
 * and what WhatsApp does — and instead of dismissing the sheet the app left the
 * screen entirely, taking the photograph with it. On the first screen of the
 * app it closed the app. Every sheet in the product behaved this way: confirm
 * this photo, message actions, reactions, give points, final submit, edit
 * worker, and the full-screen picture viewers.
 *
 * HOW IT WORKS
 * ------------
 * Opening pushes one history entry at the SAME url, so React Router sees no
 * route change and nothing re-renders. Back pops that entry, the `popstate`
 * lands here, and this closes the overlay instead of navigating. Closing any
 * other way (the ✕, the backdrop, Escape) unwinds the entry on the way out, so
 * the Back button is not left with a spare press to absorb.
 *
 * THE ONE THING IT WILL NOT DO is pop an entry that is no longer ours. If the
 * overlay closed because the app navigated somewhere — a deep link, a push
 * notification — the current entry belongs to the router, and calling
 * `history.back()` then would undo the navigation the user actually wanted. It
 * checks first and, in that rare case, leaves a spare entry behind: one extra
 * Back press, which is the harmless failure of the two.
 *
 * THE UNWIND WAITS ONE MICROTASK, so a mount that immediately follows can take
 * the entry over instead. React's development build (StrictMode) mounts every
 * effect, unmounts it and mounts it again in the same breath; unwinding on that
 * first unmount sent a `popstate` that landed after the second mount and closed
 * the overlay the moment it opened — every sheet, menu and picture viewer
 * flashed and vanished on a developer's screen while working fine on phones.
 * Production never re-mounts like that, so there the only difference is that
 * `history.back()` runs a microtask later.
 */
export function useBackToClose(onClose: () => void, enabled = true): void {
  // Held in a ref so a parent that rebuilds `onClose` every render does not
  // tear the history entry down and push a second one.
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  // An unwind the last cleanup scheduled and has not carried out yet.
  const pendingRef = React.useRef<{ id: number; cancelled: boolean } | null>(null);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let id: number;
    const pending = pendingRef.current;
    const current = window.history.state as SheetHistoryState | null;
    if (pending && !pending.cancelled && current?.__dkSheet === pending.id) {
      // Re-mounted before the unwind ran: keep the entry we already pushed.
      pending.cancelled = true;
      pendingRef.current = null;
      id = pending.id;
    } else {
      id = sheetSeq += 1;
      window.history.pushState({ __dkSheet: id } as SheetHistoryState, '');
    }
    let popped = false;

    // ONE BACK PRESS, ONE OVERLAY. Every open overlay hears every `popstate`, so
    // with search open and a picture on top of it one press closed both — and
    // left the search's entry behind for the next press to swallow. The press
    // belongs to this overlay only if it took history BELOW this overlay's own
    // entry; landing on a lower overlay's entry (a smaller id) or on the
    // router's (no id) means ours went with it.
    const onPopState = (e: PopStateEvent) => {
      const landed = (e.state as SheetHistoryState | null)?.__dkSheet ?? 0;
      if (landed >= id) return;
      popped = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (popped) return;
      // Only unwind while OUR entry is still the current one.
      const state = window.history.state as SheetHistoryState | null;
      if (state?.__dkSheet !== id) return;
      const job = { id, cancelled: false };
      pendingRef.current = job;
      queueMicrotask(() => {
        if (job.cancelled) return;
        if (pendingRef.current === job) pendingRef.current = null;
        const now = window.history.state as SheetHistoryState | null;
        if (now?.__dkSheet === id) window.history.back();
      });
    };
  }, [enabled]);
}
