import { getAuthToken } from '@/store/auth';

import { buildUrl } from './api';
import { isNativeShell } from './nativeBridge';

/**
 * How fast the app really is on this phone, sent to our own server
 * (`POST /v1/perf`, kept 30 days) so the team can see what dealers wait for
 * instead of guessing from one phone on office wifi.
 *
 * What it measures: when the first screen appeared after opening, each screen
 * change (tap to drawn), each kind of call to our server (count, total, slowest,
 * slow and failed), any app file that took over 2 s, how often the app reloaded
 * itself for a new release, and how often the "still loading" note showed. With
 * it, the phone's own description: release, connection, memory, WebView.
 *
 * What it never sends: anything a dealer typed or was sent. Addresses lose their
 * ids first (`/chat/:id`), and API paths their query strings.
 *
 * Sent when the app goes to the background (the page hides, or the shell says
 * so), and every five minutes while there is something to send. A failed send
 * keeps the numbers for the next one; every list is capped, so nothing grows
 * without bound however long the app stays open.
 */

const SLOW_FILE_MS = 2_000;
const SLOW_CALL_MS = 3_000;
const FLUSH_EVERY_MS = 5 * 60_000;
const MAX_NAVS = 50;
const MAX_FILES = 30;
const MAX_CALLS = 40;
/** Set by `reloadForFreshCode` (lazyRoute.ts) just before it reloads. */
const RELOAD_KEY = 'dk:freshCodeReloadAt';
/** No time is sent above an hour (the server caps there too): a phone asleep
 * in the middle of a measure is not a screen that took a day. */
const MAX_MS = 3_600_000;
const cap = (ms: number) => Math.min(Math.max(0, Math.round(ms)), MAX_MS);

interface CallStat {
  path: string;
  n: number;
  totalMs: number;
  maxMs: number;
  slow: number;
  failed: number;
}

const pending = {
  boot: {} as { fcpMs?: number; lcpMs?: number; firstScreenMs?: number },
  bootSent: false,
  /** "Opening the app" is only counted for a member already signed in whose app
   * stayed on screen: a sign-in typed first, or a phone put down mid-load, would
   * be counted as waiting. Set by installPerfReport. */
  firstScreenCounts: false,
  navs: [] as { to: string; ms: number }[],
  calls: new Map<string, CallStat>(),
  files: [] as { name: string; ms: number; ttfbMs?: number }[],
  reloads: 0,
  slowNotes: 0,
};

const ID_SEGMENT = /^(?:[0-9a-f]{24}|[0-9a-f-]{32,36}|\d+|\d{4}-\d{2}-\d{2}|temp-.*)$/i;

/** `/chat/66f…/info?x=1` → `/chat/:id/info`. Ids are never sent. */
export function routePattern(path: string): string {
  const bare = path.split(/[?#]/)[0];
  return (
    bare
      .split('/')
      .map((s) => (ID_SEGMENT.test(s) ? ':id' : s))
      .join('/')
      .slice(0, 64) || '/'
  );
}

/** `/assets/ChatPage-B7XzQUOq.js` → `ChatPage.js`: the screen, not the release. */
export function fileLabel(url: string): string {
  const name = url.split('?')[0].split('/').pop() ?? url;
  return name.replace(/-[A-Za-z0-9_-]{8}(\.\w+)$/, '$1').slice(0, 80);
}

const nowMs = () => Math.round(performance.now());

/** A screen change, from the address changing to the new screen drawn. */
export function recordNavigation(path: string, ms: number): void {
  pending.navs.push({ to: routePattern(path), ms: cap(ms) });
  if (pending.navs.length > MAX_NAVS) pending.navs.shift();
}

/** One call to our server (api.ts). The report's own send is not counted. */
export function recordApiCall(method: string, path: string, ms: number, ok: boolean): void {
  if (path.startsWith('/v1/perf')) return;
  const key = `${method} ${routePattern(path)}`.slice(0, 80);
  let stat = pending.calls.get(key);
  if (!stat) {
    if (pending.calls.size >= MAX_CALLS) return;
    stat = { path: key, n: 0, totalMs: 0, maxMs: 0, slow: 0, failed: 0 };
    pending.calls.set(key, stat);
  }
  stat.n += 1;
  stat.totalMs += cap(ms);
  stat.maxMs = Math.max(stat.maxMs, cap(ms));
  if (ms > SLOW_CALL_MS) stat.slow += 1;
  if (!ok) stat.failed += 1;
}

/** The "still loading — Try again" note was shown. */
export function recordSlowNote(): void {
  pending.slowNotes += 1;
}

/** The first real screen (the chat list with its chats) is on show. Once per page. */
export function markFirstScreen(): void {
  if (pending.firstScreenCounts && pending.boot.firstScreenMs === undefined && !pending.bootSent) {
    pending.boot.firstScreenMs = cap(nowMs());
  }
}

function isEmpty(): boolean {
  return (
    !pending.navs.length &&
    !pending.calls.size &&
    !pending.files.length &&
    !pending.reloads &&
    !pending.slowNotes &&
    (pending.bootSent || pending.boot.firstScreenMs === undefined)
  );
}

type Taken = {
  boot?: typeof pending.boot;
  navs: typeof pending.navs;
  calls: typeof pending.calls;
  files: typeof pending.files;
  reloads: number;
  slowNotes: number;
};

/** Take what is waiting, leaving empty lists for whatever is measured meanwhile. */
function take(): Taken {
  const taken: Taken = {
    boot: pending.bootSent ? undefined : { ...pending.boot },
    navs: pending.navs,
    calls: pending.calls,
    files: pending.files,
    reloads: pending.reloads,
    slowNotes: pending.slowNotes,
  };
  pending.navs = [];
  pending.calls = new Map();
  pending.files = [];
  pending.reloads = 0;
  pending.slowNotes = 0;
  return taken;
}

/** A send that did not get through: its numbers go back in front of the new ones. */
function putBack(t: Taken): void {
  pending.navs = [...t.navs, ...pending.navs].slice(-MAX_NAVS);
  pending.files = [...t.files, ...pending.files].slice(-MAX_FILES);
  for (const [key, newer] of pending.calls) {
    const older = t.calls.get(key);
    if (!older) {
      if (t.calls.size < MAX_CALLS) t.calls.set(key, newer);
      continue;
    }
    older.n += newer.n;
    older.totalMs += newer.totalMs;
    older.maxMs = Math.max(older.maxMs, newer.maxMs);
    older.slow += newer.slow;
    older.failed += newer.failed;
  }
  pending.calls = t.calls;
  pending.reloads += t.reloads;
  pending.slowNotes += t.slowNotes;
}

/** What the next send would carry. Exported for the tests. */
export function buildReport(t: Taken = { ...pending, boot: pending.bootSent ? undefined : pending.boot }) {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    deviceMemory?: number;
  };
  const c = nav.connection;
  return {
    release: String(import.meta.env.VITE_RELEASE ?? '').slice(0, 64),
    inApp: isNativeShell(),
    ua: navigator.userAgent.slice(0, 300),
    conn: c
      ? { effectiveType: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, saveData: c.saveData }
      : undefined,
    device: { memoryGb: nav.deviceMemory, cores: navigator.hardwareConcurrency || undefined },
    boot: t.boot,
    navs: t.navs,
    api: [...t.calls.values()],
    files: t.files,
    events: { reloads: t.reloads, slowNotes: t.slowNotes },
  };
}

let sending = false;
/** Send what is waiting, if anything is and someone is signed in. Never throws. */
export async function flushPerfReport(): Promise<void> {
  const token = getAuthToken();
  if (sending || !token || isEmpty()) return;
  sending = true;
  const taken = take();
  let delivered = false;
  try {
    const res = await fetch(buildUrl('/v1/perf'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildReport(taken)),
      keepalive: true,
    });
    // A refusal other than "too many" would be refused again: drop that report
    // rather than resend it for ever. Anything else is tried again next time.
    delivered = res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408);
  } catch {
    // Kept for the next send.
  } finally {
    if (delivered) {
      if (taken.boot?.firstScreenMs !== undefined) pending.bootSent = true;
    } else {
      putBack(taken);
    }
    sending = false;
  }
}

let installed = false;
/** Start measuring and sending. Called once, from main.tsx. */
export function installPerfReport(): void {
  if (installed || typeof PerformanceObserver === 'undefined') return;
  installed = true;
  pending.firstScreenCounts = !!getAuthToken() && document.visibilityState === 'visible';

  try {
    const at = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
    if (at && Date.now() - at < 60_000) pending.reloads += 1;
  } catch {
    // No storage: the reload simply is not counted.
  }

  const observe = (type: string, fn: (e: PerformanceEntry) => void) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
    } catch {
      // An older WebView without this entry type.
    }
  };
  observe('paint', (e) => {
    if (e.name === 'first-contentful-paint') pending.boot.fcpMs = cap(e.startTime);
  });
  observe('largest-contentful-paint', (e) => {
    pending.boot.lcpMs = cap(e.startTime);
  });
  observe('resource', (e) => {
    const r = e as PerformanceResourceTiming;
    if (!r.name.includes('/assets/') || r.duration < SLOW_FILE_MS) return;
    pending.files.push({
      name: fileLabel(r.name),
      ms: cap(r.duration),
      ttfbMs: r.responseStart > 0 ? cap(r.responseStart - r.startTime) : undefined,
    });
    if (pending.files.length > MAX_FILES) pending.files.shift();
  });

  const flush = () => void flushPerfReport();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    pending.firstScreenCounts = false;
    flush();
  });
  window.addEventListener('pagehide', flush);
  // The shell's own word that the app went to the background.
  window.addEventListener('native-app-state', (e) => {
    if ((e as CustomEvent).detail === 'background') flush();
  });
  window.setInterval(flush, FLUSH_EVERY_MS);
}
