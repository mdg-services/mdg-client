import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * What the ← on a screen does when there is no bottom bar to leave it by.
 *
 * Back to where the dealer came from, when they came from somewhere inside the
 * app — that is the screen they expect, whether it was the chat list, a push
 * notification that landed in the app already running.
 *
 * When they did NOT — the screen was opened cold from a notification, which the
 * native shell does with a full page load, so there is no earlier entry in this
 * app's history — `navigate(-1)` would walk off the app, or do nothing. That
 * case goes to `fallback` instead, replacing the entry so the arrow does not
 * leave a dead step behind it.
 *
 * "Is there an earlier entry?" is React Router's own position in this app's
 * history (`history.state.idx`), read at the moment of the tap. It used to be
 * `location.key !== 'default'`, which a `replace` at the very first entry breaks:
 * a cold start on `/chat?c=<id>` (forwarded with `replace`) or the ← that just
 * replaced a cold-opened page with its fallback both carry a random key at index
 * 0 — and the next ← then walked off the app or did nothing. An overlay's own
 * entry carries no `idx`; only then does the key decide.
 *
 * Every screen a push can open cold has a PARENT (`fallbackParentOf`): a service page falls back
 * to Services, My pump's pages to My pump, a bill to Bill and plan. A page may still name its own
 * fallback; when it names none, the parent table decides, so a new screen needs no thought here.
 */
export function useGoBack(fallback?: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const keyedEntry = location.key !== 'default';
  const target = fallback ?? fallbackParentOf(location.pathname);
  return React.useCallback(() => {
    const state = window.history.state as { idx?: unknown } | null;
    const hasEarlierEntry =
      typeof state?.idx === 'number' ? state.idx > 0 : keyedEntry;
    if (hasEarlierEntry) navigate(-1);
    else navigate(target, { replace: true });
  }, [keyedEntry, navigate, target]);
}

/**
 * Where ← goes from an address when the app was opened straight onto it (spec 2.5, 4.5):
 * the screen above it in the app, written as a table so a test can pin every row.
 *
 *   /services/:id, /services  -> /services, /          (a service page, then the Services door)
 *   /pump/papers, /pump       -> /pump, /              (Papers and licences, then My pump)
 *   /settings, /settings/*    -> /pump                 (was /settings: Settings hangs off My pump)
 *   /staff/:id, /staff        -> /staff, /pump
 *   /payments/:id, /payments  -> /payments, /pump
 *   /chat/:id/info|media      -> /chat/:id, then /chat
 *
 * Anything else goes to Today (`/`), where the phone's own Back would also land.
 */
export function fallbackParentOf(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const chat = /^\/chat\/([^/]+)\/(?:info|media)$/.exec(path);
  if (chat) return `/chat/${chat[1]}`;
  if (/^\/chat\/[^/]+$/.test(path)) return '/chat';
  if (/^\/services\/[^/]+$/.test(path)) return '/services';
  if (/^\/pump\/papers$/.test(path)) return '/pump';
  if (/^\/staff\/[^/]+$/.test(path)) return '/staff';
  if (/^\/payments\/[^/]+$/.test(path)) return '/payments';
  if (path === '/staff' || path === '/payments') return '/pump';
  if (path === '/settings' || path === '/profile' || path.startsWith('/settings/')) return '/pump';
  return '/';
}
