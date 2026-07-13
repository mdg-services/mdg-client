import type * as SentryNS from '@sentry/browser';

import { isErrorLike } from './errors';

/**
 * Error reporting (Sentry).
 *
 * This exists because the failures that matter here are invisible from the
 * outside. A dealer says "the mic doesn't work" and we have no device, no console
 * and no way to reproduce their phone, their Android build, or whatever else was
 * holding the microphone at that moment. Guessing has already cost two rounds of
 * fixes that did not land.
 *
 * THE SDK IS ONLY DOWNLOADED WHEN SOMETHING GOES WRONG.
 *
 * Sentry's browser SDK is 106 kB gzipped even stripped to four integrations with
 * the tracing tree shaken out (measured; `Sentry.init()` with its defaults was
 * 119 kB). Against a 180 kB app that is a 60% increase, re-fetched on every
 * release, carried by dealers on 2G with metered data — to serve a session where,
 * almost always, nothing goes wrong at all.
 *
 * So nothing is fetched up front. `initMonitoring()` installs a few hundred bytes
 * of global listeners; the SDK itself is imported the first time an issue is
 * actually raised, and everything reported before it arrives is buffered and
 * flushed. Sessions that go fine pay nothing. The session that breaks pays 106 kB
 * in the background, after the fact, which is exactly when it is worth it.
 *
 * Two other rules:
 *
 *   - It must not leak. There is NO Session Replay: it records the DOM, and the DOM
 *     here is dealers' chat messages, their staff names, and photographs of their
 *     paperwork. No name, no email, no phone — a user is an opaque id. Query
 *     strings are stripped and console breadcrumbs dropped.
 *
 *   - It must be optional. With no VITE_SENTRY_DSN, none of this loads, every call
 *     is a no-op, and the build tree-shakes Sentry away entirely.
 */

type Sentry = typeof SentryNS;

type Level = 'fatal' | 'error' | 'warning' | 'info';

interface Issue {
  /** Short, stable, greppable. Becomes the Sentry issue title. */
  name: string;
  level?: Level;
  /** Indexed and filterable in Sentry. Keep the cardinality low. */
  tags?: Record<string, string | number | boolean | undefined>;
  /** Not indexed; the detail you read once an issue is open. */
  extra?: Record<string, unknown>;
  error?: unknown;
}

interface Crumb {
  message: string;
  data?: Record<string, unknown>;
}

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let sentry: Sentry | null = null;
let loading: Promise<void> | null = null;

/**
 * Raised before the SDK arrived. Bounded: a boot loop that throws on every frame
 * must not eat the phone's memory on its way to being reported.
 */
const pendingIssues: Issue[] = [];
const pendingCrumbs: Crumb[] = [];
const MAX_PENDING = 40;

let pendingUser: { id: string; role?: string; dealerId?: string } | null = null;

/*
 * Quota guard.
 *
 * The Sentry plan is the free one: 5,000 events a month for the whole product. A
 * single phone stuck in a render loop, or one dealer mashing a mic button that
 * always fails, can raise thousands of events in minutes and swallow the month's
 * budget — after which the reports we actually need are dropped on the floor by
 * Sentry, silently, and we are blind again precisely when something is wrong.
 *
 * So the client rations itself. A repeated fault is worth knowing about a few
 * times; the tenth copy tells us nothing the third did not.
 */
const SESSION_EVENT_CAP = 12;
const PER_ISSUE_CAP = 3;

let sentThisSession = 0;
const sentByIssue = new Map<string, number>();

/** Whether this event is within the session's ration. Counts it if so. */
function withinQuota(name: string): boolean {
  if (sentThisSession >= SESSION_EVENT_CAP) return false;
  const seen = sentByIssue.get(name) ?? 0;
  if (seen >= PER_ISSUE_CAP) return false;
  sentByIssue.set(name, seen + 1);
  sentThisSession += 1;
  return true;
}

/** Reporting is off entirely without a DSN. */
export function monitoringEnabled(): boolean {
  return Boolean(DSN);
}

/**
 * Fetch and start the SDK. Called on the first issue, never on page load.
 */
async function ensureSentry(): Promise<void> {
  if (!DSN || sentry) return;
  if (loading) return loading;

  loading = (async () => {
    let S: Sentry;
    try {
      S = await import('@sentry/browser');
    } catch {
      // Offline, or the chunk 404s after a redeploy. Reporting an error is not
      // worth causing one — drop what we buffered and carry on.
      pendingIssues.length = 0;
      pendingCrumbs.length = 0;
      return;
    }

    /*
     * Built by hand rather than with Sentry.init(), which drags in every default
     * integration whether it runs or not. Naming only what we need lets the rest
     * tree-shake. Keep this list short: every addition is paid for by someone on a
     * bad line.
     */
    const client = new S.BrowserClient({
      dsn: DSN,
      environment:
        (import.meta.env.VITE_SENTRY_ENV as string) || import.meta.env.MODE,
      release: (import.meta.env.VITE_RELEASE as string) || undefined,
      transport: S.makeFetchTransport,
      stackParser: S.defaultStackParser,

      // No IP address, no cookies, no request bodies.
      sendDefaultPii: false,

      integrations: [
        // The trail of taps and requests leading to a failure. `console: false`:
        // we log message text in development and it must never ship.
        S.breadcrumbsIntegration({
          console: false,
          dom: true,
          fetch: true,
          history: true,
          xhr: true,
        }),
        // Collapse a repeated fault, so one bad phone can't drain the quota.
        S.dedupeIntegration(),
        // Follow `cause` chains, so a wrapped error still shows its origin.
        S.linkedErrorsIntegration(),
      ],
      // Deliberately absent: globalHandlers (we install our own below, so the SDK
      // does not have to exist to catch a crash), Replay (records the DOM — i.e.
      // dealers' messages and paperwork) and performance tracing (a large slice of
      // the SDK that answers nothing we are asking).

      beforeBreadcrumb(crumb) {
        if (crumb.category === 'console') return null;
        return crumb;
      },

      beforeSend(event) {
        // A URL may carry a conversation id, which is fine, but never a query
        // string — that is where tokens and search terms end up.
        if (event.request?.url) {
          event.request.url = event.request.url.split('?')[0];
        }
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
        }
        return event;
      },
    });

    S.getCurrentScope().setClient(client);
    client.init();
    sentry = S;

    if (pendingUser) setMonitoringUser(pendingUser);
    const crumbs = pendingCrumbs.splice(0);
    const issues = pendingIssues.splice(0);
    for (const c of crumbs) addCrumb(c.message, c.data);
    // send(), not reportIssue(): these already passed the quota check on the way in,
    // and charging them twice would silently drop the ones we chose to keep.
    for (const i of issues) send(i);
  })();

  return loading;
}

/**
 * Catch what nobody reports — for a few hundred bytes, with no SDK on the wire.
 *
 * These listeners are the entire up-front cost of error reporting. They do not
 * import Sentry; they hand the error to `reportIssue`, which buffers it and pulls
 * the SDK down only because something has genuinely broken.
 */
export function initMonitoring(): void {
  if (!DSN) return;

  window.addEventListener('error', (e: ErrorEvent) => {
    // A failed <img>/<script> load also fires 'error' but carries no Error.
    if (!e.error) return;
    reportIssue({ name: 'uncaught', level: 'error', error: e.error });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    reportIssue({
      name: 'unhandled-rejection',
      level: 'error',
      error: isErrorLike(e.reason) ? e.reason : new Error(String(e.reason)),
    });
  });
}

/**
 * Identify the reporter — by opaque id only.
 *
 * Enough to answer the question that actually gets asked ("is this the dealer who
 * complained, and is it only them?") without sending a name, an email or a phone
 * number to a third party.
 */
export function setMonitoringUser(
  user: { id: string; role?: string; dealerId?: string } | null,
): void {
  if (!DSN) return;
  if (!sentry) {
    // Remembered, not reported: knowing who someone is does not warrant fetching
    // 106 kB. It is attached if and when something actually fails.
    pendingUser = user;
    return;
  }
  sentry.setUser(
    user ? { id: user.id, role: user.role, dealerId: user.dealerId } : null,
  );
}

/**
 * Note a step in a flow. Cheap: while the SDK is absent this only appends to an
 * array, so it is safe to sprinkle through a hot path.
 */
export function addCrumb(message: string, data?: Record<string, unknown>): void {
  if (!DSN) return;
  if (!sentry) {
    if (pendingCrumbs.length < MAX_PENDING) pendingCrumbs.push({ message, data });
    return;
  }
  sentry.addBreadcrumb({ category: 'app', level: 'info', message, data });
}

/**
 * Report something that went wrong — and, if this is the first thing to go wrong,
 * fetch the SDK to send it.
 *
 * Note the `level`, and that it is called explicitly. The failures we care about
 * here are HANDLED: a refused microphone is not a thrown exception, and nothing
 * would ever reach Sentry on its own. It has to be reported deliberately, or it
 * stays exactly as invisible as it has been.
 */
export function reportIssue(issue: Issue): void {
  if (!DSN) return;

  // Rationed BEFORE the SDK is fetched, so a crash loop can neither fill the buffer
  // nor — worse — trigger a 106 kB download on a phone that is already struggling.
  if (!withinQuota(issue.name)) return;

  if (!sentry) {
    if (pendingIssues.length < MAX_PENDING) pendingIssues.push(issue);
    void ensureSentry();
    return;
  }

  send(issue);
}

/** Hand an already-rationed issue to Sentry. */
function send(issue: Issue): void {
  const S = sentry;
  if (!S) return;

  const { name, level = 'error', tags, extra, error } = issue;

  S.withScope((scope) => {
    scope.setLevel(level);
    scope.setTag('issue', name);
    if (tags) {
      for (const [k, v] of Object.entries(tags)) {
        if (v !== undefined) scope.setTag(k, String(v));
      }
    }
    if (extra) scope.setContext('detail', extra);

    // isErrorLike, not `instanceof Error`: a DOMException is not an Error on older
    // WebViews, and capturing it as a bare message would throw away its name and
    // stack — the only two things worth having.
    if (isErrorLike(error)) {
      // Keep the real error as the exception so its stack survives, but group by
      // our own name too: "NotReadableError" alone says nothing about where it came
      // from, and two unrelated features can raise the same DOMException.
      scope.setTag('error.name', error.name);
      S.captureException(error, { fingerprint: [name, error.name] });
    } else {
      S.captureMessage(name, level);
    }
  });
}
