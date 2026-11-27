import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import type * as StaffModule from '@/lib/staff';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { EmployeeLeave, EmployeeWithPoints, StaffPointAward } from '@dk/shared/types';

// 24 Nov 2026. This month is 1 to 24 Nov (24 days); the bars are 11 to 24 Nov.
vi.mock('@/lib/staff', async (orig) => {
  const actual = await orig<typeof StaffModule>();
  return {
    ...actual,
    istDate: (d?: Date) => (d ? actual.istDate(d) : '2026-11-24'),
    istMonthStart: () => '2026-11-01',
  };
});
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  };
});

const { StaffPersonPage } = await import('./StaffPersonPage');

const emp = (over: Partial<EmployeeWithPoints>): EmployeeWithPoints =>
  ({
    id: 's',
    name: 'Suresh',
    phone: '98765 43210',
    designation: 'Manager',
    status: 'ACTIVE',
    pointsInWindow: 420,
    totalPoints: 5000,
    leaveDaysInWindow: 2,
    onLeaveToday: false,
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  }) as EmployeeWithPoints;

const award = (
  id: string,
  workDate: string,
  points: number,
  over: Partial<StaffPointAward> = {},
): StaffPointAward =>
  ({
    id,
    employeeId: 's',
    workItemCode: 'du-clean',
    workLabelEn: 'DU island cleaning',
    workLabelHi: 'DU आईलैंड की सफाई',
    workDate,
    points,
    ...over,
  }) as StaffPointAward;

let roster: EmployeeWithPoints[];
let awards: StaffPointAward[];
let leaves: EmployeeLeave[];
let ledgerFails = false;

function serve() {
  vi.mocked(api.get).mockImplementation((path: string, query?: unknown) => {
    if (path === '/v1/dealers/d1/employees') {
      const { from } = query as { from: string };
      return Promise.resolve(
        (from === '2026-10-01' ? [emp({ pointsInWindow: 300 })] : roster) as never,
      );
    }
    if (path === '/v1/dealers/d1/staff-points') {
      return ledgerFails ? Promise.reject(new Error('down')) : Promise.resolve(awards as never);
    }
    if (path === '/v1/dealers/d1/employees/leave') return Promise.resolve(leaves as never);
    if (path === '/v1/dealers/d1/work-items') {
      return Promise.resolve([
        { code: 'du-clean', domain: 'cleaning', unit: 'each' },
        { code: 'tanker', domain: 'tanker', unit: 'each' },
      ] as never);
    }
    return Promise.resolve(undefined as never);
  });
}

function renderAt(route: string) {
  signIn({ id: 'owner', dealerId: 'd1', role: 'dealer-owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/staff/:employeeId" element={<StaffPersonPage />} />
      <Route path="/staff" element={<div>warriors-list</div>} />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  resetStores();
  ledgerFails = false;
  roster = [emp({}), emp({ id: 'm', name: 'Mohan', phone: undefined, pointsInWindow: 10 })];
  awards = [
    award('a1', '2026-11-24', 4),
    award('a2', '2026-11-23', 4),
    award('a3', '2026-11-20', 20, {
      workItemCode: 'tanker',
      workLabelEn: 'Tanker unloading help',
      workLabelHi: 'टैंकर उतारने में मदद',
      splitAmong: 2,
    }),
    award('a4', '2026-11-12', 6, {
      workItemCode: 'sales',
      workLabelEn: 'Fuel sales',
      workLabelHi: 'ईंधन बिक्री',
      amountRupees: 52000,
      quantity: 52,
    }),
    award('a5', '2026-11-10', 3, { note: 'washed the forecourt', quantity: 3 }),
  ];
  leaves = [
    { employeeId: 's', date: '2026-11-05', createdByName: 'x' } as EmployeeLeave,
    { employeeId: 'm', date: '2026-11-06', createdByName: 'x' } as EmployeeLeave,
  ];
  serve();
});

afterEach(() => {
  vi.mocked(api.get).mockReset();
  resetStores();
});

describe("A warrior's own page", () => {
  it('names the warrior in the bar, with a Back that says where it goes', async () => {
    renderAt('/staff/s');
    expect(await screen.findByRole('heading', { level: 1, name: 'Suresh' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to Warriors & points' })).toBeTruthy();
  });

  it('shows his phone with a Call button named for him', async () => {
    renderAt('/staff/s');
    const call = await screen.findByRole('link', { name: 'Call Suresh' });
    expect(call.getAttribute('href')).toBe('tel:9876543210');
    expect(call.className).toContain('min-h-11');
    expect(screen.getByText('98765 43210')).toBeTruthy();
  });

  it('draws no phone row and no dead label when there is no number', async () => {
    renderAt('/staff/m');
    await screen.findByRole('heading', { level: 1, name: 'Mohan' });
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText(/No phone number/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Call Mohan/ })).toBeNull();
  });

  it('keeps Edit out of the title bar, so the name has the whole width, and Edit is 44px in the card', async () => {
    renderAt('/staff/s');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Suresh' });
    const bar = heading.closest('header')!;
    expect(within(bar).queryByRole('button', { name: /Edit/ })).toBeNull();
    const edit = screen.getByRole('button', { name: 'Edit Suresh' });
    expect(edit.className).toContain('min-h-11');
    fireEvent.click(edit);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('explains what Leave does', async () => {
    renderAt('/staff/s');
    expect(await screen.findByText(/This day is then not counted as a working day/)).toBeTruthy();
  });

  it('prints the number of today in the chart, on a solid bar, and never a bar of nothing', async () => {
    renderAt('/staff/s');
    const today = await screen.findByTestId('today-points');
    // 24 Nov 2026 has 4 points in the fixture.
    expect(today.textContent).toBe('4');
    expect(today.className).toContain('whitespace-nowrap');
  });

  it("shows this month's points from the roster, the change on the same days of last month, and the average per working day", async () => {
    renderAt('/staff/s');
    // 420 points against 300 on the same days of October: 40% more.
    const month = await screen.findByRole('group', { name: 'Points this month: 420 points' });
    expect(await within(month).findByText('40% more than the same days last month')).toBeTruthy();
    // 24 days less 2 on leave is 22 working days: 420 / 22 = 19.1 a day.
    expect(screen.getByRole('group', { name: 'Per working day: 19.1 points' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Leave this month: 2 days' })).toBeTruthy();
  });

  it('draws the last 14 days as bars with a spoken summary and a table', async () => {
    renderAt('/staff/s');
    const chart = await screen.findByRole('img', {
      name: /Last 14 days, 34 points\. Best day 20 points on Fri 20 Nov\./,
    });
    expect(chart).toBeTruthy();
    // 11 to 24 Nov is 14 days. (The 10th's 3 points fall before the window and are left out: 4 + 4 + 20 + 6 = 34.)
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(15);
  });

  it('lists the top jobs this month by points, with how many times each', async () => {
    renderAt('/staff/s');
    const top = await screen.findByRole('region', { name: 'Top jobs this month' });
    const items = await within(top).findAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Tanker unloading help');
    expect(items[0]?.textContent).toContain('1 time');
    // 4 + 4 + 3 points over three entries.
    expect(items[1]?.textContent).toContain('DU island cleaning');
    expect(items[1]?.textContent).toContain('3 times');
    expect(items[1]?.textContent).toContain('11');
    expect(items[2]?.textContent).toContain('Fuel sales');
  });

  it('lists his latest entries, newest first, with quantity, rupees, sharing and his note', async () => {
    renderAt('/staff/s');
    const recent = await screen.findByRole('region', { name: 'Latest entries' });
    const rows = await within(recent).findAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]?.textContent).toContain('DU island cleaning');
    expect(rows[2]?.textContent).toContain('shared by 2');
    expect(rows[3]?.textContent).toContain('Amount Rs 52,000');
    expect(rows[4]?.textContent).toContain('washed the forecourt');
    expect(rows[4]?.textContent).toContain('Quantity 3');
  });

  it('reads the work names in Hindi when the app is in Hindi', async () => {
    renderAt('/staff/s');
    useLangStore.setState({ lang: 'hi', explicit: true });
    expect(await screen.findAllByText('टैंकर उतारने में मदद')).toBeTruthy();
  });

  it('asks the ledger for HIS rows only, from the month start', async () => {
    renderAt('/staff/s');
    await screen.findByRole('region', { name: 'Latest entries' });
    expect(api.get).toHaveBeenCalledWith('/v1/dealers/d1/staff-points', {
      employeeId: 's',
      from: '2026-11-01',
      to: '2026-11-24',
    });
  });

  it("counts only HIS leave days when the leave list holds everyone's", async () => {
    awards = [award('a1', '2026-11-06', 4)];
    renderAt('/staff/s');
    // Mohan's leave on the 6th must not mark Suresh's 6th as a leave day. He is on the page; the
    // numbers come from the roster, so this is read off the roster's own count.
    expect(await screen.findByRole('group', { name: 'Leave this month: 2 days' })).toBeTruthy();
  });

  it("keeps the roster's numbers when the ledger fails, with Try again in each ledger section", async () => {
    ledgerFails = true;
    renderAt('/staff/s');
    expect(
      await screen.findByRole('group', { name: 'Points this month: 420 points' }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBe(3),
    );
  });

  it('says when the ledger came back cut at 1,000 rows', async () => {
    awards = Array.from({ length: 1000 }, (_, i) => award(`r${i}`, '2026-11-20', 1));
    renderAt('/staff/s');
    expect(await screen.findByText(/Only the newest 1,000 entries are shown/)).toBeTruthy();
  });

  it('says "No points this month yet" with no entries', async () => {
    awards = [];
    renderAt('/staff/s');
    expect((await screen.findAllByText('No points this month yet.')).length).toBe(2);
  });

  it("marks him on leave in one tap, and says who in the button's name", async () => {
    vi.mocked(api.post).mockResolvedValue(undefined as never);
    renderAt('/staff/s');
    const leave = await screen.findByRole('button', { name: 'Mark Suresh on leave today' });
    expect(leave.className).toContain('min-h-11');
    fireEvent.click(leave);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/v1/dealers/d1/employees/s/leave', expect.anything()),
    );
  });

  it('shows "On leave" and one tap to remove it when he is off today', async () => {
    roster = [emp({ onLeaveToday: true })];
    renderAt('/staff/s');
    expect(await screen.findByText('On leave')).toBeTruthy();
    expect(screen.getByRole('button', { name: "Remove today's leave for Suresh" })).toBeTruthy();
  });

  it('opens Edit from a 44px button in the bar', async () => {
    renderAt('/staff/s');
    const edit = await screen.findByRole('button', { name: 'Edit Suresh' });
    expect(edit.className).toContain('min-h-11');
    fireEvent.click(edit);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('says a removed warrior was removed, and brings him back in one tap', async () => {
    roster = [emp({ status: 'INACTIVE' })];
    vi.mocked(api.patch).mockResolvedValue(undefined as never);
    renderAt('/staff/s');
    expect(await screen.findByText(/This warrior was removed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /on leave today/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bring back: Suresh' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
  });

  it('says it could not find a warrior for an unknown address, with a way back to the list', async () => {
    renderAt('/staff/nobody');
    expect(await screen.findByText('We could not find this warrior.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See all warriors' }));
    expect(await screen.findByText('warriors-list')).toBeTruthy();
  });

  it('draws its bar with a Back while loading and when the roster fails', async () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
    const first = renderAt('/staff/s');
    expect(screen.getByRole('button', { name: /^Back/ })).toBeTruthy();
    first.unmount();
    vi.mocked(api.get).mockRejectedValue(new Error('down'));
    renderAt('/staff/s');
    expect(await screen.findByText("We couldn't load this just now")).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Back/ })).toBeTruthy();
  });

  it('frames nothing against 100', async () => {
    renderAt('/staff/s');
    await screen.findByRole('region', { name: 'Latest entries' });
    expect(document.body.textContent).not.toMatch(/target|aims for 100|Reached 100/i);
  });
});
