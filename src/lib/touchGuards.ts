/**
 * Document-level browser-affordance guards for the WebView shell.
 *
 * The app runs only inside a WebView (WKWebView / Android System WebView) and
 * must feel native. Browsers expose a handful of gestures that either look wrong
 * or actively break the shell — the worst being native drag-and-drop: press and
 * hold an image (or link) and a ghost follows the finger, which on Android System
 * WebView locks the app up. CSS `-webkit-user-drag: none` handles this on WebKit
 * but is bypassed on some Blink/Android WebView builds, so we also cancel the
 * drag at the event level here, in the capture phase, before the browser builds
 * the ghost.
 *
 * The contextmenu guard suppresses the Android long-press "Save image / Copy
 * link" menu (which CSS callout suppression does not cover on Android) but
 * EXEMPTS editable fields, so long-press Paste/Select still works in the composer
 * and forms. Chat message text is NOT exempt: long-press there opens the app's
 * own message action menu (Copy lives in it), which must never race the
 * browser's selection UI.
 */
export function installTouchGuards(): void {
  const stop = (e: Event) => e.preventDefault();

  // Native drag-and-drop (the image/link ghost that hangs the shell).
  document.addEventListener('dragstart', stop, true);
  document.addEventListener('drop', stop, true);
  document.addEventListener('dragover', stop, true);

  // iOS pinch-zoom (Safari/WKWebView emit gesturestart on multi-touch).
  document.addEventListener('gesturestart', stop, true);

  // Long-press context menu — everywhere except (a) editable fields, so paste
  // and native selection survive, and (b) any opt-in .select-text surface.
  // Chat bubbles no longer use .select-text: their long-press opens the message
  // action menu instead (Copy moved there). Images/links/chrome still lose
  // their "Save image / Open link" menu.
  document.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        t.closest('input, textarea, [contenteditable="true"], .select-text')
      ) {
        return;
      }
      e.preventDefault();
    },
    true,
  );
}
