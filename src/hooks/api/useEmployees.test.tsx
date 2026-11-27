import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import type * as StaffModule from '@/lib/staff';
import { renderHookWithProviders, resetStores } from '@/test/utils';

import {
  employeesQueryKey,
  useEmployeeLeave,
  useEmployees,
  useEmployeesBetween,
  windowBounds,
  type PointsWindow,
} from './useEmployees';

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

  it('windowBounds resolves last month as the whole of the month before', () => {
    expect(windowBounds('lastMonth')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
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

describe('useEmployeesBetween', () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
    resetStores();
  });

  it('reads any two days, sharing the roster route (the same days of last month)', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderHookWithProviders(() => useEmployeesBetween('d1', '2026-06-01', '2026-06-07', true), {
      withRouter: false,
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/v1/dealers/d1/employees', {
        from: '2026-06-01',
        to: '2026-06-07',
        includeInactive: 'true',
      }),
    );
  });

  it('waits when told to and when there is no dealer', () => {
    renderHookWithProviders(
      () => useEmployeesBetween('d1', '2026-06-01', '2026-06-07', false, false),
      {
        withRouter: false,
      },
    );
    renderHookWithProviders(() => useEmployeesBetween(undefined, '2026-06-01', '2026-06-07'), {
      withRouter: false,
    });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('keeps the old roster key shape for the three windows', () => {
    expect(employeesQueryKey('d1', '2026-06-01', '2026-06-30')).toEqual([
      'staff',
      'employees',
      'd1',
      '2026-06-01',
      '2026-06-30',
    ]);
  });
});

describe('useEmployeeLeave', () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
    resetStores();
  });

  it('reads every leave day of the window for the dealer', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderHookWithProviders(() => useEmployeeLeave('d1', '2026-06-24', '2026-07-07'), {
      withRouter: false,
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/v1/dealers/d1/employees/leave', {
        from: '2026-06-24',
        to: '2026-07-07',
      }),
    );
  });
});
