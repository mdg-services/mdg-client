import * as React from 'react';

/**
 * When this person last looked at this pump's Today (helper H3). `since` is what was stored when the
 * screen opened: it does NOT move when `markSeen` runs, so "since you were last here" stays true for
 * the whole visit. `markSeen` stores now for the next visit.
 *
 * It lives in the browser's storage, one entry per person and pump. Storage can be missing or throw
 * (a private window, blocked site data), so every read and write is in a try/catch, and the page
 * works without it: `since` is null and `markSeen` does nothing.
 */
const KEY_PREFIX = 'mdg.client.lastVisit';

export function lastVisitKey(userId: string, outletCode: string): string {
  return `${KEY_PREFIX}.${userId}.${outletCode}`;
}

export function useLastVisit(
  userId: string | null | undefined,
  outletCode: string | null | undefined,
): { since: string | null; markSeen: () => void } {
  const key = userId && outletCode ? lastVisitKey(userId, outletCode) : null;
  const [since] = React.useState<string | null>(() => {
    if (!key) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  const markSeen = React.useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, new Date().toISOString());
    } catch {
      /* storage is a convenience: the page works without it */
    }
  }, [key]);
  return { since, markSeen };
}
