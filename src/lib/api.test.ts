import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, buildUrl } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
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

  it('wraps a network failure as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.get('/v1/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
