import type { ApiError as ApiErrorEnvelope, ApiResponse } from '@dk/shared/types';

import { clearAuth, getAuthToken } from '@/store/auth';

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

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  anonymous?: boolean;
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
  const { method = 'GET', body, query, signal, anonymous = false } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network error',
    );
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
    if (res.status === 401) clearAuth();
    const envelope = payload as ApiErrorEnvelope | null;
    const code = envelope?.error?.code ?? `HTTP_${res.status}`;
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
