import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { renderHookWithProviders, resetStores, signIn } from '@/test/utils';

import { cleanMeServices, useAttachedServices, useMeServices } from './useMeServices';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});
afterEach(() => {
  resetStores();
});

describe('reading /v1/me/services', () => {
  it('reads what it understands and drops what it does not, so a newer or older server never breaks the door', () => {
    const read = cleanMeServices({
      asOf: '2026-11-27T04:10:00.000Z',
      services: [
        { serviceId: 'dsr-report', run: 'ok', cadence: 'DAILY' },
        { serviceId: 'x', run: 'exploded', cadence: 'DAILY' },
        { run: 'ok' },
        null,
      ],
      week: { since: '2026-11-20', total: 28, byKind: { dsr_sales: 7 } },
    });
    expect(read!.services.map((s) => s.serviceId)).toEqual(['dsr-report']);
    expect(read!.week!.total).toBe(28);
    expect(read!.asOf).toBe('2026-11-27T04:10:00.000Z');
  });

  it('works without a week or a time (an older shape)', () => {
    const read = cleanMeServices({ services: [] });
    expect(read).toEqual({ services: [] });
    expect(cleanMeServices({ services: [], week: { total: 'many' }, asOf: 'never' })).toEqual({
      services: [],
    });
  });

  it('is not an answer at all when it is not a list of services', () => {
    expect(cleanMeServices(null)).toBeNull();
    expect(cleanMeServices('<html>')).toBeNull();
    expect(cleanMeServices({ services: 'none' })).toBeNull();
  });

  it('fails once, and is not retried, when the route is missing (an older server)', async () => {
    signIn({ id: 'u1' });
    vi.mocked(api.get).mockImplementation((() =>
      Promise.reject(new ApiError(404, 'NOT_FOUND', 'Not found'))) as never);
    const { result } = renderHookWithProviders(() => useMeServices());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('asks nothing for an admin signed in here', () => {
    signIn({ id: 'a1', role: 'admin' });
    renderHookWithProviders(() => useMeServices());
    expect(api.get).not.toHaveBeenCalled();
  });

  it('asks the older route for the attached ids only when told to', async () => {
    signIn({ id: 'u1', dealerId: 'd1' });
    vi.mocked(api.get).mockResolvedValue([
      { serviceId: 'dsr-report' },
      { serviceId: 'stock-check' },
    ]);
    const off = renderHookWithProviders(() => useAttachedServices({ enabled: false }));
    expect(api.get).not.toHaveBeenCalled();
    off.unmount();
    const on = renderHookWithProviders(() => useAttachedServices({ enabled: true }));
    await waitFor(() => expect(on.result.current.data).toEqual(['dsr-report', 'stock-check']));
    expect(api.get).toHaveBeenCalledWith('/v1/dealers/d1/services');
  });
});
