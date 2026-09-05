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
 */
export function useBackToClose(onClose: () => void, enabled = true): void {
  // Held in a ref so a parent that rebuilds `onClose` every render does not
  // tear the history entry down and push a second one.
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const id = (sheetSeq += 1);
    let popped = false;

    window.history.pushState({ __dkSheet: id } as SheetHistoryState, '');

    const onPopState = () => {
      popped = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (popped) return;
      // Only unwind while OUR entry is still the current one.
      const state = window.history.state as SheetHistoryState | null;
      if (state?.__dkSheet === id) window.history.back();
    };
  }, [enabled]);
}
