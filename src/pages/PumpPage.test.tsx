import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { enterNativeShell, leaveNativeShell, makePayment } from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

const { PumpPage } = await import('./PumpPage');

/** 12:00 India time on Fri 27 Nov 2026: every "days" below is counted from here. */
const NOW = new Date('2026-11-27T06:30:00.000Z');

const OUTLET = '/v1/me/outlet';
const ON_FILE = '/v1/asks/me/on-file';
const SERVICES = '/v1/me/services';
const LOGINS = '/v1/me/logins';
const PAYMENTS = '/v1/payments/me';
const TEAM = '/v1/dealers/d1/users';
const VIDEOS = '/v1/me/guide-videos';
const OUTLETS = '/v1/auth/outlets';

type Answer = unknown | Error | 'pending';

const field = (key: string, value: string, over: Record<string, unknown> = {}) => ({
  key,
  label: key,
  group: 'business',
  kind: 'text',
  value,
  maxLength: 100,
  dealerVisible: true,
  custom: false,
  ...over,
});

const svc = (serviceId: string, run = 'ok') => ({ serviceId, run, cadence: 'DAILY' });
const nineServices = () => ({
  asOf: '2026-11-27T05:00:00.000Z',
  services: ['dsr-report', 'credit-dod-monitoring', 'water-ingress', 'ro-supply', 'stock-check', 'load-planner', 'fuel-orders', 'mock-drill', 'du-otp'].map((id) => svc(id)),
  week: { since: '2026-11-20', total: 0, byKind: {} },
});

const login = (portal: string, name: string, status: 'saved' | 'missing' | 'refused' = 'saved') => ({
  portal,
  name,
  needed: true,
  status,
  history: [],
});

const member = (id: string, role: 'dealer-owner' | 'dealer-staff', over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  role,
  status: 'ACTIVE',
  dealerId: 'd1',
  lastLoginAt: '2026-11-26T05:00:00.000Z',
  ...over,
});

/** Everything the page can ask, answered the way a healthy server would. Tests change what they need. */
function healthy(): Record<string, Answer> {
  return {
    [OUTLET]: {
      fields: [
        field('pumpName', 'Sharma Fuels'),
        field('oilCompanyName', 'Indian Oil'),
        field('pumpSapCode', '1234567'),
        field('explosiveLicenceNo', 'E/1', { label: 'Explosive licence', expiresOn: '2026-12-06', expiryState: 'expiring' }),
        field('wmLicenceNo', 'W/1', { label: 'Weights and Measures licence', expiresOn: '2027-09-01', expiryState: 'valid' }),
      ],
    },
    [ON_FILE]: { rows: [], kinds: [], today: '2026-11-27' },
    [SERVICES]: nineServices(),
    [PAYMENTS]: { items: [makePayment({ status: 'due', dueDate: '2026-12-09' })] },
    [LOGINS]: { rows: [login('sdms', 'SDMS'), login('iras', 'IRAS')] },
    [TEAM]: [
      member('u1', 'dealer-owner'),
      member('m1', 'dealer-staff'),
      member('m2', 'dealer-staff', { lastLoginAt: undefined }),
    ],
    [VIDEOS]: [],
  };
}

function serve(answers: Record<string, Answer>) {
  vi.mocked(api.get).mockImplementation(((path: string) => {
    if (!(path in answers)) return Promise.reject(new ApiError(404, 'NOT_FOUND', `unexpected GET ${path}`));
    const a = answers[path];
    if (a === 'pending') return new Promise(() => undefined);
    return a instanceof Error ? Promise.reject(a) : Promise.resolve(a);
  }) as never);
}

const asked = () => vi.mocked(api.get).mock.calls.map(([path]) => path as string);

function renderPump(opts: { role?: 'dealer-owner' | 'dealer-staff'; lang?: 'en' | 'hi' | 'hl'; personId?: string } = {}) {
  signIn({
    id: opts.role === 'dealer-staff' ? 'm1' : 'u1',
    role: opts.role ?? 'dealer-owner',
    dealerId: 'd1',
    ...(opts.personId ? { personId: opts.personId } : {}),
  } as never);
  useLangStore.setState({ lang: opts.lang ?? 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<div>went:today</div>} />
      <Route path="/pump" element={<PumpPage />} />
      <Route path="/chat" element={<div>went:chat</div>} />
      {['/services', '/payments', '/settings/logins', '/pump/papers', '/settings/team', '/staff', '/settings/help', '/settings'].map((p) => (
        <Route key={p} path={p} element={<div>{`went:${p}`}</div>} />
      ))}
    </Routes>,
    { route: '/pump' },
  );
}

const row = (text: string | RegExp) => screen.getByText(text).closest('button')!;

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  leaveNativeShell();
  resetStores();
});

describe('My pump: who this pump is', () => {
  it('shows the name, the oil company and the SAP code, each looked up by its key', async () => {
    serve(healthy());
    renderPump();
    expect(await screen.findByText('Sharma Fuels')).toBeInTheDocument();
    expect(screen.getByText('Indian Oil')).toBeInTheDocument();
    expect(screen.getByText('SAP code 1234567')).toBeInTheDocument();
    expect(asked()).toContain(OUTLET);
  });

  it('draws only the lines the outlet file has: a missing key hides its line, nothing is invented', async () => {
    serve({ ...healthy(), [OUTLET]: { fields: [field('pumpName', 'Sharma Fuels')] } });
    renderPump();
    expect(await screen.findByText('Sharma Fuels')).toBeInTheDocument();
    expect(screen.queryByText(/SAP code/)).not.toBeInTheDocument();
    expect(screen.queryByText('Indian Oil')).not.toBeInTheDocument();
  });

  it('says "Your pump" when the file has no name at all', async () => {
    serve({ ...healthy(), [OUTLET]: { fields: [] } });
    renderPump();
    expect(await screen.findByRole('heading', { name: 'Your pump' })).toBeInTheDocument();
  });

  it('has no switch button and asks nothing about pumps for a person with one pump', async () => {
    serve(healthy());
    renderPump();
    await screen.findByText('Sharma Fuels');
    expect(screen.queryByRole('button', { name: 'Switch pump' })).not.toBeInTheDocument();
    expect(asked()).not.toContain(OUTLETS);
  });

  it('shows the code of the pump he is in and a Switch pump button when he has several', async () => {
    serve({
      ...healthy(),
      [OUTLETS]: {
        current: { userId: 'u1', dealerId: 'd1', code: '15E', role: 'dealer-owner' },
        outlets: [{ userId: 'u9', dealerId: 'd9', code: '22E', role: 'dealer-owner' }],
      },
    });
    renderPump({ personId: 'p1' });
    expect(await screen.findByText('Pump 15E')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Switch pump' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('My pump: how things stand, for the owner', () => {
  it('says each of the five in one sentence with a word beside its shape', async () => {
    serve(healthy());
    const { container } = renderPump();
    expect(await screen.findByText('9 services running')).toBeInTheDocument();
    expect(await screen.findByText('Bill due Wed 9 Dec, in 12 days')).toBeInTheDocument();
    expect(await screen.findByText('2 of 2 working')).toBeInTheDocument();
    expect(await screen.findByText('Explosive licence: 9 days left')).toBeInTheDocument();
    expect(await screen.findByText('2 managers, 1 not signed in yet')).toBeInTheDocument();
    // Every row carries a status word, never colour alone.
    const stand = screen.getByRole('region', { name: 'How things stand' });
    expect(stand.querySelectorAll('[data-status]').length).toBe(5);
    expect(within(stand).getByText('Needs a look')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/\btruncate\b|line-clamp|text-\[|min-h-\[|h-\[\d+px\]/);
  });

  it('names where each row leads, under its sentence', async () => {
    serve(healthy());
    renderPump();
    const stand = await screen.findByRole('region', { name: 'How things stand' });
    await screen.findByText('2 of 2 working');
    for (const place of ['Bill and plan', 'IDs and passwords', 'Papers and licences', 'Your team']) {
      expect(within(stand).getByText(place)).toBeInTheDocument();
    }
  });

  it('shows days only for the bill: never an amount, never a way to pay', async () => {
    serve(healthy());
    const { container } = renderPump();
    await screen.findByText('Bill due Wed 9 Dec, in 12 days');
    expect(container.textContent ?? '').not.toMatch(/₹|\bRs\b|4,999|\bpay\b|payment|razorpay|upi/i);
    expect(container.querySelector('a[href]')).toBeNull();
  });

  it('says a refused password in words, and what to do', async () => {
    serve({ ...healthy(), [LOGINS]: { rows: [login('sdms', 'SDMS'), login('iras', 'IRAS', 'refused')] } });
    renderPump();
    const text = await screen.findByText('IRAS password was refused. Tap to fix');
    expect(text.closest('[data-status]') ?? text.closest('div')?.querySelector('[data-status="problem"]')).not.toBeNull();
  });

  it('is "All valid" only when both lists of papers have answered and nothing ends soon', async () => {
    serve({
      ...healthy(),
      [OUTLET]: { fields: [field('pumpName', 'S'), field('wmLicenceNo', 'W/1', { expiresOn: '2027-09-01', expiryState: 'valid' })] },
    });
    renderPump();
    expect(await screen.findByText('All valid')).toBeInTheDocument();
  });

  it('opens the right page from each row', async () => {
    const cases: [string | RegExp, string][] = [
      ['9 services running', '/services'],
      ['Bill due Wed 9 Dec, in 12 days', '/payments'],
      ['2 of 2 working', '/settings/logins'],
      ['Explosive licence: 9 days left', '/pump/papers'],
      ['2 managers, 1 not signed in yet', '/settings/team'],
    ];
    for (const [text, path] of cases) {
      serve(healthy());
      renderPump();
      await screen.findByText(text);
      fireEvent.click(row(text));
      expect(await screen.findByText(`went:${path}`)).toBeInTheDocument();
      cleanup();
      resetStores();
    }
  });
});

// The worst comes first: an expired licence must not be the fourth thing read.
describe('My pump: the worst row first, and amber only where something has to be done', () => {
  const statusOrder = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-status]')).map((el) => el.getAttribute('data-status'));

  it('puts the red row (an expired licence) first, then amber, then information, then the fine ones', async () => {
    serve({
      ...healthy(),
      [OUTLET]: {
        fields: [
          field('pumpName', 'Sharma Fuels'),
          field('wmLicenceNo', 'W/1', { label: 'Weights and Measures licence', expiresOn: '2026-11-20', expiryState: 'expired' }),
        ],
      },
      [SERVICES]: { ...nineServices(), services: [svc('dsr-report', 'failing'), svc('stock-check')] },
      [PAYMENTS]: { items: [makePayment({ status: 'due', dueDate: '2026-11-30' })] },
    });
    renderPump();
    await screen.findByText('Weights and Measures licence has expired');
    await screen.findByText('2 of 2 working');
    await screen.findByText('1 service running, 1 service needs a look');
    const stand = screen.getByRole('region', { name: 'How things stand' });
    const order = statusOrder(stand);
    expect(order[0]).toBe('problem');
    // Never a calmer row above a worse one.
    const rank: Record<string, number> = { problem: 0, attention: 1, info: 2, ok: 3 };
    const ranks = order.map((o) => rank[o!]!);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // The first button of the card is the expired paper.
    expect(within(stand).getAllByRole('button')[0]).toHaveTextContent('Weights and Measures licence has expired');
  });

  it('keeps amber for a paper ending within two weeks; a paper ending in a month is information with its days', async () => {
    serve({
      ...healthy(),
      [OUTLET]: {
        fields: [
          field('pumpName', 'Sharma Fuels'),
          field('wmLicenceNo', 'W/1', { label: 'Weights and Measures licence', expiresOn: '2027-01-06', expiryState: 'expiring' }),
        ],
      },
    });
    renderPump();
    const text = await screen.findByText('Weights and Measures licence: 40 days left');
    expect(text.closest('button')?.querySelector('[data-status]')?.getAttribute('data-status')).toBe('info');
  });

  it('says WHICH logins are missing, by name, instead of a count', async () => {
    serve({ ...healthy(), [LOGINS]: { rows: [login('iras', 'IRAS', 'missing'), login('sdms', 'SDMS', 'missing')] } });
    renderPump();
    expect(await screen.findByText('IRAS and SDMS passwords are missing. Tap to add them')).toBeInTheDocument();
    cleanup();

    serve({ ...healthy(), [LOGINS]: { rows: [login('iras', 'IRAS', 'missing'), login('sdms', 'SDMS')] } });
    renderPump({ lang: 'hi' });
    expect(await screen.findByText('IRAS का पासवर्ड अभी नहीं डाला है। डालने के लिए दबाएँ')).toBeInTheDocument();
  });

  it('names the services that need a look under the sentence, instead of repeating "Services"', async () => {
    serve({
      ...healthy(),
      [SERVICES]: { ...nineServices(), services: [svc('dsr-report'), svc('stock-check', 'failing'), svc('water-ingress', 'late')] },
    });
    renderPump();
    const sentence = await screen.findByText('1 service running, 2 services need a look');
    const line = within(sentence.closest('button')!).getByText(/^Needs a look: /);
    expect(line.textContent).toMatch(/Stock check/i);
    expect(within(sentence.closest('button')!).queryByText('Services')).not.toBeInTheDocument();
  });

  it('says the bill\'s date and its days, never an amount', async () => {
    serve({ ...healthy(), [PAYMENTS]: { items: [makePayment({ status: 'due', dueDate: '2026-11-30' })] } });
    const { container } = renderPump();
    expect(await screen.findByText('Bill due Mon 30 Nov, in 3 days')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/₹|\bRs\b/);
  });

  it('counts a licence both lists carry once: the renewal MDG accepted replaces an expired date', async () => {
    serve({
      ...healthy(),
      [OUTLET]: {
        fields: [
          field('pumpName', 'Sharma Fuels'),
          field('wmLicenceNo', 'W/1', { label: 'Weights and Measures licence', expiresOn: '2026-11-20', expiryState: 'expired' }),
        ],
      },
      [ON_FILE]: {
        rows: [{ id: 'a1', kindCode: 'wm-licence', titleEn: 'W&M', titleHi: 'नाप-तौल', periodLabel: '2027', validUntil: '2027-11-20', validityState: 'valid' }],
        kinds: [],
        today: '2026-11-27',
      },
    });
    renderPump();
    expect(await screen.findByText('All valid')).toBeInTheDocument();
    expect(screen.queryByText(/has expired/)).not.toBeInTheDocument();
  });
});

describe('My pump: words a Hindi reader owns', () => {
  it('says the oil company in Hindi, through the label map, and in Hinglish in Latin letters', async () => {
    serve(healthy());
    renderPump({ lang: 'hi' });
    expect(await screen.findByText('इंडियन ऑयल')).toBeInTheDocument();
    expect(screen.queryByText('Indian Oil')).not.toBeInTheDocument();
    cleanup();

    serve({ ...healthy(), [OUTLET]: { fields: [field('pumpName', 'S'), field('oilCompanyName', 'BPCL')] } });
    renderPump({ lang: 'hi' });
    expect(await screen.findByText('भारत पेट्रोलियम')).toBeInTheDocument();
    cleanup();

    serve({ ...healthy(), [OUTLET]: { fields: [field('pumpName', 'S'), field('oilCompanyName', 'Some Local Oil')] } });
    renderPump({ lang: 'hi' });
    expect(await screen.findByText('Some Local Oil')).toBeInTheDocument();
  });
});

// PINNED (spec 4.5): each row asks for its own thing, draws its own skeleton, and fails alone.
describe('My pump: each row fails alone', () => {
  it('a slow bill leaves every other row on screen, with a skeleton where it will be', async () => {
    serve({ ...healthy(), [PAYMENTS]: 'pending' });
    renderPump();
    expect(await screen.findByText('9 services running')).toBeInTheDocument();
    expect(await screen.findByText('2 of 2 working')).toBeInTheDocument();
    expect(screen.queryByText(/Bill due/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('a failed papers call says so on its own row, with its own Try again, and hides nothing else', async () => {
    serve({ ...healthy(), [ON_FILE]: new ApiError(500, 'INTERNAL', 'boom') });
    renderPump();
    expect(await screen.findByText('9 services running')).toBeInTheDocument();
    expect(await screen.findByText('Bill due Wed 9 Dec, in 12 days')).toBeInTheDocument();
    const stand = screen.getByRole('region', { name: 'How things stand' });
    // It does not say "All valid" from half the papers.
    expect(within(stand).queryByText('All valid')).not.toBeInTheDocument();
    expect(await within(stand).findByText('Could not check this right now')).toBeInTheDocument();

    // Try again asks again, and the row then answers.
    serve(healthy());
    fireEvent.click(within(stand).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Explosive licence: 9 days left')).toBeInTheDocument();
  });

  it('a failed outlet file shows its error on the identity card and the rows below still draw', async () => {
    serve({ ...healthy(), [OUTLET]: new ApiError(500, 'INTERNAL', 'boom') });
    renderPump();
    expect(await screen.findByText('Your pump details did not load.')).toBeInTheDocument();
    expect(await screen.findByText('9 services running')).toBeInTheDocument();
    expect(await screen.findByText('2 of 2 working')).toBeInTheDocument();
  });

  it('a failed logins call and a failed team call each say so on their own row', async () => {
    serve({
      ...healthy(),
      [LOGINS]: new ApiError(500, 'INTERNAL', 'boom'),
      [TEAM]: new ApiError(500, 'INTERNAL', 'boom'),
    });
    renderPump();
    expect(await screen.findByText('9 services running')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Could not check this right now')).toHaveLength(2));
    expect(screen.getByText('Bill due Wed 9 Dec, in 12 days')).toBeInTheDocument();
  });

  it('an older server with no /me/services leaves that row out, and says nothing about it', async () => {
    serve({ ...healthy(), [SERVICES]: new ApiError(404, 'NOT_FOUND', 'no') });
    renderPump();
    expect(await screen.findByText('Bill due Wed 9 Dec, in 12 days')).toBeInTheDocument();
    await screen.findByText('2 of 2 working');
    expect(screen.queryByText(/services? running/)).not.toBeInTheDocument();
    expect(screen.queryByText('Could not check this right now')).not.toBeInTheDocument();
  });

  it('a team list that is not his to see (403) hides the team row quietly', async () => {
    serve({ ...healthy(), [TEAM]: new ApiError(403, 'FORBIDDEN', 'no') });
    renderPump();
    expect(await screen.findByText('9 services running')).toBeInTheDocument();
    await screen.findByText('2 of 2 working');
    await waitFor(() => expect(asked()).toContain(TEAM));
    expect(screen.queryByText(/not signed in yet/)).not.toBeInTheDocument();
  });
});

describe('My pump: a manager', () => {
  it('sees services, papers, warriors and help; never the bill, the logins or the team', async () => {
    serve(healthy());
    renderPump({ role: 'dealer-staff' });
    expect(await screen.findByText('8 services running')).toBeInTheDocument();
    expect(await screen.findByText('Explosive licence: 9 days left')).toBeInTheDocument();
    const stand = screen.getByRole('region', { name: 'How things stand' });
    expect(stand.querySelectorAll('[data-status]')).toHaveLength(2);
    expect(screen.queryByText(/Bill due/)).not.toBeInTheDocument();
    expect(screen.queryByText(/of 2 working/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not signed in yet/)).not.toBeInTheDocument();
    expect(screen.queryByText('Your team')).not.toBeInTheDocument();
    expect(screen.getByText('Warriors & points')).toBeInTheDocument();
    expect(screen.getByText('Help videos')).toBeInTheDocument();
  });

  it('never even asks the server for what is the owner\'s: bills, logins, team', async () => {
    serve(healthy());
    renderPump({ role: 'dealer-staff' });
    await screen.findByText('8 services running');
    await screen.findByText('Explosive licence: 9 days left');
    const paths = asked();
    expect(paths).not.toContain(PAYMENTS);
    expect(paths).not.toContain(LOGINS);
    expect(paths).not.toContain(TEAM);
  });

  it('does not count the owner-only services in what he is told is running', async () => {
    serve(healthy());
    renderPump({ role: 'dealer-staff' });
    // 9 services, one of them (Credit & DOD) is the owner's: a manager is told 8 even from an older server.
    expect(await screen.findByText('8 services running')).toBeInTheDocument();
  });
});

describe('My pump: the rest of the page', () => {
  it('has People (owner: team and warriors), Help, and one row to the phone settings', async () => {
    serve(healthy());
    renderPump();
    await screen.findByText('Sharma Fuels');
    const people = screen.getByRole('region', { name: 'People' });
    expect(within(people).getByText('Your team')).toBeInTheDocument();
    expect(within(people).getByText('Warriors & points')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Help' })).getByText('Help videos')).toBeInTheDocument();
    fireEvent.click(row('Language, password, log out'));
    expect(await screen.findByText('went:/settings')).toBeInTheDocument();
  });

  it.each([
    ['Warriors & points', '/staff'],
    ['Help videos', '/settings/help'],
    ['Your team', '/settings/team'],
  ])('%s opens %s', async (title, path) => {
    serve(healthy());
    renderPump();
    await screen.findByText('Sharma Fuels');
    fireEvent.click(screen.getAllByText(title).map((el) => el.closest('button')!).find(Boolean)!);
    expect(await screen.findByText(`went:${path}`)).toBeInTheDocument();
  });

  it('brings back "what is new" as a row in Help, only when the server gave him that video', async () => {
    serve(healthy());
    renderPump();
    await screen.findByText('Sharma Fuels');
    await waitFor(() => expect(asked()).toContain(VIDEOS));
    expect(screen.queryByText('Replay what is new')).not.toBeInTheDocument();
    cleanup();

    serve({
      ...healthy(),
      [VIDEOS]: [
        {
          id: 'whats_new_today',
          title: { hi: 'ऐप में नया क्या है', en: 'What is new in the app' },
          summary: { hi: '', en: '' },
          durationMs: 60_000,
          service: null,
          available: true,
        },
      ],
    });
    renderPump();
    expect(await screen.findByText('Replay what is new')).toBeInTheDocument();
  });

  it('is headed My pump, and a cold open\'s back arrow goes to Today', async () => {
    serve(healthy());
    renderPump();
    expect(screen.getByRole('heading', { name: 'My pump' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('went:today')).toBeInTheDocument();
  });

  it('keeps its bar and its name on screen while everything is still loading', () => {
    serve(Object.fromEntries(Object.keys(healthy()).map((k) => [k, 'pending'])));
    renderPump();
    expect(screen.getByRole('heading', { name: 'My pump' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('reads in Hindi, Hindi-first, and in Hinglish without Devanagari', async () => {
    serve(healthy());
    renderPump({ lang: 'hi' });
    expect(await screen.findByText('9 सेवाएँ चल रही हैं')).toBeInTheDocument();
    expect(screen.getByText('बिल की आखिरी तारीख बुध 9 दिसंबर, 12 दिन बाकी')).toBeInTheDocument();
    expect(screen.getByText('2 में से 2 चालू हैं')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'मेरा पंप' })).toBeInTheDocument();
    cleanup();

    serve(healthy());
    const { container } = renderPump({ lang: 'hl' });
    expect(await screen.findByText('9 services chal rahi hain')).toBeInTheDocument();
    expect(await screen.findByText('Bill ki aakhri taareekh Budhwar 9 Dec, 12 din baaki')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/[ऀ-ॿ]/);
  });
});

// The Play policy (ADR 0022, `shellNoPayPath.test.tsx`): inside the Android app a page may show what is
// due, read-only, and must offer no way to pay and no pointer to one. The bill line on My pump is days
// only, and the page is held to the same rules as the payment pages: every attribute, every word.
describe('My pump inside the Android app: no way to pay, no pointer to one', () => {
  it.each(['en', 'hi', 'hl'] as const)('draws the bill as days and nothing that points at paying (%s)', async (lang) => {
    enterNativeShell();
    serve(healthy());
    const { container } = renderPump({ lang });
    await screen.findByText(lang === 'en' ? 'Bill due Wed 9 Dec, in 12 days' : lang === 'hi' ? 'बिल की आखिरी तारीख बुध 9 दिसंबर, 12 दिन बाकी' : 'Bill ki aakhri taareekh Budhwar 9 Dec, 12 din baaki');
    await screen.findByText(lang === 'en' ? '2 of 2 working' : lang === 'hi' ? '2 में से 2 चालू हैं' : '2 mein se 2 chalu hain');

    expect(container.querySelector('a[href]')).toBeNull();
    const attributes = Array.from(container.querySelectorAll('*'))
      .flatMap((el) => Array.from(el.attributes).map((a) => `${el.tagName.toLowerCase()}@${a.name}=${a.value}`))
      .join('\n');
    expect(attributes).not.toMatch(/razorpay/i);
    expect(attributes).not.toMatch(/\/pay(ments)?\/[^\s"]*/i);
    const words = (container.textContent ?? '').toLowerCase();
    expect(words).not.toMatch(
      /razorpay|website|web site|browser|payment link|pay (online|here|at|on|via|using|through)|chrome|वेबसाइट|ब्राउज़र|लिंक/,
    );
    expect(words).not.toMatch(/₹|\brs\b/);
    expect(api.post).not.toHaveBeenCalled();
  });
});
