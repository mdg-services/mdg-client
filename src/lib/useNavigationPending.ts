import * as React from 'react';
import { useLocation } from 'react-router-dom';

const HISTORY_EVENT = 'dk:history-change';
let historyEventsInstalled = false;

/**
 * Make history.pushState / replaceState announce themselves, the way a Back
 * press already does with `popstate`. React Router writes the new address with
 * them the moment a link is tapped, long before the new screen is drawn, so this
 * is the earliest sign that a screen change has started.
 */
function installHistoryEvents() {
  if (historyEventsInstalled) return;
  historyEventsInstalled = true;
  for (const name of ['pushState', 'replaceState'] as const) {
    const original = window.history[name].bind(window.history);
    window.history[name] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      window.dispatchEvent(new Event(HISTORY_EVENT));
    };
  }
}

export type NavigationPending = 'idle' | 'pending' | 'slow';

/**
 * Whether the screen the dealer asked for is still on its way.
 *
 * Navigation runs as a React transition (`v7_startTransition` in main.tsx): the
 * screen on show stays up until the next one is ready, instead of being swapped
 * for an empty page and a spinner. That leaves nothing to say the tap landed,
 * so this reports it. The address bar changes at once; the router's location
 * only changes when the new screen is drawn. While the two differ, a screen is
 * pending — `pending` after `showAfterMs` (a quick change shows nothing at all),
 * `slow` after `slowAfterMs`, when the dealer should be offered a way out.
 */
export function useNavigationPending({
  showAfterMs = 150,
  slowAfterMs = 6_000,
}: { showAfterMs?: number; slowAfterMs?: number } = {}): NavigationPending {
  const location = useLocation();
  const drawn = location.pathname + location.search;
  const drawnRef = React.useRef(drawn);
  drawnRef.current = drawn;
  const [state, setState] = React.useState<NavigationPending>('idle');
  const timers = React.useRef<number[]>([]);

  const settle = React.useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setState('idle');
  }, []);

  // The address changed: if it is not the screen on show, one is on its way.
  // Only an actual change starts this, never a mismatch found on mount (a test's
  // in-memory router, say, never touches the address bar).
  const onAddressChange = React.useCallback(() => {
    const asked = window.location.pathname + window.location.search;
    if (asked === drawnRef.current) return settle();
    if (timers.current.length) return;
    timers.current = [
      window.setTimeout(() => setState((s) => (s === 'idle' ? 'pending' : s)), showAfterMs),
      window.setTimeout(() => setState('slow'), slowAfterMs),
    ];
  }, [settle, showAfterMs, slowAfterMs]);

  React.useEffect(() => {
    installHistoryEvents();
    window.addEventListener(HISTORY_EVENT, onAddressChange);
    window.addEventListener('popstate', onAddressChange);
    return () => {
      window.removeEventListener(HISTORY_EVENT, onAddressChange);
      window.removeEventListener('popstate', onAddressChange);
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, [onAddressChange]);

  // A new screen is drawn: settle, if it is the one asked for.
  React.useEffect(() => {
    if (window.location.pathname + window.location.search === drawn) settle();
  }, [drawn, settle]);

  return state;
}
