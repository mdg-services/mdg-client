import * as React from 'react';

/**
 * Is the reader's text at 140% or more (spec 2.3, helper H2)?
 *
 * The bar at the bottom cannot hold "Services" in one row at 200% text, so it turns into a
 * two-column grid; the verdict card drops its sentence. Both ask this.
 *
 * HOW IT MEASURES. A hidden `M` set to `font-size: 1rem; line-height: 1` has a box exactly as tall
 * as its font size, so its height over 16 is the text scale: 1 at normal, 2 at 200%. That holds when
 * the root font size is raised (the browser's and Chrome DevTools' way, and what `html { font-size:
 * 200% }` does). Android's own "font size" setting reaches a WebView as a text zoom, which may or may
 * not change the probe's box: nobody has confirmed it on a real phone (spec 11.3). So the root's
 * computed font size is read as well, and the larger scale wins. A phone where neither moves is
 * a phone where the text is not large, as far as the page can tell.
 *
 * One probe serves every caller: the first subscriber makes it, the last one removes it. It is
 * measured again on `resize`, `orientationchange`, and when the page comes back to the foreground
 * (a change made in the phone's settings is seen when the dealer returns, not mid-use).
 *
 * IT ALSO WATCHES THE CHANGE ITSELF. Those three events are not fired when the root font size is set
 * after the page has loaded (Chrome DevTools' "200%" method, a photo run, an accessibility service
 * that rewrites the style). So a `MutationObserver` watches the root's `style` and `class` and the
 * `<head>` (a style tag added later), and a `ResizeObserver` watches a probe that stays in the page for
 * as long as someone listens: when the text grows, the probe's box grows, whatever caused it. Each
 * calls `remeasure`, which tells subscribers only when the answer changed.
 */

/** From this text scale up the page counts as "large text". */
export const LARGE_TEXT_SCALE = 1.4;

/** The text scale right now: 1 = normal, 2 = 200%. */
export function measureTextScale(): number {
  if (typeof document === 'undefined' || !document.body) return 1;
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute('data-probe', 'text-scale');
  probe.style.cssText = 'font-size:1rem;line-height:1;position:absolute;visibility:hidden;pointer-events:none';
  probe.textContent = 'M';
  document.body.appendChild(probe);
  try {
    const fromProbe = probe.getBoundingClientRect().height / 16;
    const root = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
    const fromRoot = Number.isFinite(root) ? root / 16 : 0;
    const scale = Math.max(fromProbe, fromRoot);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  } finally {
    probe.remove();
  }
}

const listeners = new Set<() => void>();
let current = false;
let attached = false;
let mutationWatch: MutationObserver | null = null;
let sizeWatch: ResizeObserver | null = null;
let livingProbe: HTMLElement | null = null;

/** Start the two watchers that notice a text-size change no event announces. Each is optional: an old WebView may lack one. */
function watchTheChange(): void {
  if (typeof MutationObserver !== 'undefined') {
    mutationWatch = new MutationObserver(remeasure);
    mutationWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    if (document.head) mutationWatch.observe(document.head, { childList: true, subtree: true, characterData: true });
  }
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    livingProbe = document.createElement('span');
    livingProbe.setAttribute('aria-hidden', 'true');
    livingProbe.setAttribute('data-probe', 'text-scale-watch');
    livingProbe.style.cssText = 'font-size:1rem;line-height:1;position:absolute;visibility:hidden;pointer-events:none';
    livingProbe.textContent = 'M';
    document.body.appendChild(livingProbe);
    sizeWatch = new ResizeObserver(remeasure);
    sizeWatch.observe(livingProbe);
  }
}

function stopWatching(): void {
  mutationWatch?.disconnect();
  sizeWatch?.disconnect();
  livingProbe?.remove();
  mutationWatch = null;
  sizeWatch = null;
  livingProbe = null;
}

function remeasure(): void {
  const next = measureTextScale() >= LARGE_TEXT_SCALE;
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

function onVisible(): void {
  if (document.visibilityState === 'visible') remeasure();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!attached) {
    attached = true;
    current = measureTextScale() >= LARGE_TEXT_SCALE;
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    document.addEventListener('visibilitychange', onVisible);
    watchTheChange();
  } else {
    // A late subscriber may have missed a change: look again.
    remeasure();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && attached) {
      attached = false;
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      document.removeEventListener('visibilitychange', onVisible);
      stopWatching();
    }
  };
}

/** True when the reader's text is at 140% or more. Re-measures when the window changes size or the root text size is changed. */
export function useLargeText(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => current,
    () => false,
  );
}
