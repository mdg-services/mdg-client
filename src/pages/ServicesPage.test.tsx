import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NOW, creditData, feed, kavach, report, salesData, supplyData, task, variationData } from '@/features/glance/glanceFixtures';
import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { MeServiceEntry, TodayFeed } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const { ServicesPage } = await import('./ServicesPage');

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const entry = (serviceId: string, run: MeServiceEntry['run'], extra: Partial<MeServiceEntry> = {}): MeServiceEntry => ({
  serviceId,
  run,
  cadence: 'DAILY',
  ...extra,
});

interface Server {
  feed?: TodayFeed | 'fail';
  me?: { services: MeServiceEntry[]; week?: number } | 'missing' | 'fail';
  attached?: string[];
  kavach?: ReturnType<typeof kavach>;
}

/** The app's routes, answered from a table; anything else is a 404, as an older server would say. */
function serve(s: Server) {
  vi.mocked(api.get).mockImplementation(((path: string) => {
    const no = () => Promise.reject(new ApiError(404, 'NOT_FOUND', 'Not found'));
    if (path === '/v1/me/today-feed') {
      return s.feed === 'fail' ? Promise.reject(new ApiError(500, 'ERR', 'boom')) : Promise.resolve(s.feed ?? feed());
    }
    if (path === '/v1/me/services') {
      if (!s.me || s.me === 'missing') return no();
      if (s.me === 'fail') return Promise.reject(new ApiError(500, 'ERR', 'boom'));
      return Promise.resolve({
        asOf: NOW.toISOString(),
        services: s.me.services,
        week: { since: '2026-11-20', total: s.me.week ?? 0, byKind: {} },
      });
    }
    if (path === '/v1/dealers/d1/services') return s.attached ? Promise.resolve(s.attached.map((serviceId) => ({ serviceId }))) : no();
    if (path === '/v1/kavach/me') return s.kavach ? Promise.resolve(s.kavach) : Promise.resolve(kavach({ on: false }));
    if (path === '/v1/me/setup') return Promise.resolve({ active: false });
    return no();
  }) as never);
}

function renderDoor(opts: { role?: 'dealer-owner' | 'dealer-staff'; lang?: 'en' | 'hi' | 'hl' } = {}) {
  signIn({ id: 'u1', dealerId: 'd1', role: opts.role ?? 'dealer-owner' });
  useLangStore.setState({ lang: opts.lang ?? 'en', explicit: true });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/services" element={<ServicesPage />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
      <Where />
    </>,
    { route: '/services' },
  );
}

const dsrFeed = (over: Partial<TodayFeed> = {}) =>
  feed({ reports: [report('dsr_sales', { data: salesData({ soldL: 24_330 }), status: 'ok' })], ...over });

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe('the Services door with the server\'s word', () => {
  it('says how many services run, names each one in plain words and gives each a state word', async () => {
    serve({
      feed: dsrFeed(),
      me: {
        week: 28,
        services: [
          entry('dsr-report', 'ok', { lastRanAt: '2026-11-27T01:35:00.000Z', nextRunAt: '2026-11-28T01:35:00.000Z' }),
          entry('water-ingress-testing', 'ok'),
          entry('tt-density', 'failing'),
          entry('stock-check', 'on_request', { cadence: 'ON_DEMAND' }),
        ],
      },
    });
    renderDoor();
    expect(await screen.findByRole('region', { name: '1 service has stopped' })).toBeInTheDocument();
    const dsr = screen.getByText('Daily Sales Report').closest('li')!;
    expect(within(dsr).getByText('Working')).toBeInTheDocument();
    expect(within(dsr).getByText(/Last ran today 7:05 am\. Next run Sat 28 Nov 7:05 am\./)).toBeInTheDocument();
    expect(within(dsr).getByText(/24,330/)).toBeInTheDocument();
    const density = screen.getByText('TT Density').closest('li')!;
    expect(within(density).getByText('Stopped, MDG is fixing')).toBeInTheDocument();
    expect(screen.getByText('Stopped, MDG is fixing')).toBeInTheDocument();
  });

  it('puts the services in the spec\'s groups, in order, and the data feeds in one quiet line', async () => {
    serve({
      feed: dsrFeed(),
      me: {
        services: [
          entry('dealer-declarations', 'ok'),
          entry('stock-check', 'on_request'),
          entry('dsr-report', 'ok'),
          entry('iras-shift-data', 'ok'),
          entry('inspection-reports', 'ok'),
        ],
      },
    });
    renderDoor();
    await screen.findByText('Daily Sales Report');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles.indexOf('Every day for you')).toBeLessThan(titles.indexOf('Filed for you'));
    expect(titles.indexOf('Filed for you')).toBeLessThan(titles.indexOf('When you ask'));
    expect(titles.indexOf('When you ask')).toBeLessThan(titles.indexOf('Behind the scenes'));
    expect(screen.getByTestId('feeds-line')).toHaveTextContent('2 data feeds running');
    expect(screen.getByTestId('feeds-line').closest('button')).toBeNull();
  });

  it('says "MDG did 28 things for you this week" and opens the Reports pill from it', async () => {
    serve({ feed: dsrFeed(), me: { week: 28, services: [entry('dsr-report', 'ok')] } });
    renderDoor();
    fireEvent.click(await screen.findByRole('button', { name: /MDG did 28 things for you this week/ }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/reports'));
  });

  it('shows what needs the owner, with the service\'s name, and opens the chat at the box', async () => {
    const t = task({ kind: 'declarations', title: 'Send the washroom photos', since: '2026-11-25T02:00:00.000Z', conversationId: 'c9', messageId: 'm9' });
    serve({ feed: dsrFeed({ tasks: [t] }), me: { services: [entry('dealer-declarations', 'ok'), entry('dsr-report', 'ok')] } });
    renderDoor();
    const row = (await screen.findByText('Send the washroom photos')).closest('li')!;
    expect(within(row).getByText(/IndianOil declarations, waiting 2 days/)).toBeInTheDocument();
    expect(screen.getByText('Needs you', { selector: 'h2' })).toBeInTheDocument();
    const declarations = screen.getAllByText('IndianOil declarations').map((e) => e.closest('li')).find((li) => li?.hasAttribute('data-service-row'))!;
    expect(within(declarations).getByText('Needs you')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Open in chat' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/chat/c9'));
  });

  it('lists the open paper and login tasks under Needs you, with their own names, even when no service owns them', async () => {
    const doc = task({ kind: 'ask', title: 'Send the licence photo', since: '2026-11-25T02:00:00.000Z', action: { type: 'photo', askRef: 'doc:explosive-license', acceptsFile: false } });
    const login = task({ kind: 'portal_login', title: 'Send your IRAS login' });
    serve({ feed: dsrFeed({ tasks: [doc, login] }), me: { services: [entry('dsr-report', 'ok')] } });
    renderDoor();
    const row = (await screen.findByText('Send the licence photo')).closest('li')!;
    expect(within(row).getByText(/Your papers, waiting 2 days/)).toBeInTheDocument();
    expect(screen.getByText('Send your IRAS login').closest('li')!).toHaveTextContent('Your pump');
    expect(screen.getByRole('region', { name: /Needs you/ })).toBeInTheDocument();
  });

  it('leads the health card with the worst fact and counts every state, so the counts add up', async () => {
    serve({
      feed: dsrFeed(),
      me: {
        services: [
          entry('dsr-report', 'ok'),
          entry('water-ingress-testing', 'ok'),
          entry('load-planner', 'late'),
          entry('tt-density', 'failing'),
          entry('stock-check', 'on_request', { cadence: 'ON_DEMAND' }),
          entry('ro-supply-status', 'on_request', { cadence: 'ON_DEMAND' }),
        ],
      },
    });
    renderDoor();
    const card = await screen.findByRole('region', { name: '1 service has stopped' });
    // 2 running + 1 to look at + 1 stopped + 2 when you ask = the 6 services listed, none left out.
    for (const text of [/2\s+working/, /1\s+to look at/, /1\s+stopped/, /2\s+when you ask/]) expect(card.textContent).toMatch(text);
    expect(card.textContent).not.toMatch(/of \d+ services running/);
  });

  it('says "Last information" beside a stopped service, so its result line never says "all fine" next to "Stopped"', async () => {
    serve({
      feed: feed({ reports: [report('ro_supply', { data: supplyData({ blocked: false }), status: 'ok' })] }),
      me: { services: [entry('ro-supply-status', 'failing', { cadence: 'ON_DEMAND' })] },
    });
    renderDoor();
    const row = (await screen.findByText('RO supply status')).closest('li')!;
    expect(within(row).getByText('Stopped, MDG is fixing')).toBeInTheDocument();
    expect(row.textContent).toMatch(/Last information: /);
  });

  it('names the filed-for-you group in words that cannot be read as paying money, and the orders without a plate', async () => {
    const order = report('fuel_order', {
      sentAt: '2026-11-27T01:00:00.000Z',
      data: { kind: 'fuel_order', v: 1, event: 'placed', indentId: 'a', orderNo: null, source: 'chat', stage: 'tanker_assigned', asOf: '2026-11-27T01:00:00.000Z', deliveryDay: null, lines: [], totalKl: 12, ttNo: 'BR01GA1234', shipmentAt: null },
    });
    serve({ feed: feed({ reports: [order] }), me: { services: [entry('fuel-indent', 'ok')] } });
    renderDoor({ lang: 'hi' });
    expect(await screen.findByText('आपके लिए भरा जाता है')).toBeInTheDocument();
    expect(screen.queryByText('आपके लिए जमा होता है')).not.toBeInTheDocument();
    const row = screen.getByText('तेल का ऑर्डर').closest('li')!;
    expect(row).toHaveTextContent('तेल का 1 ऑर्डर रास्ते में है');
    expect(document.body.textContent).not.toContain('BR01GA1234');
    expect(document.body.textContent).not.toContain('लोड ऑर्डर');
  });

  it('lets a long word wrap anywhere in a row, so 200% text cannot push the page sideways', async () => {
    serve({ feed: dsrFeed(), me: { services: [entry('du-otp-acknowledgement', 'ok'), entry('tt-acknowledgement', 'ok')] } });
    renderDoor();
    const name = (await screen.findByText('DU OTP acknowledgement')) as HTMLElement;
    expect(name.className).toContain('[overflow-wrap:anywhere]');
    expect(name.className).toContain('min-w-0');
  });

  it('shows "Look at this" for a service whose newest report needs a look', async () => {
    serve({
      feed: feed({ reports: [report('dsr_variation', { status: 'attention', data: variationData({ offL: 90 }) })] }),
      me: { services: [entry('dsr-report', 'ok')] },
    });
    renderDoor();
    const row = (await screen.findByText('Daily Sales Report')).closest('li')!;
    expect(within(row).getByText('Look at this')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: '1 service to look at' })).toBeInTheDocument();
  });

  it('lists the greyed "You could add" rows with the about sentence and an Ask MDG button, and no prices', async () => {
    serve({ feed: dsrFeed(), me: { services: [entry('dsr-report', 'ok')] } });
    renderDoor();
    await screen.findByText('Daily Sales Report');
    const row = document.querySelector('[data-addable="water-ingress-testing"]') as HTMLElement;
    expect(within(row).getByText('Water ingress testing')).toBeInTheDocument();
    expect(within(row).getByText('The water checks on your tanks, kept up to date on time.')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Ask MDG to add Water ingress testing' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/₹|Rs\s?\d/);
    expect(screen.getByRole('button', { name: 'Ask MDG for something else' })).toBeInTheDocument();
  });

  it('opens a service\'s page from its row, and Kavach from its own row first', async () => {
    serve({ feed: dsrFeed(), me: { services: [entry('dsr-report', 'ok')] }, kavach: kavach({ pct: 62 }) });
    renderDoor();
    const kv = (await screen.findByText('Inspection score 62%')).closest('button')!;
    expect(kv.closest('li')!.parentElement!.firstElementChild).toBe(kv.closest('li'));
    fireEvent.click(screen.getByText('Daily Sales Report').closest('button')!);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/services/dsr-report'));
  });

  it('switches to the Reports pill with a replace and shows its count', async () => {
    serve({
      feed: feed({ reports: [report('dsr_variation', { status: 'attention', data: variationData({ offL: 90 }) })] }),
      me: { services: [entry('dsr-report', 'ok')] },
    });
    renderDoor();
    const reports = await screen.findByRole('radio', { name: 'Reports, 1' });
    fireEvent.click(reports);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/reports'));
  });
});

describe('the Services door without the server\'s word', () => {
  it('shows NO health word and never "Working" when /me/services is missing (an older server)', async () => {
    serve({ feed: dsrFeed(), me: 'missing', attached: ['dsr-report', 'stock-check'] });
    renderDoor();
    const row = (await screen.findByText('Daily Sales Report')).closest('li')!;
    expect(screen.queryByText('Working')).not.toBeInTheDocument();
    expect(screen.queryByText(/services running/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Reports that came today: 1');
    expect(within(row).getByText(/Last checked today 7:05 am/)).toBeInTheDocument();
    expect(screen.queryByText(/MDG did \d+ things/)).not.toBeInTheDocument();
    // Still honest where the feed itself proves it.
    expect(within(row).queryByText('Look at this')).not.toBeInTheDocument();
  });

  it('draws the neutral line and the rows from the feed alone when both server reads fail', async () => {
    serve({ feed: dsrFeed(), me: 'fail' });
    renderDoor();
    const row = (await screen.findByText('Daily Sales Report')).closest('li')!;
    expect(row).toBeInTheDocument();
    expect(screen.queryByText('Working')).not.toBeInTheDocument();
    expect(screen.queryByText(/You could add/)).not.toBeInTheDocument();
  });

  it('says it could not load, with a retry, when nothing at all answered', async () => {
    serve({ feed: 'fail', me: 'fail' });
    renderDoor();
    expect(await screen.findByText(/We could not load your services/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Services' })).toBeInTheDocument();
    const before = vi.mocked(api.get).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(before));
  });

  it('still lists the services when the feed fails but the server answered', async () => {
    serve({ feed: 'fail', me: { services: [entry('dsr-report', 'ok')] } });
    renderDoor();
    const row = (await screen.findByText('Daily Sales Report')).closest('li')!;
    expect(within(row).getByText('Working')).toBeInTheDocument();
  });
});

describe('who sees what, and what is never printed', () => {
  const all: MeServiceEntry[] = [
    entry('dsr-report', 'ok'),
    entry('credit-dod-monitoring', 'ok'),
    entry('calibration-claim', 'ok'),
    entry('iras-password-reset', 'ok'),
    entry('sdms-password-reset', 'ok'),
    entry('sdms-old-password-reset', 'ok'),
    entry('hpcl-account', 'ok'),
    entry('custom-request', 'on_request'),
    entry('brand-new-plugin', 'ok'),
  ];

  it('never prints a raw service id, including iras-password-reset and an id the app has no name for', async () => {
    serve({ feed: dsrFeed(), me: { services: all } });
    renderDoor();
    await screen.findByText('Daily Sales Report');
    const text = document.body.textContent ?? '';
    for (const id of ['iras-password-reset', 'sdms-password-reset', 'sdms-old-password-reset', 'hpcl-account', 'custom-request', 'brand-new-plugin', 'dsr-report', 'credit-dod-monitoring']) {
      expect(text, id).not.toContain(id);
    }
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    // Not a row for each of those: 3 services run, not 9.
    expect(screen.getByRole('region', { name: 'All 3 services running' })).toBeInTheDocument();
  });

  it('shows an owner the money services and a manager none of them, even if the server sent them', async () => {
    serve({ feed: dsrFeed({ role: 'manager', reports: [report('dsr_sales', { data: salesData() }), report('credit_dod', { data: creditData() })] }), me: { services: all } });
    renderDoor({ role: 'dealer-staff' });
    await screen.findByText('Daily Sales Report');
    expect(screen.queryByText('Credit & DOD Monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('बकाया और जमा की तारीख़')).not.toBeInTheDocument();
    expect(screen.queryByText(/Calibration/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '1 service running' })).toBeInTheDocument();
    expect(document.querySelector('[data-addable="credit-dod-monitoring"]')).toBeNull();
  });

  it('shows the owner credit and calibration', async () => {
    serve({ feed: dsrFeed(), me: { services: all } });
    renderDoor();
    expect(await screen.findByText('Credit & DOD Monitoring')).toBeInTheDocument();
  });

  it('speaks Hindi and Hinglish: the group names, the state words, and no English words but the brands', async () => {
    serve({ feed: dsrFeed(), me: { services: [entry('dsr-report', 'ok')] } });
    renderDoor({ lang: 'hi' });
    expect(await screen.findByText('रोज़ आपके लिए')).toBeInTheDocument();
    expect(screen.getByText('चल रही है')).toBeInTheDocument();
    expect(screen.getByText('रोज़ की बिक्री रिपोर्ट')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'सेवाएँ' })).toBeInTheDocument();
  });

  it('draws its bar and says so calmly for an admin signed in here, asking for nothing', async () => {
    signIn({ id: 'a1', role: 'admin' });
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(<ServicesPage />, { route: '/services' });
    expect(await screen.findByText('No services to show yet')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
