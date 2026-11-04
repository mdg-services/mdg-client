import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EmbedModeModule from '@/lib/embedMode';
import type { User } from '@dk/shared/types';

// EVERY ACCESS TO STORAGE, RECORDED FROM THE FIRST LINE OF THE FILE. The sign-in
// store is created the moment it is imported, and its saved copy is read then — so a
// spy installed in a `beforeEach` would miss exactly the access that matters. This
// runs before any import below.
const touched = vi.hoisted(() => {
  const keys: string[] = [];
  const get = Storage.prototype.getItem;
  const set = Storage.prototype.setItem;
  const remove = Storage.prototype.removeItem;
  Storage.prototype.getItem = function (this: Storage, key: string) {
    keys.push(`get ${key}`);
    return get.call(this, key);
  };
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    keys.push(`set ${key}`);
    set.call(this, key, value);
  };
  Storage.prototype.removeItem = function (this: Storage, key: string) {
    keys.push(`remove ${key}`);
    remove.call(this, key);
  };
  return keys;
});

// The whole file runs as the extension's side panel.
vi.mock('@/lib/embedMode', async (orig) => ({
  ...(await orig<typeof EmbedModeModule>()),
  isEmbedded: () => true,
}));
// Only what the layout would show once signed in; the screens have their own tests.
vi.mock('@/AppShell', () => ({ AppShell: () => <div data-testid="shell" /> }));
vi.mock('@/pages/LoginPage', () => ({ LoginPage: () => <div>login-page</div> }));
vi.mock('@/pages/RegisterPage', () => ({ RegisterPage: () => <div>register-page</div> }));

// THE APP IS LOADED AFTER THE MOCK, NOT BEFORE. The test setup file has already imported
// the sign-in store (through the shared test helpers), as it is outside the panel, and
// that copy is cached. Dropping the cache and importing again makes the store start the
// way it does in the panel: the saved sign-in switched off.
vi.resetModules();
const { App } = await import('@/App');
const { apiFetch } = await import('@/lib/api');
const { SESSION_EXPIRED_KEY, useAuthStore } = await import('@/store/auth');
const { useLangStore } = await import('@/store/lang');
const { makeUser, renderWithProviders } = await import('@/test/utils');
const { openLeavingLinksInNewTab, startEmbedBridge } = await import('./embedBridge');
const { useEmbedStore } = await import('./embedState');

// What storage saw while the store above was being created (its saved copy is read then).
const touchedAtStartUp = [...touched];

const EXTENSION = 'chrome-extension://fdeceedgoipgpnkcodehalppchjndped';

/** A token-shaped string carrying the claims the store reads. Not signed. */
function token(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.signature`;
}

const first = token({ sub: 'u1', sid: 's1', iat: 1 });
const rolled = token({ sub: 'u1', sid: 's1', iat: 2 });
const otherSession = token({ sub: 'u1', sid: 's2', iat: 3 });

/** What the extension's page does: post its `auth` to the app's window. */
function fromExtension(data: unknown, origin: string = EXTENSION): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  });
}
const auth = (t: string) => ({ source: 'dk-ext', type: 'auth', token: t });

function makeParent() {
  return { postMessage: vi.fn() };
}

/** The server's answer to a call, as `fetch` gives it. */
function reply(status: number, data: unknown = {}, headers: Record<string, string> = {}) {
  const body = status === 401 ? { ok: false, error: { code: 'UNAUTHORIZED', message: 'no' } } : { ok: true, data };
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
}

const user: User = makeUser({ id: 'u1' });
let stop: (() => void) | null = null;

/** Start the bridge the way `main.tsx` does, with the profile call stubbed. */
function start(fetchUser: () => Promise<User> = () => Promise.resolve(user)) {
  const parent = makeParent();
  stop = startEmbedBridge({ parent, origins: [EXTENSION], fetchUser, readyRetryMs: 1000 });
  return parent;
}

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  useAuthStore.setState({ token: null, user: null });
  useEmbedStore.setState({ phase: 'waiting', retry: null });
  sessionStorage.clear();
  touched.length = 0;
});

afterEach(() => {
  // Inside `act`: stopping the bridge resets the status store, which a screen may be showing.
  act(() => {
    stop?.();
  });
  stop = null;
});

/** Whatever touched the saved sign-in's key, by name. */
const signInKeyAccesses = () => touched.filter((k) => k.endsWith('mdg.client.auth'));

describe('starting up inside the panel', () => {
  it('does not look at the saved sign-in when the sign-in store is created', () => {
    expect(touchedAtStartUp.filter((k) => k.endsWith('mdg.client.auth'))).toEqual([]);
  });

  it('says it is ready, and reads and writes no saved sign-in', async () => {
    const parent = start();
    expect(parent.postMessage).toHaveBeenCalledWith({ source: 'dk-app', type: 'ready' }, '*');

    fromExtension(auth(first));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    useAuthStore.getState().setUser({ ...user, name: 'Changed' });
    useAuthStore.getState().logout();

    expect(signInKeyAccesses()).toEqual([]);
    expect(Object.keys(localStorage)).not.toContain('mdg.client.auth');
    expect(Object.keys(localStorage)).not.toContain('mdg.client.signedInBefore');
  });

  it('marks the page so nothing can scroll sideways, and unmarks it when stopped', () => {
    start();
    expect(document.documentElement.getAttribute('data-embed')).toBe('extension');
    stop?.();
    stop = null;
    expect(document.documentElement.hasAttribute('data-embed')).toBe(false);
  });

  it('asks again until a sign-in comes, then stops asking', () => {
    vi.useFakeTimers();
    try {
      const parent = start();
      const readyCalls = () =>
        parent.postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === 'ready')
          .length;
      expect(readyCalls()).toBe(1);
      vi.advanceTimersByTime(3000);
      expect(readyCalls()).toBe(4);
      useAuthStore.setState({ token: first, user });
      vi.advanceTimersByTime(5000);
      expect(readyCalls()).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the panel's sign-in", () => {
  it('is believed only from an origin on the list', async () => {
    const fetchUser = vi.fn(() => Promise.resolve(user));
    start(fetchUser);
    fromExtension(auth(first), 'https://evil.example');
    fromExtension(auth(first), 'https://client.mdgservices.in');
    fromExtension(auth(first), 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await Promise.resolve();
    expect(fetchUser).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('is ignored when it is not an auth message with a token', async () => {
    const fetchUser = vi.fn(() => Promise.resolve(user));
    start(fetchUser);
    fromExtension(null);
    fromExtension('auth');
    fromExtension({ source: 'dk-app', type: 'auth', token: first });
    fromExtension({ source: 'dk-ext', type: 'something', token: first });
    fromExtension({ source: 'dk-ext', type: 'auth' });
    fromExtension({ source: 'dk-ext', type: 'auth', token: '' });
    fromExtension({ source: 'dk-ext', type: 'auth', token: 12345 });
    fromExtension({ source: 'dk-ext', type: 'auth', token: 'x'.repeat(5000) });
    await Promise.resolve();
    expect(fetchUser).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('loads the profile with the token and runs signed in, token in memory only', async () => {
    const fetchUser = vi.fn(() => Promise.resolve(user));
    start(fetchUser);
    fromExtension(auth(first));
    // The token is held at once; the app waits for the profile before drawing itself.
    expect(useAuthStore.getState().token).toBe(first);
    expect(useAuthStore.getState().user).toBeNull();
    await waitFor(() => expect(useAuthStore.getState().user).toEqual(user));
    expect(useAuthStore.getState().token).toBe(first);
    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(Object.keys(localStorage)).not.toContain('mdg.client.auth');
  });

  it('does not start over for the same token again, which every repeated ready brings', async () => {
    const fetchUser = vi.fn(() => Promise.resolve(user));
    start(fetchUser);
    fromExtension(auth(first));
    fromExtension(auth(first));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    fromExtension(auth(first));
    expect(fetchUser).toHaveBeenCalledTimes(1);
  });

  it('takes a different token the extension sends later (another sign-in)', async () => {
    const fetchUser = vi.fn(() => Promise.resolve(user));
    start(fetchUser);
    fromExtension(auth(first));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    fromExtension(auth(otherSession));
    await waitFor(() => expect(fetchUser).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    expect(useAuthStore.getState().token).toBe(otherSession);
  });

  it('shows "failed" when the profile cannot be loaded, keeps the token, and tries again on request', async () => {
    const fetchUser = vi
      .fn<() => Promise<User>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(user);
    start(fetchUser);
    fromExtension(auth(first));
    await waitFor(() => expect(useEmbedStore.getState().phase).toBe('failed'));
    expect(useAuthStore.getState().token).toBe(first);

    act(() => useEmbedStore.getState().retry?.());
    await waitFor(() => expect(useAuthStore.getState().user).toEqual(user));
    expect(fetchUser).toHaveBeenCalledTimes(2);
  });
});

describe('a refreshed token', () => {
  async function signedIn() {
    const parent = start();
    fromExtension(auth(first));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    parent.postMessage.mockClear();
    return parent;
  }

  it('is kept in memory and posted up to the extension, and to nobody else', async () => {
    const parent = await signedIn();
    vi.stubGlobal('fetch', vi.fn(() => reply(200, {}, { 'X-Refreshed-Token': rolled })));

    await apiFetch('/v1/conversations/mine');

    expect(useAuthStore.getState().token).toBe(rolled);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenCalledWith(
      { source: 'dk-app', type: 'token', token: rolled },
      EXTENSION,
    );
    expect(signInKeyAccesses()).toEqual([]);
  });

  it("is dropped, and not sent up, when it belongs to another sign-in", async () => {
    const parent = await signedIn();
    vi.stubGlobal('fetch', vi.fn(() => reply(200, {}, { 'X-Refreshed-Token': otherSession })));

    await apiFetch('/v1/conversations/mine');

    expect(useAuthStore.getState().token).toBe(first);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it('is sent up when a switch of pump brings a new sign-in', async () => {
    const parent = await signedIn();
    useAuthStore.getState().login({ token: otherSession, user });
    expect(parent.postMessage).toHaveBeenCalledWith(
      { source: 'dk-app', type: 'token', token: otherSession },
      EXTENSION,
    );
  });
});

describe('the sign-in ending', () => {
  it('tells the extension when the server answers 401, and leaves no note for a login screen', async () => {
    const parent = start();
    fromExtension(auth(first));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    parent.postMessage.mockClear();
    vi.stubGlobal('fetch', vi.fn(() => reply(401)));

    await expect(apiFetch('/v1/conversations/mine')).rejects.toMatchObject({ status: 401 });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useEmbedStore.getState().phase).toBe('signed-out');
    expect(parent.postMessage).toHaveBeenCalledWith({ source: 'dk-app', type: 'signed-out', reason: 'refused' }, EXTENSION);
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
    expect(signInKeyAccesses()).toEqual([]);
  });

  it('tells it too when the very first profile call is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(401)));
    // The default profile call: the real one, through the fetch client.
    const parent = makeParent();
    stop = startEmbedBridge({ parent, origins: [EXTENSION] });
    fromExtension(auth(first));
    await waitFor(() => expect(useEmbedStore.getState().phase).toBe('signed-out'));
    expect(useAuthStore.getState().token).toBeNull();
    expect(parent.postMessage).toHaveBeenCalledWith({ source: 'dk-app', type: 'signed-out', reason: 'refused' }, EXTENSION);
  });

  it('tells it when Log out is pressed in the app, as a Log out and not a refusal', async () => {
    const parent = start();
    fromExtension(auth(first));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    parent.postMessage.mockClear();
    useAuthStore.getState().logout();
    expect(parent.postMessage).toHaveBeenCalledWith({ source: 'dk-app', type: 'signed-out', reason: 'logout' }, EXTENSION);
  });

  it('says it once, however many calls were still on their way', async () => {
    const parent = start();
    fromExtension(auth(first));
    await waitFor(() => expect(useAuthStore.getState().user).not.toBeNull());
    parent.postMessage.mockClear();
    useAuthStore.getState().logout();
    useAuthStore.getState().logout();
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('the app in the panel', () => {
  it('opens the chat, not the sign-in screen, and says it is opening', async () => {
    start();
    renderWithProviders(<App />, { route: '/login' });
    expect(await screen.findByText('Opening your chat…')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
  });

  it('never shows the register screen either', async () => {
    start();
    renderWithProviders(<App />, { route: '/register' });
    expect(await screen.findByText('Opening your chat…')).toBeInTheDocument();
    expect(screen.queryByText('register-page')).not.toBeInTheDocument();
  });

  it('shows the app once the panel has signed it in', async () => {
    start();
    renderWithProviders(<App />, { route: '/chat' });
    expect(await screen.findByText('Opening your chat…')).toBeInTheDocument();
    fromExtension(auth(first));
    expect(await screen.findByTestId('shell')).toBeInTheDocument();
  });

  it('shows "Signed out" in place of the sign-in screen when the server ends the sign-in', async () => {
    start();
    renderWithProviders(<App />, { route: '/chat' });
    fromExtension(auth(first));
    expect(await screen.findByTestId('shell')).toBeInTheDocument();
    vi.stubGlobal('fetch', vi.fn(() => reply(401)));

    await act(async () => {
      await apiFetch('/v1/conversations/mine').catch(() => undefined);
    });

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });
});

describe('links that would leave the app', () => {
  let open: ReturnType<typeof vi.fn>;
  let remove: () => void;

  beforeEach(() => {
    open = vi.fn();
    vi.stubGlobal('open', open);
    remove = openLeavingLinksInNewTab();
  });
  afterEach(() => {
    remove();
    document.body.innerHTML = '';
  });

  /**
   * Click the link in `html` and say whether the page's own handling was cancelled by
   * the guard. A last listener on the window cancels it for real afterwards, so the
   * test browser does not try to navigate.
   */
  function click(html: string): boolean {
    document.body.innerHTML = html;
    const link = document.body.querySelector('a') as HTMLAnchorElement;
    let prevented = false;
    const last = (e: Event) => {
      prevented = e.defaultPrevented;
      e.preventDefault();
    };
    window.addEventListener('click', last);
    (link.firstElementChild ?? link).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    window.removeEventListener('click', last);
    return prevented;
  }

  it('open in a new tab, not in the panel', () => {
    expect(click('<a href="https://mdgservices.in/privacy"><span>Privacy</span></a>')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://mdgservices.in/privacy', '_blank', 'noopener');
  });

  it('leave alone a link inside the app, one that already opens elsewhere, a download and a phone link', () => {
    for (const html of [
      '<a href="/chat/abc">in app</a>',
      `<a href="${window.location.origin}/settings">in app</a>`,
      '<a href="https://example.com" target="_blank">elsewhere</a>',
      '<a href="https://example.com/a.pdf" download>file</a>',
      '<a href="tel:18008913496">call</a>',
      '<a href="mailto:a@b.test">mail</a>',
    ]) {
      expect(click(html)).toBe(false);
    }
    expect(open).not.toHaveBeenCalled();
  });

  it('is not taken over when the app has already handled the click', () => {
    document.body.innerHTML = '<a href="https://example.com">x</a>';
    const link = document.body.querySelector('a') as HTMLAnchorElement;
    link.addEventListener('click', (e) => e.preventDefault());
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(open).not.toHaveBeenCalled();
  });
});
