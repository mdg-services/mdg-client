import * as React from 'react';

import { useBackToClose } from './useBackToClose';
import { useScrollLock } from './useScrollLock';

/**
 * Everything that makes an overlay a real dialog rather than a div that happens
 * to be on top.
 *
 * NONE OF THE APP'S SIX EXISTING SHEETS DOES ANY OF THIS. `DensityCaptureSheet`,
 * `MessageActionsSheet`, `ReactionsSheet`, `MessageInfoSheet`, `FinalizeSubmitSheet`
 * and `EditWorkerDialog` are all `fixed inset-0` divs with a backdrop button:
 * no `role`, no `aria-modal`, focus left wherever it was, and Escape doing
 * nothing. On a phone that is survivable; with a keyboard attached, or a screen
 * reader, or Android's TalkBack, it means the reader keeps announcing the page
 * behind the sheet and Tab walks straight out of it into controls the dealer
 * cannot see.
 *
 * This is written as a hook, not inlined into one sheet, precisely so the other
 * six can adopt it one at a time without anybody re-deriving the four rules:
 *
 *  1. `role="dialog"` + `aria-modal="true"` on the panel, so assistive
 *     technology stops reading the page behind it. (The caller sets these; they
 *     are attributes on its own markup.)
 *  2. Focus MOVES IN on open and is RESTORED on close. Without the restore, a
 *     dealer who closes the sheet has focus on `<body>` and the next Tab starts
 *     at the top of the app — which, on the chat screen, is twelve stops away
 *     from where they were.
 *  3. Escape closes it. The gesture costs nothing to support and its absence is
 *     the thing that makes an overlay feel like a trap.
 *  4. Tab CYCLES inside the panel. A modal you can Tab out of is not modal; the
 *     focus ring silently leaves the dialog and lands on something the backdrop
 *     is covering.
 *
 * Page scroll is locked through the existing `useScrollLock`, which is
 * ref-counted, so stacking this on another overlay still restores the scroll
 * position exactly once.
 */

/** What can hold focus inside a panel. `[tabindex="-1"]` is programmatic-only. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(onClose: () => void): React.RefObject<HTMLDivElement> {
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Held in a ref rather than passed to the effect, so a parent that re-creates
  // its `onClose` on every render does not tear the dialog's focus down and set
  // it up again — which would yank focus back to the panel mid-typing.
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  useScrollLock();
  // 5. The phone's Back button closes it. On Android that is the same gesture
  //    as Escape, and it is the one a dealer actually has.
  useBackToClose(onClose);

  React.useEffect(() => {
    const panel = panelRef.current;
    // Whatever the dealer was on when they opened this — the camera button, the
    // ask bar — so it can be handed back on close.
    const returnTo = document.activeElement as HTMLElement | null;

    // Focus the PANEL, not its first button. Landing on a button means a stray
    // Enter sends the photo; landing on the panel means the first Tab reaches
    // the first control, which is what a person expects.
    panel?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // `offsetParent` is null for anything `display:none` — the hidden file
        // inputs every capture flow mounts would otherwise be two invisible
        // stops in the cycle.
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // `isConnected` guards the case where the element that opened the dialog
      // was itself removed while it was open — focusing a detached node throws
      // in some engines and silently does nothing in others.
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, []);

  return panelRef;
}
