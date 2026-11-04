import { EXTENSION_STORE_ID } from '@dk/shared/types';

/**
 * Whether this copy of the app is the one inside the Dealer Kavach extension's
 * side panel (ADR 0032 §6): loaded as `/chat?embed=extension`.
 *
 * DECIDED ONCE, AND KEPT IN MEMORY. The address carries the flag only on the first
 * screen: the first in-app move (`/chat` to `/chat/abc`) drops the query string, and
 * a reload after that — the chunk-error reload after a new deploy, say — would boot
 * the ordinary app inside the panel, which reads and WRITES the browser's saved
 * sign-in. So the answer is also left in this tab's session storage, which belongs
 * to the panel and is gone when it closes. It is not the saved sign-in and no other
 * tab can see it.
 *
 * ONLY A FRAMED PAGE CAN BE THE PANEL. The panel shows this app in an iframe; a page
 * opened on its own is never it, whatever its address or its session storage says. A
 * link carrying `?embed=extension` that a dealer opens in an ordinary tab (one sent over
 * WhatsApp, say) would otherwise wait for a sign-in no parent will ever send, and
 * `/login` would not get them out, because the stored flag would outlive the address.
 * So a top-level page ignores both, and never writes the flag.
 *
 * Without the flag this reads one session-storage key that nothing ever set, and
 * answers false: the web app and the phone shell behave as they always did.
 */
const FLAG_KEY = 'dk.embed';

let embedded: boolean | null = null;
// What a test says about the frame; null reads the real window.
let framedOverride: boolean | null = null;

/** Whether this page sits inside another page's frame. */
function isFramed(): boolean {
  if (framedOverride !== null) return framedOverride;
  try {
    return window.self !== window.top;
  } catch {
    // A window that cannot even be compared with its top is a framed one.
    return true;
  }
}

function detect(): boolean {
  if (!isFramed()) return false;
  try {
    if (new URLSearchParams(window.location.search).get('embed') === 'extension') {
      try {
        window.sessionStorage.setItem(FLAG_KEY, 'extension');
      } catch {
        // Storage off: the flag then lives in memory only, which is enough until a reload.
      }
      return true;
    }
  } catch {
    // No address to read (a test, a prerender): not embedded.
  }
  try {
    return window.sessionStorage.getItem(FLAG_KEY) === 'extension';
  } catch {
    return false;
  }
}

export function isEmbedded(): boolean {
  if (embedded === null) embedded = detect();
  return embedded;
}

/**
 * Forget the answer, as a page reload does, so the next `isEmbedded()` decides afresh
 * from the address and the tab's session storage. For tests. The test page is never
 * framed, so `framed` says whether it is to count as the panel's frame (default: it
 * reads the real window, which is a top-level page).
 */
export function resetEmbeddedForTests(options: { framed?: boolean } = {}): void {
  embedded = null;
  framedOverride = options.framed ?? null;
}

/** The extension page that may hand this app its sign-in, when nothing is configured. */
export const DEFAULT_EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_STORE_ID}`;

/**
 * The origins whose `auth` message is believed: the published extension, always, and
 * any listed in `VITE_EXTENSION_ORIGINS` (a comma list) beside it. A hand-loaded build
 * has an id of its own, so the deploy that wants one working lists it there; leaving
 * the published extension out of that list cannot lock it out.
 */
export function embedOrigins(
  raw: string | undefined = import.meta.env.VITE_EXTENSION_ORIGINS,
): string[] {
  const extra = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([DEFAULT_EXTENSION_ORIGIN, ...extra]));
}

/** An in-app address as a full page load must open it: with the flag kept when embedded. */
export function withEmbed(path: string): string {
  if (!isEmbedded()) return path;
  const hash = path.indexOf('#');
  const base = hash >= 0 ? path.slice(0, hash) : path;
  const tail = hash >= 0 ? path.slice(hash) : '';
  if (/[?&]embed=/.test(base)) return path;
  return `${base}${base.includes('?') ? '&' : '?'}embed=extension${tail}`;
}
