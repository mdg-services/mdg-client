import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import type * as StaffModule from '@/lib/staff';
import { useLangStore } from '@/store/lang';
import { useStaffDraftStore } from '@/store/staffDraft';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { EmployeeWithPoints, StaffPointBatch } from '@dk/shared/types';

// The clock: 24 Nov 2026 (a Tuesday). "This month" is 1 to 24 Nov; the same days last month are
// 1 to 24 Oct; last month is 1 to 31 Oct.
vi.mock('@/lib/staff', async (orig) => {
  const actual = await orig<typeof StaffModule>();
  return {
    ...actual,
    // "Now" is fixed; a date handed in is still read as it is.
    istDate: (d?: Date) => (d ? actual.istDate(d) : '2026-11-24'),
    istMonthStart: () => '2026-11-01',
  };
});
// Large text is switched per test: jsdom cannot measure a text scale.
const text = vi.hoisted(() => ({ large: false }));
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => text.large }));
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  };
});

const { StaffPage } = await import('./StaffPage');

const emp = (over: Partial<EmployeeWithPoints>): EmployeeWithPoints =>
  ({
    id: 'e',
    name: 'Ramesh',
    status: 'ACTIVE',
    pointsInWindow: 0,
    totalPoints: 0,
    leaveDaysInWindow: 0,
    onLeaveToday: false,
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  }) as EmployeeWithPoints;

const batch = (workDate: string, over: Partial<StaffPointBatch> = {}): StaffPointBatch =>
  ({
    id: `b-${workDate}`,
    batchId: `b-${workDate}`,
    workDate,
    totalPoints: 62,
    entryCount: 14,
    employeeCount: 3,
    awardedByName: 'Suresh',
    createdAt: `${workDate}T15:00:00.000Z`,
    ...over,
  }) as StaffPointBatch;

/** What each window of the roster call returns. */
let rosters: {
  today: EmployeeWithPoints[];
  month: EmployeeWithPoints[];
  sameDays: EmployeeWithPoints[];
  lastMonth: EmployeeWithPoints[];
};
let batches: StaffPointBatch[];

function serve() {
  vi.mocked(api.get).mockImplementation((path: string, query?: unknown) => {
    if (path === '/v1/dealers/d1/employees') {
      const { from, to } = query as { from: string; to: string };
      if (from === to) return Promise.resolve(rosters.today as never);
      if (from === '2026-11-01') return Promise.resolve(rosters.month as never);
      if (to === '2026-10-31') return Promise.resolve(rosters.lastMonth as never);
      return Promise.resolve(rosters.sameDays as never);
    }
    if (path === '/v1/dealers/d1/staff-points/batches') return Promise.resolve(batches as never);
    if (path === '/v1/dealers/d1/staff-points/draft') return Promise.resolve(null as never);
    if (path === '/v1/dealers/d1/work-items') return Promise.resolve([] as never);
    return Promise.resolve(undefined as never);
  });
}

function renderPage() {
  signIn({ id: 'owner', dealerId: 'd1', role: 'dealer-owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/staff" element={<StaffPage />} />
      <Route path="/staff/:employeeId" element={<div>person-page</div>} />
      <Route path="/pump" element={<div>pump-page</div>} />
    </Routes>,
    { route: '/staff' },
  );
}

/** A draft the phone holds and the server has not seen yet (dirty), so the empty server answer cannot wipe it. */
const slice = (entries: { employeeId: string; workItemCode: string }[]) => ({
  entries,
  workDate: '2026-11-24',
  note: '',
  dirty: true,
  serverLines: [],
  updatedAt: '2026-11-24T05:00:00.000Z',
});

const SURESH = { id: 's', name: 'Suresh', phone: '98765 43210', designation: 'Manager' };
const MOHAN = { id: 'm', name: 'Mohan' };
const ASHA = { id: 'a', name: 'Asha' };

beforeEach(() => {
  resetStores();
  useStaffDraftStore.setState({ byDealer: {}, sync: {} });
  rosters = {
    today: [emp({ ...SURESH }), emp({ ...MOHAN }), emp({ ...ASHA })],
    month: [
      emp({ ...SURESH, pointsInWindow: 900 }),
      emp({ ...MOHAN, pointsInWindow: 100, leaveDaysInWindow: 2 }),
      emp({ ...ASHA, pointsInWindow: 840 }),
    ],
    sameDays: [
      emp({ ...SURESH, pointsInWindow: 800 }),
      emp({ ...MOHAN, pointsInWindow: 200 }),
      emp({ ...ASHA, pointsInWindow: 700 }),
    ],
    lastMonth: [],
  };
  batches = [batch('2026-11-23'), batch('2026-11-21'), batch('2026-11-20')];
  serve();
});

afterEach(() => {
  vi.mocked(api.get).mockReset();
  resetStores();
  text.large = false;
});

describe('Warriors and points', () => {
  it('opens on the team strip: this month, the change on the same days last month, and who earned', async () => {
    renderPage();
    const strip = await screen.findByRole('group', {
      name: /This month the team has 1,840 points/,
    });
    expect(within(strip).getByText('1,840')).toBeTruthy();
    // 1,840 against 1,700 on the same days of October is 8% more.
    expect(within(strip).getByText('8% more than the same days last month')).toBeTruthy();
    expect(within(strip).getByText('3 of 3 warriors earned points')).toBeTruthy();
  });

  it('asks for the same days of last month, not the whole month', async () => {
    renderPage();
    await screen.findByRole('group', { name: /This month the team has/ });
    expect(api.get).toHaveBeenCalledWith(
      '/v1/dealers/d1/employees',
      expect.objectContaining({ from: '2026-10-01', to: '2026-10-24' }),
    );
  });

  it('draws no change line when the second call has not come', async () => {
    vi.mocked(api.get).mockImplementation((path: string, query?: unknown) => {
      const q = query as { from?: string; to?: string } | undefined;
      if (path === '/v1/dealers/d1/employees' && q?.to === '2026-10-24')
        return Promise.reject(new Error('down'));
      return serveOnce(path, query);
    });
    renderPage();
    await screen.findByRole('group', { name: /This month the team has 1,840 points/ });
    expect(screen.queryByText(/more than the same days last month/)).toBeNull();
  });

  it('keeps the 100-point legend exactly as it was (owner decision Q2)', async () => {
    renderPage();
    expect(await screen.findByText('Each warrior aims for 100 points')).toBeTruthy();
  });

  it('has Today, This month and Last month as a labelled switch, each at least 44px', async () => {
    renderPage();
    const group = await screen.findByRole('radiogroup', { name: 'Show points for' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Today',
      'This month',
      'Last month',
    ]);
    for (const r of radios) expect(r.className).toContain('min-h-11');
  });

  it('on Today with nothing sent, says so, and quotes what is waiting', async () => {
    useStaffDraftStore.setState({
      byDealer: {
        d1: slice([{ employeeId: 's', workItemCode: 'x' }]),
      } as never,
      sync: {},
    });
    renderPage();
    expect(await screen.findByText(/No points sent today\. Waiting to send:/)).toBeTruthy();
  });

  it("shows the real waiting-to-send number, with Send today's sheet inside the card", async () => {
    vi.mocked(api.get).mockImplementation((path: string, query?: unknown) => {
      if (path === '/v1/dealers/d1/work-items') {
        return Promise.resolve([
          {
            code: 'x',
            labelEn: 'DU cleaning',
            labelHi: 'DU सफाई',
            points: 31,
            distribution: 'EACH',
            unit: 'each',
            domain: 'cleaning',
          },
        ] as never);
      }
      return serveOnce(path, query);
    });
    useStaffDraftStore.setState({
      byDealer: {
        d1: slice([
          { employeeId: 's', workItemCode: 'x' },
          { employeeId: 'a', workItemCode: 'x' },
        ]),
      } as never,
      sync: {},
    });
    renderPage();
    const card = await screen.findByRole('region', { name: 'Waiting to send' });
    await waitFor(() =>
      expect(within(card).getByText('2 warriors, 62 points not sent yet')).toBeTruthy(),
    );
    expect(within(card).getByRole('button', { name: "Send today's sheet" })).toBeTruthy();
  });

  it('does not draw the waiting card when nothing is waiting', async () => {
    renderPage();
    await screen.findByRole('group', { name: /This month the team has/ });
    expect(screen.queryByRole('region', { name: 'Waiting to send' })).toBeNull();
  });

  it('on This month: rank, share of the team, change against last month, and who is behind', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'This month' }));
    // Suresh is first with 900 of 1,840 points: 49% of the team, 100 more than on the same days of October.
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Suresh has 49% of the team points' })).toBeTruthy(),
    );
    expect(screen.getAllByText('100 more than the same days last month').length).toBeGreaterThan(0);
    // Mohan: 100 points in 22 working days = 4.5 a day against a team 1,840 / 70 = 26.3 a day: 17%.
    expect(await screen.findByText('Behind: 17% of the team average per working day')).toBeTruthy();
  });

  it('never measures anyone against 100 in the behind line', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'This month' }));
    const line = await screen.findByText(/Behind: \d+% of the team average per working day/);
    expect(line.textContent).not.toMatch(/100 points|target/i);
  });

  it('says "tied" in words when two warriors share a place, and draws no rank when everyone is level', async () => {
    rosters.month = [
      emp({ ...SURESH, pointsInWindow: 500 }),
      emp({ ...MOHAN, pointsInWindow: 500 }),
      emp({ ...ASHA, pointsInWindow: 100 }),
    ];
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'This month' }));
    expect((await screen.findAllByText('Tied at number 1')).length).toBe(2);
    expect(screen.queryByText('Tied at number 3')).toBeNull();
  });

  it('draws no rank and no tie line when every warrior has the same points', async () => {
    rosters.month = [
      emp({ ...SURESH, pointsInWindow: 300 }),
      emp({ ...MOHAN, pointsInWindow: 300 }),
      emp({ ...ASHA, pointsInWindow: 300 }),
    ];
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'This month' }));
    await screen.findByRole('group', { name: 'Suresh has 33% of the team points' });
    expect(screen.queryByText(/Tied at number/)).toBeNull();
  });

  it("says a warrior's role in Hindi when the reader reads Hindi, and as typed when it is not a known word", async () => {
    rosters.today = [
      emp({ ...SURESH, designation: 'Attendant' }),
      emp({ ...MOHAN, designation: 'Tanker incharge' }),
    ];
    renderPage();
    useLangStore.setState({ lang: 'hi', explicit: true });
    expect(await screen.findByText('अटेंडेंट')).toBeTruthy();
    expect(screen.queryByText('Attendant')).toBeNull();
    expect(screen.getByText('Tanker incharge')).toBeTruthy();
  });

  it('at large text: the switch stacks, the row is two lines with the name on its own, and Give points is not pinned', async () => {
    text.large = true;
    renderPage();
    const group = await screen.findByRole('radiogroup', { name: 'Show points for' });
    expect(group.className).toContain('flex-col');
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r.className).toContain('break-normal');
    // The name is its own line; there is no avatar squeezing it.
    fireEvent.click(radios[1]!);
    const row = await screen.findByRole('button', { name: /^1\. Suresh/ });
    expect(row.className).toContain('flex-col');
    expect(row.textContent).toContain('1. Suresh');
    // The primary action is on the page, once, and not in a pinned bar.
    const give = screen.getAllByRole('button', { name: 'Give points' });
    expect(give).toHaveLength(1);
    expect(give[0]!.closest('.sticky')).toBeNull();
  });

  it('pins Give points at normal text', async () => {
    renderPage();
    const give = await screen.findByRole('button', { name: 'Give points' });
    expect(give.closest('.sticky')).not.toBeNull();
  });

  it('turns "How points are worked out" into a row with an arrow at least 44px tall', async () => {
    renderPage();
    const how = await screen.findByRole('button', { name: 'How points are worked out' });
    expect(how.className).toContain('min-h-11');
    expect(how.querySelector('svg')).not.toBeNull();
    expect(how.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(how);
    expect(how.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Points count only after you send/)).toBeTruthy();
  });

  it("opens a warrior's own page when his name is tapped", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'This month' }));
    const row = await screen.findByRole('button', { name: /^Suresh/ });
    fireEvent.click(row);
    expect(await screen.findByText('person-page')).toBeTruthy();
  });

  it('puts a Call button on a warrior with a phone, named for him, and none on one without', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'This month' }));
    const call = await screen.findByRole('link', { name: 'Call Suresh' });
    expect(call.getAttribute('href')).toBe('tel:9876543210');
    expect(call.className).toContain('min-h-11');
    expect(screen.queryByRole('link', { name: 'Call Mohan' })).toBeNull();
  });

  it('marks leave in one tap, from the row, with a 44px button named for the warrior', async () => {
    vi.mocked(api.post).mockResolvedValue(undefined as never);
    renderPage();
    fireEvent.click(await screen.findByRole('radio', { name: 'This month' }));
    const leave = await screen.findByRole('button', { name: 'Mark Mohan on leave today' });
    expect(leave.className).toContain('min-h-11');
    fireEvent.click(leave);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/v1/dealers/d1/employees/m/leave', expect.anything()),
    );
  });

  it("removes today's leave in one tap when he is already off", async () => {
    rosters.today = [emp({ ...MOHAN, onLeaveToday: true }), emp({ ...ASHA })];
    rosters.month = rosters.today;
    vi.mocked(api.del).mockResolvedValue(undefined as never);
    renderPage();
    const off = await screen.findByRole('button', { name: "Remove today's leave for Mohan" });
    fireEvent.click(off);
    await waitFor(() =>
      expect(api.del).toHaveBeenCalledWith('/v1/dealers/d1/employees/m/leave/2026-11-24'),
    );
  });

  it('lists the sheets sent, and the day with none, in words', async () => {
    renderPage();
    const sheets = await screen.findByRole('region', { name: 'Sheets sent' });
    // 21 and 23 Nov have sheets, 22 Nov has none.
    await waitFor(() =>
      expect(within(sheets).getByText('No sheet was sent on Sun 22 Nov.')).toBeTruthy(),
    );
    expect(within(sheets).getAllByText('3 warriors, 62 points').length).toBe(3);
    expect(within(sheets).getAllByText(/Sent by Suresh/).length).toBe(3);
  });

  it('gives "Give points" a sticky 48px bar', async () => {
    renderPage();
    const give = await screen.findByRole('button', { name: /^Give points$/ });
    expect(give.className).toContain('min-h-12');
  });

  it('with no warriors, says "Add your first warrior" with a button', async () => {
    rosters = { today: [], month: [], sameDays: [], lastMonth: [] };
    renderPage();
    expect(await screen.findByText(/Add your first warrior/)).toBeTruthy();
  });

  it('shows Retry on a failed load', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText("We couldn't load this just now")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

/** The default server for a test that overrides one route. */
function serveOnce(path: string, query?: unknown): Promise<never> {
  if (path === '/v1/dealers/d1/employees') {
    const { from, to } = query as { from: string; to: string };
    if (from === to) return Promise.resolve(rosters.today as never);
    if (from === '2026-11-01') return Promise.resolve(rosters.month as never);
    if (to === '2026-10-31') return Promise.resolve(rosters.lastMonth as never);
    return Promise.resolve(rosters.sameDays as never);
  }
  if (path === '/v1/dealers/d1/staff-points/batches') return Promise.resolve(batches as never);
  if (path === '/v1/dealers/d1/staff-points/draft') return Promise.resolve(null as never);
  if (path === '/v1/dealers/d1/work-items') return Promise.resolve([] as never);
  return Promise.resolve(undefined as never);
}
