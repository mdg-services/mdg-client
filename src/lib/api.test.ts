import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, apiFetch, buildUrl } from '@/lib/api';
import { SESSION_EXPIRED_KEY, useAuthStore } from '@/store/auth';
import { resetStores, signIn } from '@/test/utils';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
const ok = (data: unknown) => ({ ok: true, data });
const err = (code: string, message: string) => ({ ok: false, error: { code, message } });

/** A fetch mock that rejects with an AbortError as soon as its signal aborts. */
function abortableFetch() {
  return vi.fn(
    (_url: string, opts: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = opts.signal;
        if (signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );
}

describe('buildUrl', () => {
  it('appends defined query params and skips empty ones', () => {
    const url = buildUrl('/v1/x', { a: 1, b: undefined, c: '', d: 'y' });
    expect(url).toContain('a=1');
    expect(url).toContain('d=y');
    expect(url).not.toContain('b=');
    expect(url).not.toContain('c=');
  });
});

describe('apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetStores();
  });

  it('returns the data from a successful GET envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(ok({ id: 1 }))));
    await expect(api.get('/v1/thing')).resolves.toEqual({ id: 1 });
  });

  it('attaches an abort signal to a GET but NOT to a mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ok({ id: 1 })));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/v1/thing');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockClear();
    await api.post('/v1/thing', { a: 1 });
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
  });

  it('throws ApiError(0, TIMEOUT) when a GET stalls past the timeout', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', abortableFetch());
      const promise = api.get('/v1/slow');
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'TIMEOUT',
        status: 0,
      });
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  // The server waits up to 45 s for the invoice printer before it answers "busy";
  // the app must outlast that or it cuts the dealer off with "check your network".
  it('gives the invoice link 60 s, longer than the server’s 45 s wait', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', abortableFetch());
      const promise = api.get('/v1/payments/me/p1/documents/d1');
      let settled = false;
      const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
      void promise.catch(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(50_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps 20 s for the other payment reads', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', abortableFetch());
      const promise = api.get('/v1/payments/me/p1');
      const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT time out a mutation even past the GET-timeout window', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchMock = vi.fn((_url: string, opts: RequestInit) => {
        opts.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return Promise.resolve(jsonResponse(ok({ id: 1 })));
      });
      vi.stubGlobal('fetch', fetchMock);
      await api.post('/v1/write', { a: 1 });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // The pay, verify, refresh and stop-autopay writes: a stall must end in a
  // retryable error, not leave the screen waiting with every button off.
  it.each([
    '/v1/payments/me/p1/checkout',
    '/v1/payments/me/p1/verify',
    '/v1/payments/me/p1/refresh',
    '/v1/payments/me/autopay/stop',
  ])('throws ApiError(0, TIMEOUT) when POST %s stalls for 30 s', async (path) => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', abortableFetch());
      const promise = api.post(path, {});
      const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
      await vi.advanceTimersByTimeAsync(29_000);
      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a payment write that answers in time through, and clears its timer', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ok({ id: 'p1' })));
      vi.stubGlobal('fetch', fetchMock);
      await expect(api.post('/v1/payments/me/p1/verify', {})).resolves.toEqual({ id: 'p1' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still leaves every other POST untimed, even one that looks like a payment path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ok({ id: 1 })));
    vi.stubGlobal('fetch', fetchMock);
    for (const path of [
      '/v1/payments/me/p1/cancel',
      '/v1/admin/payments/p1/refund',
      '/v1/payments/me/p1/verify/extra',
    ]) {
      fetchMock.mockClear();
      await api.post(path, {});
      expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
    }
  });

  it('propagates a caller-abort as the original error, not TIMEOUT', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', abortableFetch());
    const promise = api.get('/v1/x', undefined, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts immediately when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', abortableFetch());
    await expect(api.get('/v1/x', undefined, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('surfaces an HTTP error envelope as ApiError with status + code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(err('BAD', 'nope'), 400)));
    await expect(api.get('/v1/x')).rejects.toMatchObject({ status: 400, code: 'BAD' });
  });

  it('clears auth on a 401', async () => {
    signIn();
    expect(useAuthStore.getState().token).not.toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(err('UNAUTHENTICATED', 'no'), 401)),
    );
    await expect(api.get('/v1/x')).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('a 401 the caller asked not to sign out on (a wrong password) leaves the session and says nothing about one', async () => {
    signIn();
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(err('UNAUTHENTICATED', 'wrong password'), 401)),
    );
    await expect(
      apiFetch('/v1/auth/change-password', { method: 'POST', body: {}, signOutOn401: false }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(useAuthStore.getState().token).not.toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });

  describe('a temporary password that has not been replaced', () => {
    it('a 403 PASSWORD_CHANGE_REQUIRED flags the member, which sends the app to the new-password screen', async () => {
      signIn({ mustChangePassword: false });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse(err('PASSWORD_CHANGE_REQUIRED', 'change it'), 403)),
      );
      await expect(api.get('/v1/conversations/mine')).rejects.toMatchObject({
        status: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
      expect(useAuthStore.getState().user?.mustChangePassword).toBe(true);
      // Still signed in: the one thing they may do is change it.
      expect(useAuthStore.getState().token).not.toBeNull();
    });

    it('any other 403 changes nothing', async () => {
      signIn({ mustChangePassword: false });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(err('FORBIDDEN', 'no'), 403)));
      await expect(api.get('/v1/x')).rejects.toMatchObject({ status: 403 });
      expect(useAuthStore.getState().user?.mustChangePassword).toBe(false);
    });

    it('does nothing for nobody signed in', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse(err('PASSWORD_CHANGE_REQUIRED', 'x'), 403)),
      );
      await expect(api.get('/v1/x')).rejects.toMatchObject({ status: 403 });
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  it('wraps a network failure as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.get('/v1/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
