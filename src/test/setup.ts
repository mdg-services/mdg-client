import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

import { resetStores } from './utils';

// jsdom doesn't implement scrollIntoView, which the chat auto-scroll calls.
Element.prototype.scrollIntoView = () => {};

// Keep the persisted Zustand stores (auth, lang) from leaking between tests.
afterEach(() => {
  resetStores();
});

/**
 * jsdom has no `PointerEvent`, and that absence hid a whole feature.
 *
 * `fireEvent.pointerMove(el, { clientY: -120 })` silently degrades to a plain
 * `Event` when the constructor is missing — the coordinates never arrive, the
 * handler computes a zero delta, and the test passes by doing nothing. That is
 * why slide-to-cancel and slide-up-to-lock on the chat mic, both of which
 * carried real defects, had never been covered by a single assertion.
 *
 * `MouseEvent` already carries clientX/clientY in jsdom, so a thin subclass
 * that adds the pointer fields is enough to make the gesture testable.
 */
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'touch';
      this.isPrimary = init.isPrimary ?? true;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0.5;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  globalThis.PointerEvent = window.PointerEvent;
}

// Pointer capture is a no-op here; the composer already guards every call, but
// a thrown exception in every test run is noise that hides real failures.
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}
