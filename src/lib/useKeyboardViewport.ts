import * as React from 'react';

/**
 * Makes the app track the browser's *visual* viewport so chat (and any other
 * bottom-anchored input) stays above the on-screen keyboard on every device —
 * not just the ones where the native Android window resizes for the keyboard.
 *
 * Two failure modes this defends against:
 *   • The window resizes for the keyboard ("adjustResize" — most phones): the
 *     layout `100%` already shrinks, so this is a no-op but harmless.
 *   • The window does NOT resize ("adjustPan" / floating & split keyboards —
 *     common on tablets, plus iOS Safari and desktop browsers): `100%` stays
 *     full-height and a bottom-pinned composer would sit *behind* the keyboard.
 *     Here `window.visualViewport` is the only reliable signal.
 *
 * It publishes, on <html>:
 *   --vvh : the visible viewport height in px (bind a screen's height to this to
 *           keep its bottom edge above the keyboard in every mode)
 *   --kb  : the keyboard's bottom overlap in px (0 when closed)
 *
 * …and returns `keyboardOpen`, so the shell can lift the composer / drop the tab
 * bar while typing. `keyboardOpen` is true when either an editable element is
 * focused OR the visual viewport reports a real bottom inset, so it holds steady
 * across the brief blur that a tap on Send / attach buttons causes.
 */
export function useKeyboardViewport(): { keyboardOpen: boolean } {
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    const vv = window.visualViewport;

    const isEditable = (el: Element | null): boolean =>
      !!el &&
      (el.tagName === 'TEXTAREA' ||
        el.tagName === 'INPUT' ||
        (el as HTMLElement).isContentEditable === true);

    // The tallest the visible viewport has been at this width — i.e. what it
    // measures with no keyboard. Reset when the width changes, because a
    // rotation legitimately changes the height for good.
    let maxH = 0;
    let lastW = 0;

    let raf = 0;
    const compute = () => {
      raf = 0;
      const h = vv ? vv.height : window.innerHeight;
      const w = vv ? vv.width : window.innerWidth;
      const top = vv ? vv.offsetTop : 0;
      // Bottom overlap of the keyboard. ~0 under adjustResize (innerHeight has
      // already shrunk to match); the true keyboard height under adjustPan.
      const kb = Math.max(0, window.innerHeight - h - top);
      root.style.setProperty('--vvh', `${Math.round(h)}px`);
      root.style.setProperty('--kb', `${Math.round(kb)}px`);
      if (w !== lastW) {
        lastW = w;
        maxH = 0;
      }
      maxH = Math.max(maxH, h);

      // FOCUS ALONE IS NOT PROOF THE KEYBOARD IS UP.
      //
      // The Android Back key closes the keyboard WITHOUT blurring the field —
      // the reflex every Android user has, and the one WhatsApp honours. Reading
      // `activeElement` on its own, the app concluded the keyboard was still
      // there and left the tab bar slid off the bottom of the screen: Chat,
      // Reports, Kavach and Profile simply gone, with no way to get them back
      // short of tapping the field and dismissing the keyboard the app's way.
      // So focus only counts while the viewport is ACTUALLY shorter than its
      // own no-keyboard height.
      const shrunk = maxH - h > 60;
      setKeyboardOpen(kb > 60 || (isEditable(document.activeElement) && shrunk));
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };
    // Blur fires before the next control gains focus; re-check on the next tick.
    const onFocusOut = () => window.setTimeout(schedule, 0);

    compute();
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('focusin', schedule);
    window.addEventListener('focusout', onFocusOut);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('focusin', schedule);
      window.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return { keyboardOpen };
}
