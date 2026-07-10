import * as React from 'react';

// Shared lock depth so the hook COMPOSES: if two overlays are ever open at once,
// the body is pinned only on the 0->1 transition and restored only on ->0. Were
// this per-instance, a second overlay would read window.scrollY as 0 (the body
// is already fixed) and its unmount would unlock the page early and jump it to
// the top. Module-level so all call sites share one counter.
let lockCount = 0;
let savedY = 0;

/**
 * Locks background page scroll while an overlay/sheet is mounted.
 *
 * iOS WKWebView ignores `body { overflow: hidden }` for touch scrolling, so we
 * use the position:fixed technique: pin the body and offset it by the current
 * scroll position, then restore that scroll on cleanup (so the page doesn't jump
 * to the top when the overlay closes). Ref-counted so nested/stacked overlays
 * compose correctly.
 *
 * Do NOT use this on the /chat route — that screen runs inside the fixed-height
 * `--vvh` keyboard-avoidance frame and does not scroll the body.
 */
export function useScrollLock(): void {
  React.useEffect(() => {
    if (lockCount === 0) {
      savedY = window.scrollY;
      const b = document.body.style;
      b.position = 'fixed';
      b.top = `-${savedY}px`;
      b.left = '0';
      b.right = '0';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        const b = document.body.style;
        b.position = '';
        b.top = '';
        b.left = '';
        b.right = '';
        window.scrollTo(0, savedY);
      }
    };
  }, []);
}
