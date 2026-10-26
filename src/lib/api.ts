import {
  PASSWORD_CHANGE_REQUIRED,
  clearAuth,
  getAuthToken,
  requirePasswordChange,
  useAuthStore,
} from '@/store/auth';
import type { ApiError as ApiErrorEnvelope, ApiResponse } from '@dk/shared/types';


const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:4000/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Abort a stalled GET after this long so react-query can retry instead of the
 * UI hanging for minutes on a 2G link. Mutations are deliberately NOT timed out
 * (a write may have already landed server-side) — except the few payment writes
 * listed below, which the server answers the same way when asked twice. */
const GET_TIMEOUT_MS = 20_000;

/**
 * The payment writes that are safe to cut off, and how long they get. Without
 * a limit, a stalled request on a weak forecourt link left "Opening payment…",
 * "Confirming your payment…" or "Stopping…" on the screen, with every button
 * off, until the browser gave up — minutes later.
 *
 * Only these are listed because only these are safe to abandon: the server
 * answers each one the same way if it is asked again (checkout hands back the
 * order of the same payment, verify and refresh re-read Razorpay, and stopping
 * autopay of one that is already off answers 200). A timed-out one therefore
 * throws the same retryable `TIMEOUT` a stalled GET does, and the screens
 * read the truth again rather than trust either answer. Every other write
 * stays untimed, for the reason given above.
 */
const PAYMENT_ACTION_TIMEOUT_MS = 30_000;
const PAYMENT_ACTION_PATH =
  /^\/v1\/payments\/me\/(?:autopay\/stop|[^/]+\/(?:checkout|verify|refresh))\/?$/;

/**
 * The invoice link is the one read that is allowed to be slow. When the PDF is
 * not stored yet the server draws it, and waits up to 45 seconds for the
 * invoice printer before it answers "busy". A 20 second limit cut the dealer
 * off first and told them to check their network; 60 seconds lets the server's
 * own answer arrive.
 */
const GST_DOCUMENT_TIMEOUT_MS = 60_000;
const GST_DOCUMENT_PATH = /^\/v1\/payments\/me\/[^/]+\/documents\/[^/]+\/?$/;

/** How long this request may take before it is cut off, or undefined for never. */
function timeoutFor(method: string, path: string): number | undefined {
  if (method === 'GET') {
    return GST_DOCUMENT_PATH.test(path) ? GST_DOCUMENT_TIMEOUT_MS : GET_TIMEOUT_MS;
  }
  if (method === 'POST' && PAYMENT_ACTION_PATH.test(path)) return PAYMENT_ACTION_TIMEOUT_MS;
  return undefined;
}

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  anonymous?: boolean;
  /**
   * Whether a 401 signs the member out (default true: it means the token is no
   * good). Off for the calls where a 401 is an ANSWER about a password that was
   * typed — signing in with the wrong one, or giving the wrong current password
   * on the change screen — which must show a message, not end the session and
   * leave a "signed in on another phone" note for the next sign-in screen.
   */
  signOutOn401?: boolean;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(
    path.startsWith('http')
      ? path
      : `${BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.append(k, String(v));
    }
  }
  return url.toString();
}

export function getApiBaseUrl(): string {
  return BASE_URL;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    signal,
    anonymous = false,
    signOutOn401 = true,
  } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Bound GET reads (and the payment writes above) with a timeout. We use a
  // manual AbortController (not AbortSignal.timeout/any, which are unavailable
  // on older Android System WebView) and forward any caller-supplied signal
  // into it.
  let fetchSignal = signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutMs = timeoutFor(method, path);
  if (timeoutMs !== undefined) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    fetchSignal = controller.signal;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: fetchSignal,
    });
  } catch (err) {
    // A timeout surfaces as a retryable error so react-query's retry kicks in.
    if (timedOut) {
      throw new ApiError(0, 'TIMEOUT', 'Request timed out');
    }
    // A caller-initiated cancellation (e.g. react-query aborting on unmount)
    // must propagate as-is, not be masked as a network failure.
    if (signal?.aborted) {
      throw err;
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network error',
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // THE ROLLING SESSION. Once a token is an hour old the server hands back a
  // fresh one on this header; storing it is what stops a dealer who uses the
  // app every day from ever meeting a login screen again. Best-effort by
  // design: a missing or unreadable header just means the current token is
  // still young, and the request itself already succeeded.
  try {
    const refreshed = res.headers.get('X-Refreshed-Token');
    if (refreshed) useAuthStore.getState().setToken(refreshed);
  } catch {
    // A header a browser will not expose is not worth a failed request.
  }

  let payload: ApiResponse<T> | null = null;
  if (res.status !== 204) {
    try {
      payload = (await res.json()) as ApiResponse<T>;
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && signOutOn401) clearAuth();
    const envelope = payload as ApiErrorEnvelope | null;
    const code = envelope?.error?.code ?? `HTTP_${res.status}`;
    // A temporary password has to be replaced first: whatever was asked, the
    // answer is the same, and the app's answer is the new-password screen.
    if (res.status === 403 && code === PASSWORD_CHANGE_REQUIRED) requirePasswordChange();
    const message =
      envelope?.error?.message ?? res.statusText ?? 'Request failed';
    throw new ApiError(res.status, code, message, envelope?.error?.details);
  }

  if (!payload) return undefined as T;
  if (payload.ok) return payload.data;
  throw new ApiError(
    res.status,
    payload.error.code,
    payload.error.message,
    payload.error.details,
  );
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'POST', body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'PATCH', body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'PUT', body, signal }),
  del: <T>(path: string, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'DELETE', signal }),
};
