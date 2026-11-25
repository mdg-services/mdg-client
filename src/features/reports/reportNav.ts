import * as React from 'react';
import { useLocation, useNavigate, type Location, type NavigateOptions } from 'react-router-dom';

import { isEmbedded } from '@/lib/embedMode';
import type { TodayReport } from '@dk/shared/types';

/**
 * How a report is opened, and how it is closed (ADR 0056 §4).
 *
 * EVERY REPORT HAS ONE ADDRESS: `/report/:conversationId/:messageId`. The chat button, a Today
 * tile or alert, a push and a row of the Reports tab all build it from the two ids, so the
 * overlay never depends on where the dealer came from.
 *
 * THE OVERLAY IS DRAWN OVER THE SCREEN BEHIND IT. The address changes to `/report/...`, but the
 * screen the dealer was on (the chat at the same place, Today, the Reports list with its filter)
 * stays mounted underneath: the opener leaves it in the history entry's state as
 * `backgroundLocation`, and `App` draws THAT location's route under the overlay. Close and Back
 * are then the same thing: pop the entry, and the screen is simply there, exactly as it was.
 * With no `backgroundLocation` (a push on a cold start, a pasted link) the screen beneath is
 * Today, and Close goes to Today.
 *
 * ONE ENTRY PER OVERLAY. Opening from a screen pushes one entry. Opening from another overlay
 * (the "newer report" link, a paired receipt) REPLACES the overlay's entry and keeps its
 * `backgroundLocation`, so Back still goes to the screen the dealer started on, not through
 * every report they touched.
 */

const REPORT_PATH = /^\/report\/([^/?#]+)\/([^/?#]+)\/?$/;

/** `/report/<conversationId>/<messageId>`, both ids encoded. */
export function reportPath(conversationId: string, messageId: string): string {
  return `/report/${encodeURIComponent(conversationId)}/${encodeURIComponent(messageId)}`;
}

export interface ReportTarget {
  conversationId: string;
  messageId: string;
}

/** The two ids an address names, or null when it is not a report's. Ignores a query string. */
export function parseReportPath(pathname: string): ReportTarget | null {
  const hit = REPORT_PATH.exec(pathname);
  if (!hit) return null;
  try {
    return { conversationId: decodeURIComponent(hit[1]!), messageId: decodeURIComponent(hit[2]!) };
  } catch {
    return null;
  }
}

/** The screen an overlay is drawn over: a location, as the router keeps one. */
export type BackgroundLocation = Pick<Location, 'pathname' | 'search' | 'hash' | 'state' | 'key'>;

/** What an opener leaves in the new history entry. */
export interface ReportRouteState {
  backgroundLocation?: BackgroundLocation;
  /** The pump code a push or link named (`?outlet=12E`), kept for the overlay to compare with the pump signed in. */
  outletCode?: string;
  /**
   * The row the opener already holds (a tile, an alert, a history row, the chat message). The
   * overlay draws it at once and the server's copy replaces it, so a report opens with no wait.
   */
  report?: TodayReport;
  /**
   * The message this overlay was FIRST opened for. "See newer" replaces the overlay with another
   * message but keeps this, so "See in chat" can tell that the chat underneath is still at the
   * first one and must be moved to the newer one.
   */
  openedFromMessageId?: string;
}

function isBackground(raw: unknown): raw is BackgroundLocation {
  if (!raw || typeof raw !== 'object') return false;
  const loc = raw as Partial<BackgroundLocation>;
  return (
    typeof loc.pathname === 'string' &&
    loc.pathname.startsWith('/') &&
    // An overlay is never the screen behind an overlay: a bad entry would loop the router.
    parseReportPath(loc.pathname) === null
  );
}

/** What a location's state says about a report, checked: anything off is dropped, never trusted. */
export function readReportState(state: unknown): ReportRouteState {
  if (!state || typeof state !== 'object') return {};
  const raw = state as { backgroundLocation?: unknown; report?: unknown; openedFromMessageId?: unknown };
  const out: ReportRouteState = {};
  if (typeof raw.openedFromMessageId === 'string' && raw.openedFromMessageId) {
    out.openedFromMessageId = raw.openedFromMessageId;
  }
  if (isBackground(raw.backgroundLocation)) {
    const b = raw.backgroundLocation;
    out.backgroundLocation = {
      pathname: b.pathname,
      search: typeof b.search === 'string' ? b.search : '',
      hash: typeof b.hash === 'string' ? b.hash : '',
      state: b.state ?? null,
      key: typeof b.key === 'string' ? b.key : 'report-bg',
    };
  }
  const row = raw.report as Partial<TodayReport> | undefined;
  if (row && typeof row === 'object' && typeof row.messageId === 'string' && typeof row.kind === 'string') {
    out.report = row as TodayReport;
  }
  return out;
}

/** A pump code as written in a link: letters and digits only, short. Anything else is ignored, never trusted. */
const OUTLET_HINT = /^[A-Za-z0-9-]{1,12}$/;

/** The pump code an overlay's address or entry state carries, or undefined. */
export function outletHintOf(search: string, state: unknown): string | undefined {
  const fromQuery = new URLSearchParams(search).get('outlet');
  if (fromQuery && OUTLET_HINT.test(fromQuery)) return fromQuery;
  const raw = state && typeof state === 'object' ? (state as { outletCode?: unknown }).outletCode : undefined;
  return typeof raw === 'string' && OUTLET_HINT.test(raw) ? raw : undefined;
}

/** Where the app opens when nothing else sits beneath an overlay. The panel has no Today. */
export function homePath(): string {
  return isEmbedded() ? '/chat' : '/';
}

/**
 * The location `App` draws the screen from while an overlay is open, or null when the real
 * address is not an overlay's (then the real location is drawn as it always was).
 */
export function backgroundOf(real: Pick<Location, 'pathname' | 'state'>): BackgroundLocation | null {
  if (parseReportPath(real.pathname) === null) return null;
  return (
    readReportState(real.state).backgroundLocation ?? {
      pathname: homePath(),
      search: '',
      hash: '',
      state: null,
      key: 'report-bg',
    }
  );
}

/**
 * The router's location as the app really is at: inside `App`'s routes `useLocation()` answers
 * with the SCREEN BEHIND the overlay (that is how it is drawn), so anything that must know
 * about the overlay itself reads this instead. Outside `App` (a test) it is `useLocation()`.
 */
export const RealLocationContext = React.createContext<Location | null>(null);

export function useRealLocation(): Location {
  const real = React.useContext(RealLocationContext);
  const routed = useLocation();
  return real ?? routed;
}

/**
 * How to navigate to a report from `here`: push from a screen, replace from another overlay,
 * and in both cases leave the screen behind the overlay in the entry's state.
 */
export function openReportOptions(
  here: Pick<Location, 'pathname' | 'search' | 'hash' | 'state' | 'key'>,
  row?: TodayReport,
  messageId?: string,
): NavigateOptions {
  const onOverlay = parseReportPath(here.pathname) !== null;
  const hereState = onOverlay ? readReportState(here.state) : {};
  const backgroundLocation = onOverlay
    ? hereState.backgroundLocation
    : { pathname: here.pathname, search: here.search, hash: here.hash, state: here.state, key: here.key };
  // From a screen the report opened is the first one; from another overlay the first one is kept.
  const openedFromMessageId = onOverlay ? hereState.openedFromMessageId : messageId;
  const state: ReportRouteState = {
    ...(backgroundLocation ? { backgroundLocation } : {}),
    ...(row ? { report: row } : {}),
    ...(openedFromMessageId ? { openedFromMessageId } : {}),
  };
  return { replace: onOverlay, state };
}

/**
 * A push or deep link's address as a navigation, when it is a report's; null for any other
 * address (the caller navigates to it as it always did). Needs the same care as a tap: a link
 * that arrives while an overlay is open replaces it.
 */
export function reportDeepLink(
  address: string,
  here: Pick<Location, 'pathname' | 'search' | 'hash' | 'state' | 'key'>,
): { to: string; options: NavigateOptions } | null {
  const path = address.split(/[?#]/, 1)[0] ?? '';
  const target = parseReportPath(path);
  if (!target) return null;
  // A push for one of the person's pumps may name the pump (`?outlet=12E`): it rides along so the
  // overlay can tell when it is not the pump signed in.
  const query = address.includes('?') ? (address.split('?')[1] ?? '').split('#')[0] ?? '' : '';
  const outlet = outletHintOf(query, null);
  const base = openReportOptions(here);
  return {
    to: reportPath(target.conversationId, target.messageId) + (outlet ? `?outlet=${encodeURIComponent(outlet)}` : ''),
    options: outlet ? { ...base, state: { ...(base.state as ReportRouteState | undefined), outletCode: outlet } } : base,
  };
}

/** What the caller knows about the report it opens. */
export interface OpenReportArgs extends ReportTarget {
  report?: TodayReport;
}

/**
 * Open a report: `open({ conversationId, messageId, report? })`. A second call for the report
 * already on show does nothing.
 */
export function useOpenReport(): (args: OpenReportArgs) => void {
  const navigate = useNavigate();
  const here = useRealLocation();
  const hereRef = React.useRef(here);
  hereRef.current = here;
  return React.useCallback(
    (args: OpenReportArgs) => {
      const at = hereRef.current;
      const open = parseReportPath(at.pathname);
      if (open && open.conversationId === args.conversationId && open.messageId === args.messageId) return;
      navigate(reportPath(args.conversationId, args.messageId), openReportOptions(at, args.report, args.messageId));
    },
    [navigate],
  );
}

/**
 * What Close (and the ← of a report) does: back to the screen the dealer came from, when they came
 * from somewhere inside the app, and to `fallback` (Today) when they did not, replacing the entry.
 *
 * It is `useGoBack`'s rule, read from the REAL location. A report's address is a cold start (a push
 * that opened the app, a pasted link) exactly when nothing earlier is in the app's own history, and
 * a pop would then leave the app. `useGoBack` itself cannot be used here: inside the routes it
 * sees the screen drawn under the overlay, whose key is not the overlay's entry's.
 *
 * React Router's position in this app's history (`history.state.idx`) decides when it is there; the
 * entry's key only when it is not (an entry some sheet pushed carries no index).
 */
export function useCloseReport(fallback: string): () => void {
  const navigate = useNavigate();
  const here = useRealLocation();
  const keyed = here.key !== 'default';
  return React.useCallback(() => {
    const state = window.history.state as { idx?: unknown } | null;
    const hasEarlierEntry = typeof state?.idx === 'number' ? state.idx > 0 : keyed;
    if (hasEarlierEntry) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [keyed, navigate, fallback]);
}
