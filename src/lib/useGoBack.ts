import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * What the ← on a screen does when there is no bottom bar to leave it by.
 *
 * Back to where the dealer came from, when they came from somewhere inside the
 * app — that is the screen they expect, whether it was the chat list, a push
 * notification that landed in the app already running, or the ask bar.
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
 * Pages a notification can open cold (density, papers, pump health) fall back
 * to the chat list — the app's home, where the phone's own Back would also land.
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const keyedEntry = location.key !== 'default';
  return React.useCallback(() => {
    const state = window.history.state as { idx?: unknown } | null;
    const hasEarlierEntry =
      typeof state?.idx === 'number' ? state.idx > 0 : keyedEntry;
    if (hasEarlierEntry) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [keyedEntry, navigate, fallback]);
}
