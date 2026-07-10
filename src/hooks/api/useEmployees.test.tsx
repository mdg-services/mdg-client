import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import type * as StaffModule from '@/lib/staff';
import { renderHookWithProviders, resetStores } from '@/test/utils';

import { employeesQueryKey, useEmployees, windowBounds, type PointsWindow } from './useEmployees';

vi.mock('@/lib/staff', async (orig) => {
  const actual = await orig<typeof StaffModule>();
  return { ...actual, istDate: () => '2026-07-07', istMonthStart: () => '2026-07-01' };
});
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

describe('useEmployees window helpers', () => {
  it('windowBounds resolves today vs month bounds', () => {
    expect(windowBounds('today')).toEqual({ from: '2026-07-07', to: '2026-07-07' });
    expect(windowBounds('month')).toEqual({ from: '2026-07-01', to: '2026-07-07' });
  });

  it('employeesQueryKey includes dealerId + from + to', () => {
    expect(employeesQueryKey('d1', '2026-07-01', '2026-07-07')).toEqual([
      'staff',
      'employees',
      'd1',
      '2026-07-01',
      '2026-07-07',
    ]);
  });
});

describe('useEmployees', () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
    resetStores();
  });

  it('is disabled and does not fetch without a dealerId', () => {
    const { result } = renderHookWithProviders(() => useEmployees(undefined), {
      withRouter: false,
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('fetches with the resolved from/to window params', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderHookWithProviders(() => useEmployees('d1', 'today'), { withRouter: false });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/v1/dealers/d1/employees', {
        from: '2026-07-07',
        to: '2026-07-07',
      }),
    );
  });

  it('keeps the previous window rows on screen while the new window loads', async () => {
    const rosterToday = [{ id: 'today' }];
    const rosterMonth = [{ id: 'month' }];
    let resolveMonth: () => void = () => {};
    vi.mocked(api.get).mockImplementation((_path, query) => {
      if ((query as { from: string }).from === '2026-07-07') {
        return Promise.resolve(rosterToday as never);
      }
      return new Promise((res) => {
        resolveMonth = () => res(rosterMonth as never);
      });
    });

    const { result, rerender } = renderHookWithProviders(
      ({ w }: { w: PointsWindow }) => useEmployees('d1', w),
      { withRouter: false, initialProps: { w: 'today' } },
    );
    await waitFor(() => expect(result.current.data).toBe(rosterToday));

    rerender({ w: 'month' }); // new key, fetch pending
    expect(result.current.data).toBe(rosterToday); // previous kept, not blanked

    resolveMonth();
    await waitFor(() => expect(result.current.data).toBe(rosterMonth));
  });
});
