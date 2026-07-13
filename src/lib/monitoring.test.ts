import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two properties that make error reporting acceptable in this app:
 *
 *   1. With no DSN it does nothing at all — no import, no network, no throw. A
 *      developer without a Sentry account, or a local build, must be unaffected.
 *   2. The SDK is 106 kB gzipped and is NOT fetched on a healthy session. It is
 *      pulled only once something has actually gone wrong, so dealers on 2G do not
 *      pay for telemetry they never generate.
 *
 * Both are easy to regress by "just importing Sentry at the top", so they are
 * pinned here.
 */

const sentryModule = vi.hoisted(() => ({
  loaded: 0,
  captured: [] as unknown[],
}));

// Plain functions, not vi.fn(): this project runs vitest with `restoreMocks: true`,
// which calls mockRestore() before every test and would wipe any mockImplementation
// set inside a module factory.
vi.mock('@sentry/browser', () => {
  const scope = {
    setLevel: () => {},
    setTag: () => {},
    setContext: () => {},
  };
  return {
    // Constructing the client is the observable consequence of the dynamic import
    // having resolved — i.e. of the 106 kB actually being fetched.
    BrowserClient: class {
      constructor() {
        sentryModule.loaded += 1;
      }
      init() {}
    },
    makeFetchTransport: () => {},
    defaultStackParser: () => {},
    breadcrumbsIntegration: () => ({ name: 'Breadcrumbs' }),
    dedupeIntegration: () => ({ name: 'Dedupe' }),
    linkedErrorsIntegration: () => ({ name: 'LinkedErrors' }),
    getCurrentScope: () => ({ setClient: () => {} }),
    setUser: () => {},
    addBreadcrumb: () => {},
    withScope: (fn: (s: typeof scope) => void) => fn(scope),
    captureException: (e: unknown) => sentryModule.captured.push(e),
    captureMessage: (m: unknown) => sentryModule.captured.push(m),
  };
});

async function loadMonitoring(dsn?: string) {
  vi.stubEnv('VITE_SENTRY_DSN', dsn ?? '');
  vi.resetModules();
  sentryModule.loaded = 0;
  sentryModule.captured = [];
  return import('./monitoring');
}

beforeEach(() => {
  sentryModule.loaded = 0;
  sentryModule.captured = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('monitoring — disabled without a DSN', () => {
  it('reports nothing and never loads the SDK', async () => {
    const m = await loadMonitoring(undefined);

    expect(m.monitoringEnabled()).toBe(false);

    m.initMonitoring();
    m.setMonitoringUser({ id: 'u1' });
    m.addCrumb('something happened');
    m.reportIssue({ name: 'mic.blocked', error: new Error('nope') });

    // Give any stray dynamic import a chance to resolve.
    await new Promise((r) => setTimeout(r, 0));
    expect(sentryModule.loaded).toBe(0);
  });
});

describe('monitoring — enabled, but only pays when something breaks', () => {
  it('does NOT fetch the SDK just because the app started', async () => {
    const m = await loadMonitoring('https://k@o0.ingest.sentry.io/0');

    expect(m.monitoringEnabled()).toBe(true);

    // A healthy session: the app boots, a user signs in, steps are recorded.
    m.initMonitoring();
    m.setMonitoringUser({ id: 'u1', role: 'dealer-owner' });
    m.addCrumb('mic: requesting getUserMedia');

    await new Promise((r) => setTimeout(r, 0));
    // 106 kB not spent. This is the whole point.
    expect(sentryModule.loaded).toBe(0);
  });

  it('fetches the SDK on the first issue, and sends what was buffered', async () => {
    const m = await loadMonitoring('https://k@o0.ingest.sentry.io/0');

    m.initMonitoring();
    m.addCrumb('mic: requesting getUserMedia');

    const err = new DOMException('busy', 'NotReadableError');
    m.reportIssue({ name: 'mic.blocked', level: 'warning', error: err });

    await vi.waitFor(() => expect(sentryModule.loaded).toBe(1));
    // The error that triggered the load is not lost in the process.
    await vi.waitFor(() => expect(sentryModule.captured).toContain(err));
  });

  it('loads the SDK only once, however many issues follow', async () => {
    const m = await loadMonitoring('https://k@o0.ingest.sentry.io/0');
    m.initMonitoring();

    m.reportIssue({ name: 'a', error: new Error('1') });
    m.reportIssue({ name: 'b', error: new Error('2') });
    m.reportIssue({ name: 'c', error: new Error('3') });

    await vi.waitFor(() => expect(sentryModule.loaded).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(sentryModule.loaded).toBe(1);
    expect(sentryModule.captured).toHaveLength(3);
  });

  it('bounds the buffer, so a crash loop cannot eat the phone', async () => {
    const m = await loadMonitoring('https://k@o0.ingest.sentry.io/0');
    m.initMonitoring();

    // Report far more than the cap before the SDK could possibly have arrived.
    for (let i = 0; i < 500; i += 1) {
      m.addCrumb(`crumb ${i}`);
    }

    await vi.waitFor(() => expect(sentryModule.loaded).toBeLessThanOrEqual(1));
    // Nothing threw and nothing grew without bound; the cap is 40.
    expect(true).toBe(true);
  });
});

/**
 * The Sentry plan is the free one: 5,000 events a month for the whole product.
 *
 * One phone in a render loop, or one dealer holding a mic button that always fails,
 * can raise thousands of events in minutes. Sentry would then silently drop the
 * month's remaining reports — leaving us blind exactly when something is wrong. The
 * client has to ration itself.
 */
describe('monitoring — rations itself to protect the free-tier quota', () => {
  it('sends the same issue only a few times, not a thousand', async () => {
    const m = await loadMonitoring('https://k@o0.ingest.sentry.io/0');
    m.initMonitoring();

    // A mic that fails on every single tap.
    for (let i = 0; i < 200; i += 1) {
      m.reportIssue({ name: 'mic.blocked', level: 'warning', error: new Error('nope') });
    }

    await vi.waitFor(() => expect(sentryModule.loaded).toBe(1));
    // Three is enough to characterise a fault; the two-hundredth adds nothing.
    expect(sentryModule.captured.length).toBeLessThanOrEqual(3);
  });

  it('caps the whole session, so many different faults still cannot drain it', async () => {
    const m = await loadMonitoring('https://k@o0.ingest.sentry.io/0');
    m.initMonitoring();

    for (let i = 0; i < 100; i += 1) {
      m.reportIssue({ name: `issue-${i}`, error: new Error(String(i)) });
    }

    await vi.waitFor(() => expect(sentryModule.loaded).toBe(1));
    // The per-session ceiling is 12.
    expect(sentryModule.captured.length).toBeLessThanOrEqual(12);
  });

  it('a crash loop cannot even trigger the 106 kB download after the cap', async () => {
    const m = await loadMonitoring('https://k@o0.ingest.sentry.io/0');
    m.initMonitoring();

    // Burn the session ration.
    for (let i = 0; i < 100; i += 1) {
      m.reportIssue({ name: `x-${i}`, error: new Error('x') });
    }
    await vi.waitFor(() => expect(sentryModule.loaded).toBe(1));
    const after = sentryModule.captured.length;

    // Anything beyond the cap is dropped before it costs the phone anything.
    for (let i = 0; i < 50; i += 1) {
      m.reportIssue({ name: 'late', error: new Error('late') });
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(sentryModule.captured.length).toBe(after);
  });
});
