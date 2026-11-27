import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NOW,
  creditData,
  declarationData,
  feed,
  paperData,
  planData,
  report,
  salesData,
  stockData,
  supplyData,
  task,
  variationData,
  waterData,
} from '@/features/glance/glanceFixtures';
import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { MeServiceEntry, ReportHistoryPage, TodayFeed, TodayReport } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const { ServicePage } = await import('./ServicePage');

/** What the PAGE printed: the harness's own location line is not the page. */
function pageText(): string {
  return Array.from(document.body.querySelectorAll('*'))
    .filter((e) => !e.closest('[data-testid="where"]'))
    .map((e) => (e.children.length === 0 ? (e.textContent ?? '') : ''))
    .join(' ');
}

function Where() {
  const l = useLocation();
  return (
    <p data-testid="where" data-state={JSON.stringify(l.state ?? null)}>
      {l.pathname}
    </p>
  );
}

const entry = (serviceId: string, run: MeServiceEntry['run'], extra: Partial<MeServiceEntry> = {}): MeServiceEntry => ({
  serviceId,
  run,
  cadence: 'DAILY',
  ...extra,
});

interface Server {
  feed?: TodayFeed | 'fail';
  me?: MeServiceEntry[] | 'missing';
  pages?: ReportHistoryPage[];
  historyFails?: boolean;
  complaints?: unknown;
  permits?: unknown;
  videos?: unknown[];
}

function serve(s: Server) {
  const pages = s.pages ?? [{ items: [] }];
  vi.mocked(api.get).mockImplementation(((path: string, query?: Record<string, unknown>) => {
    const no = () => Promise.reject(new ApiError(404, 'NOT_FOUND', 'Not found'));
    switch (path) {
      case '/v1/me/today-feed':
        return s.feed === 'fail' ? Promise.reject(new ApiError(500, 'ERR', 'boom')) : Promise.resolve(s.feed ?? feed());
      case '/v1/me/services':
        return !s.me || s.me === 'missing'
          ? no()
          : Promise.resolve({ asOf: NOW.toISOString(), services: s.me, week: { since: '', total: 0, byKind: {} } });
      case '/v1/me/reports': {
        if (s.historyFails) return Promise.reject(new ApiError(500, 'ERR', 'boom'));
        const at = query?.cursor ? Number(String(query.cursor).replace('c', '')) : 0;
        return Promise.resolve(pages[at] ?? { items: [] });
      }
      case '/v1/me/complaints':
        return Promise.resolve(s.complaints ?? { complaints: [] });
      case '/v1/me/work-permits':
        return Promise.resolve(s.permits ?? { permits: [] });
      case '/v1/me/guide-videos':
        return Promise.resolve(s.videos ?? []);
      case '/v1/kavach/me':
        return Promise.resolve({ on: false, summary: null, now: [], waiting: [], done: [], upcoming: [], events: [] });
      case '/v1/me/setup':
        return Promise.resolve({ active: false });
      default:
        return no();
    }
  }) as never);
}

function renderPage(id: string, opts: { role?: 'dealer-owner' | 'dealer-staff'; lang?: 'en' | 'hi' | 'hl' } = {}) {
  signIn({ id: 'u1', dealerId: 'd1', role: opts.role ?? 'dealer-owner' });
  useLangStore.setState({ lang: opts.lang ?? 'en', explicit: true });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/services" element={<p>the door</p>} />
        <Route path="/services/:serviceId" element={<ServicePage />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
      <Where />
    </>,
    { route: `/services/${id}` },
  );
}

const dsrReport = (day: string, over: Partial<TodayReport> = {}) =>
  report('dsr_variation', {
    day,
    sentAt: `${day}T20:00:00.000Z`,
    headline: `Sales ${day}`,
    data: {
      ...variationData(),
      businessDate: day,
      sheets: ['variation', 'sales'],
      products: [{ ...variationData().products[0]!, sales: salesData({ soldL: 24_330, lastWeek: 22_000 }).products[0]!.sales }],
    },
    conversationId: 'c1',
    ...over,
  });

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe('a service page: Template A, the daily report (Daily sales report)', () => {
  const day = '2026-11-26';
  const ok = () => {
    const r = dsrReport(day);
    serve({
      feed: feed({ reports: [r] }),
      me: [entry('dsr-report', 'ok', { lastRanAt: '2026-11-27T01:35:00.000Z', nextRunAt: '2026-11-28T01:35:00.000Z' })],
      pages: [{ items: [r] }],
    });
    return r;
  };

  it('has the name, the state, one sentence of what it does and when it last ran', async () => {
    ok();
    renderPage('dsr-report');
    expect(await screen.findByRole('heading', { level: 1, name: 'Daily Sales Report' })).toBeInTheDocument();
    expect(await screen.findByText('Working')).toBeInTheDocument();
    expect(screen.getByText("Your day's sales and tank stock, as two sheets every day.")).toBeInTheDocument();
    expect(screen.getByText('Last ran today 7:05 am. Next run Sat 28 Nov 7:05 am.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Services' })).toBeInTheDocument();
  });

  it('shows the sales hero, the change on last weekday, each fuel and the band with the room left', async () => {
    ok();
    renderPage('dsr-report');
    // The card is named for what it says, once ("Sold yesterday"), not "Right now" over a hero that says yesterday.
    const panel = (await screen.findByRole('region', { name: 'Sold yesterday' })) as HTMLElement;
    expect(screen.queryByRole('region', { name: 'Right now' })).not.toBeInTheDocument();
    expect(within(panel).getAllByText('24,330').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/11% more than last Thursday/).length).toBeGreaterThan(0);
    expect(within(panel).getByText('inside the limit')).toBeInTheDocument();
    expect(within(panel).getByText('Room left 310 L of 480 L allowed')).toBeInTheDocument();
    expect(within(panel).getByRole('img', { name: /Last 14 days, highest 24,330 L/ })).toBeInTheDocument();
    expect(within(panel).getByText(/as of 1:30 am|as of/)).toBeInTheDocument();
  });

  it('draws the hero with the number and the unit as two pieces, so neither is cut off at 200% text', async () => {
    ok();
    renderPage('dsr-report');
    const panel = (await screen.findByRole('region', { name: 'Sold yesterday' })) as HTMLElement;
    const number = within(panel).getAllByText('24,330').find((e) => e.className.includes('text-display'))!;
    const hero = number.parentElement!;
    expect(hero.className).toContain('flex-wrap');
    expect(hero.className).not.toContain('whitespace-nowrap');
    expect(within(hero).getByText('L')).toBeInTheDocument();
  });

  it('prints one real minus sign and a plus, names the dashed line and gives the first and last day', async () => {
    ok();
    renderPage('dsr-report');
    const panel = (await screen.findByRole('region', { name: 'Sold yesterday' })) as HTMLElement;
    expect(within(panel).getByText('Now −170 L. Allowed −480 L to +480 L.')).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/[-\u2013]\d/);
    expect(within(panel).getByText(/Your 14-day average: [0-9,]+ L/)).toBeInTheDocument();
    expect(within(panel).getByText(/yesterday: 24,330 L/)).toBeInTheDocument();
  });

  it('shows a correction in plain words', async () => {
    const r = dsrReport(day, {
      data: {
        ...salesData(),
        revised: true,
        revision: { changed: [{ productKey: 'HSD', fromL: 12_000, toL: 12_100, wasWithin: true, isWithin: true }] },
      } as never,
      kind: 'dsr_sales',
    });
    serve({ feed: feed({ reports: [r] }), me: [entry('dsr-report', 'ok')], pages: [{ items: [r] }] });
    renderPage('dsr-report');
    expect(await screen.findByText('Corrected: Diesel 12,000 L became 12,100 L')).toBeInTheDocument();
    expect((await screen.findAllByText('Corrected')).length).toBeGreaterThan(0);
  });

  it('asks for its own reports ten at a time and walks the cursor on "Show 10 more"', async () => {
    const page = (days: string[], next?: string): ReportHistoryPage => ({ items: days.map((d) => dsrReport(d)), ...(next ? { nextCursor: next } : {}) });
    serve({
      feed: feed(),
      me: [entry('dsr-report', 'ok')],
      pages: [page(['2026-11-26', '2026-11-25'], 'c1'), page(['2026-11-24', '2026-11-23'])],
    });
    renderPage('dsr-report');
    expect(await screen.findAllByTestId('service-history-row')).toHaveLength(2);
    const first = vi.mocked(api.get).mock.calls.find((c) => c[0] === '/v1/me/reports')!;
    expect(first[1]).toEqual({ kinds: 'dsr_sales,dsr_variation', limit: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more' }));
    await waitFor(() => expect(screen.getAllByTestId('service-history-row')).toHaveLength(4));
    const second = vi.mocked(api.get).mock.calls.filter((c) => c[0] === '/v1/me/reports')[1]!;
    expect(second[1]).toEqual({ kinds: 'dsr_sales,dsr_variation', limit: 10, cursor: 'c1' });
    expect(screen.queryByRole('button', { name: 'Show 10 more' })).not.toBeInTheDocument();
  });

  it('draws a strip of days and says, for a day with no report, that no report came that day', async () => {
    serve({ feed: feed(), me: [entry('dsr-report', 'ok')], pages: [{ items: [dsrReport('2026-11-26'), dsrReport('2026-11-24')] }] });
    renderPage('dsr-report');
    await screen.findAllByTestId('service-history-row');
    const strip = screen.getByRole('list', { name: 'Last days' });
    expect(within(strip).getByRole('img', { name: 'No sales report for Wed 25 Nov' })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'sales report for yesterday' })).toBeInTheDocument();
    // The strip is a statement about the day, never about the dealer.
    expect(document.body.textContent).not.toMatch(/you missed/i);
  });

  it('says what each mark of the strip means, gives each its date and counts today', async () => {
    serve({ feed: feed(), me: [entry('dsr-report', 'ok')], pages: [{ items: [dsrReport('2026-11-26'), dsrReport('2026-11-24')] }] });
    renderPage('dsr-report');
    await screen.findAllByTestId('service-history-row');
    const strip = screen.getByRole('list', { name: 'Last days' });
    expect(strip.children).toHaveLength(14);
    // Today is in it, and it is "not due yet", not a missing report.
    expect(within(strip).getByRole('img', { name: 'sales report for today is not due yet' })).toBeInTheDocument();
    expect(within(strip).getByText('27')).toBeInTheDocument();
    expect(screen.getByText('Last 14 days')).toBeInTheDocument();
    for (const word of ['came', 'did not come', 'not due yet']) expect(screen.getByText(word)).toBeInTheDocument();
  });

  it('opens a report from its row, as an overlay', async () => {
    const r = dsrReport(day);
    serve({ feed: feed(), me: [entry('dsr-report', 'ok')], pages: [{ items: [r] }] });
    renderPage('dsr-report');
    fireEvent.click((await screen.findAllByTestId('service-history-row'))[0]!);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/report/c1/${r.messageId}`));
  });

  it('shows what needs the owner for this service, with the same button as Today', async () => {
    const t = task({ kind: 'ask', title: 'Send the register photo', action: { type: 'photo', askRef: 'reg:2026-11-26', acceptsFile: false } });
    serve({ feed: feed({ tasks: [t] }), me: [entry('tt-density', 'ok')] });
    renderPage('tt-density');
    expect(await screen.findByText('Send the register photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in chat' })).toBeInTheDocument();
    expect(await screen.findByText('Needs you', { selector: 'span' })).toBeInTheDocument();
  });

  it('asks MDG about it with the question typed in the box and not sent', async () => {
    ok();
    renderPage('dsr-report');
    fireEvent.click(await screen.findByRole('button', { name: 'Ask MDG about this' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/chat'));
  });

  it('says what MDG needs from the owner in one plain line, not a generic one on every page', async () => {
    ok();
    renderPage('dsr-report');
    expect(await screen.findByText('What MDG needs from you')).toBeInTheDocument();
    expect(screen.queryByText('MDG makes this for you every day.')).not.toBeInTheDocument();
    expect(screen.getByText(/Keep your IndianOil logins working/)).toBeInTheDocument();
  });

  it('shows the guide video chip only when the library has a video tagged with the service', async () => {
    ok();
    const { unmount } = renderPage('dsr-report');
    await screen.findByText('Working');
    expect(screen.queryByRole('button', { name: 'Watch a short video' })).not.toBeInTheDocument();
    unmount();
    vi.useRealTimers();
    serve({
      feed: feed(),
      me: [entry('dsr-report', 'ok')],
      videos: [{ id: 'v1', title: { en: 'Your sales report', hi: 'x' }, summary: { en: '', hi: '' }, durationMs: 1000, service: 'dsr-report', available: true }],
    });
    renderPage('dsr-report');
    expect(await screen.findByRole('button', { name: 'Watch a short video' })).toBeInTheDocument();
  });
});

describe('a service page without the server\'s word', () => {
  it('draws no state word and never "Working" when /me/services is missing', async () => {
    const r = dsrReport('2026-11-26');
    serve({ feed: feed({ reports: [r] }), me: 'missing', pages: [{ items: [r] }] });
    renderPage('dsr-report');
    await screen.findByRole('heading', { level: 1, name: 'Daily Sales Report' });
    await screen.findAllByTestId('service-history-row');
    expect(screen.queryByText('Working')).not.toBeInTheDocument();
    expect(screen.queryByText(/Last ran/)).not.toBeInTheDocument();
  });

  it('keeps the header and the state when the history fails, with Retry in the history card only', async () => {
    serve({ feed: feed({ reports: [dsrReport('2026-11-26')] }), me: [entry('dsr-report', 'ok')], historyFails: true });
    renderPage('dsr-report');
    expect(await screen.findByText('We could not load the reports.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Daily Sales Report' })).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
  });

  it('says when MDG will send the first report, with the next run time only when the server gave one', async () => {
    serve({ feed: feed(), me: [entry('dsr-report', 'new', { nextRunAt: '2026-11-28T01:35:00.000Z' })] });
    renderPage('dsr-report');
    expect(await screen.findByText(/MDG will send the first report after the next run \(Sat 28 Nov 7:05 am\)/)).toBeInTheDocument();
  });

  it('says it without a time when the server is silent', async () => {
    serve({ feed: feed(), me: 'missing' });
    renderPage('dsr-report');
    expect(await screen.findByText('MDG will send the first report after the next run.')).toBeInTheDocument();
  });

  it('offers the setup screen while a held service waits for setup to finish', async () => {
    vi.mocked(api.get).mockReset();
    serve({ feed: feed(), me: [entry('dsr-report', 'held')] });
    // A pump still being set up: the setup read says so.
    const base = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(((path: string, q?: never) =>
      path === '/v1/me/setup' ? Promise.resolve({ active: true, stage: 'logins' }) : base(path, q)) as never);
    renderPage('dsr-report');
    expect(await screen.findByText('Getting ready')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'See setup' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  it('says "Paused, ask MDG why" for a held service on a pump that is live', async () => {
    serve({ feed: feed(), me: [entry('dsr-report', 'held')] });
    renderPage('dsr-report');
    expect(await screen.findByText('Paused, ask MDG why')).toBeInTheDocument();
  });
});

describe('a service page that cannot be opened', () => {
  it('says "We could not find that service" for an unknown id and never prints it', async () => {
    serve({ feed: feed(), me: [] });
    renderPage('brand-new-plugin');
    expect(await screen.findByText('We could not find that service')).toBeInTheDocument();
    expect(pageText()).not.toContain('brand-new-plugin');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See all services' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/services'));
  });

  it.each(['iras-password-reset', 'sdms-password-reset', 'hpcl-account', 'custom-request', 'iras-shift-data'])(
    'gives %s no page, and never prints its id',
    async (id) => {
      serve({ feed: feed(), me: [entry(id, 'ok')] });
      renderPage(id);
      expect(await screen.findByText('We could not find that service')).toBeInTheDocument();
      expect(pageText()).not.toContain(id);
      expect(api.get).not.toHaveBeenCalledWith('/v1/me/reports', expect.anything());
    },
  );

  it.each(['credit-dod-monitoring', 'calibration-claim'])('sends a manager from the owner-only %s to the hub', async (id) => {
    serve({ feed: feed({ role: 'manager' }), me: [] });
    renderPage(id, { role: 'dealer-staff' });
    await waitFor(() => expect(screen.getByText('the door')).toBeInTheDocument());
    expect(screen.getByTestId('where')).toHaveTextContent('/services');
  });
});

describe('a service page: the other panels', () => {
  it('Credit and DOD (owner): amount, date, days left recounted, limit used, room left', async () => {
    const r = report('credit_dod', { data: creditData({ amount: 118_000, date: '2026-11-30', usedPct: 60 }) });
    serve({ feed: feed({ reports: [r] }), me: [entry('credit-dod-monitoring', 'ok')], pages: [{ items: [r] }] });
    renderPage('credit-dod-monitoring');
    expect(await screen.findByText('Deposit Rs 1,18,000 to the oil company by Mon 30 Nov')).toBeInTheDocument();
    expect(screen.getByText('3 days left')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '60% of credit limit used');
    expect(screen.getByText('Room left in your credit limit: Rs 2,00,000')).toBeInTheDocument();
  });

  it('Water checks: "10 of 12 done", the two missed, each slot with a shape and a word', async () => {
    const data = { ...waterData(), slots: [{ label: '08:00 - 10:00', startMin: 480, endMin: 600, state: 'missed', byService: false, updatedOn: null }] };
    const r = report('water_ingress', { data });
    serve({ feed: feed({ reports: [r] }), me: [entry('water-ingress-testing', 'ok')], pages: [{ items: [r] }] });
    renderPage('water-ingress-testing');
    expect(await screen.findByText('10 of 12 checks done')).toBeInTheDocument();
    expect(screen.getAllByText('2 missed').length).toBeGreaterThan(0);
    const slot = screen.getByText('08:00 - 10:00').closest('li')!;
    expect(within(slot).getByText('Missed')).toBeInTheDocument();
  });

  it('Load planner: the verdict, the arrival and a button to plan the order', async () => {
    const r = report('load_plan', { data: planData({ code: 'ORDER_TODAY', arriveTime: '14:00' }) });
    serve({ feed: feed({ reports: [r] }), me: [entry('load-planner', 'ok')], pages: [{ items: [r] }] });
    renderPage('load-planner');
    expect(await screen.findByText('Order the tanker today')).toBeInTheDocument();
    expect(screen.getByText('Arrives Sun 29 Nov, dopahar 2:00'.replace('dopahar 2:00', '2:00 pm'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plan the order' })).toBeInTheDocument();
  });

  it('Load planner: each pool names its tanks, says the low line once, and flags a day below it with a shape and words', async () => {
    const data = planData({ code: 'NEXT_ORDER' });
    data.pools = [
      { ...data.pools[0]!, key: 'p1', tankNos: [4, 6] },
      { ...data.pools[0]!, key: 'p2', tankNos: [8] },
    ] as typeof data.pools;
    data.projection = data.projection.map((d, i) => ({
      ...d,
      cover: [
        { poolKey: 'p1', stockL: i === 3 ? 1_200 : 20_000, daysLeft: 3 - i },
        { poolKey: 'p2', stockL: 20_000, daysLeft: 3 - i },
      ],
    }));
    const r = report('load_plan', { data });
    serve({ feed: feed({ reports: [r] }), me: [entry('load-planner', 'ok')], pages: [{ items: [r] }] });
    renderPage('load-planner');
    expect(await screen.findByRole('region', { name: 'Diesel, tanks 4, 6' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Diesel, tank 8' })).toBeInTheDocument();
    // The low line: once for each pool, not once for each of the eight bars.
    expect(screen.getAllByText('Low line: 5,000 L')).toHaveLength(2);
    // Only the one day under the line is flagged.
    expect(screen.getAllByText('Below the low line')).toHaveLength(1);
  });

  it('Load planner: a pool with no count yet says so under its name', async () => {
    const data = planData({ code: 'NEXT_ORDER' });
    data.projection = data.projection.map((d) => ({ ...d, cover: [] }));
    const r = report('load_plan', { data });
    serve({ feed: feed({ reports: [r] }), me: [entry('load-planner', 'ok')], pages: [{ items: [r] }] });
    renderPage('load-planner');
    expect(await screen.findByText('No count has come yet.')).toBeInTheDocument();
  });

  it('Load planner uses the same words as Today for the order button', async () => {
    const r = report('load_plan', { data: planData({ code: 'ORDER_TODAY' }) });
    serve({ feed: feed({ reports: [r] }), me: [entry('load-planner', 'ok')], pages: [{ items: [r] }] });
    renderPage('load-planner', { lang: 'hi' });
    expect(await screen.findByRole('button', { name: 'ऑर्डर तैयार करें' })).toBeInTheDocument();
  });

  it('Tanker papers: soonest first, counted again from the date', async () => {
    const r = report('paper_expiry', { data: paperData([{ docType: 'fire-noc', daysLeft: 99, validUntil: '2026-12-06' }, { docType: 'vehicle-insurance', daysLeft: 99, validUntil: '2026-11-26' }]) });
    serve({ feed: feed({ reports: [r] }), me: [entry('tanker-documents', 'ok')], pages: [{ items: [r] }] });
    renderPage('tanker-documents');
    const list = await screen.findByRole('list', { name: 'Papers, soonest first' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Insurance has expired');
    expect(rows[1]).toHaveTextContent('9 days left');
  });

  it('Declarations (Template B): the streak, fourteen ticks and the next washroom day', async () => {
    const safety = report('declaration_filed', { data: { ...declarationData({ streak: 23 }), recentDays: ['2026-11-26', '2026-11-25'] } });
    serve({ feed: feed({ reports: [safety] }), me: [entry('dealer-declarations', 'ok')], pages: [{ items: [safety] }] });
    renderPage('dealer-declarations');
    expect(await screen.findByText('23 days in a row')).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: 'Last days' })[0]!.children).toHaveLength(14);
  });

  it('a filing with no receipt yet still opens and says "MDG files this when it is due"', async () => {
    serve({ feed: feed(), me: [entry('mock-drill', 'ok')] });
    renderPage('mock-drill');
    expect(await screen.findByText('MDG files this when it is due.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask MDG about this' })).toBeInTheDocument();
    expect(screen.getByText('What MDG needs from you')).toBeInTheDocument();
  });

  it('Stock check (Template C): the reading time, the cover and a button for a new reading', async () => {
    const r = report('stock_check', { data: stockData() });
    serve({ feed: feed({ reports: [r] }), me: [entry('stock-check', 'on_request')], pages: [{ items: [r] }] });
    renderPage('stock-check');
    expect(await screen.findByText('Reading from today 9:10 am')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask for a new reading' })).toBeInTheDocument();
    expect(screen.getByText('When you ask')).toBeInTheDocument();
  });

  it('Supply status (Template C): Open or Stopped, and each condition with a shape and a word', async () => {
    const data = {
      ...supplyData({ blocked: true, failing: 1 }),
      rows: [
        { cond: 'pending_otp', mark: 'NO', portalText: 'Pending OTP' },
        { cond: 'mock_drill', mark: 'YES', portalText: 'x' },
      ],
    };
    const r = report('ro_supply', { data });
    serve({ feed: feed({ reports: [r] }), me: [entry('ro-supply-status', 'on_request')], pages: [{ items: [r] }] });
    renderPage('ro-supply-status');
    expect(await screen.findByText('Supply is stopped, 1 condition pending')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Conditions' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('An OTP approval is waiting');
    expect(rows[0]).toHaveTextContent('Needs fixing');
    expect(rows[1]).toHaveTextContent('The quarterly mock drill is done');
    expect(rows[1]).toHaveTextContent('Fine');
  });

  it('Complaints (a chat box, no report kind): open count, days open, engineer, and no report history asked for', async () => {
    serve({
      feed: feed(),
      me: [entry('maintenance-complaints', 'ok')],
      complaints: {
        complaints: [
          {
            id: 'k1', route: 'eicts', routeLabel: { en: 'Card machine' }, title: { en: 'Card machine not working', hi: 'कार्ड मशीन नहीं चल रही' },
            stage: 'assigned', screen: 'tracking', steps: [], statusLine: { en: 'An engineer is on the way' }, canCancel: false, canCheckNow: false,
            engineer: { name: 'Suresh', etaHours: 3 }, filedAt: '2026-11-25T05:00:00.000Z', updatedAt: '2026-11-26T05:00:00.000Z',
          },
        ],
      },
    });
    renderPage('maintenance-complaints');
    expect(await screen.findByText('1 complaint is open')).toBeInTheDocument();
    const row = screen.getByText('Card machine not working').closest('li')!;
    expect(row).toHaveTextContent('open for 2 days');
    expect(row).toHaveTextContent('Engineer: Suresh');
    expect(row).toHaveTextContent('expected in about 3 hours');
    expect(api.get).not.toHaveBeenCalledWith('/v1/me/reports', expect.anything());
    expect(screen.queryByText('Last 30 days')).not.toBeInTheDocument();
  });

  it('Work permits: the permit in force and when it is valid till', async () => {
    serve({
      feed: feed(),
      me: [entry('work-permits', 'ok')],
      permits: {
        permits: [
          { id: 'p1', title: { en: 'Shubham Engineering, dispenser repair' }, stage: 'issued', screen: 'issued', statusLine: { en: 'Permit issued' }, number: 'WP-12', validTill: '2026-11-28', hasPdf: true, hasLetter: true, canCancel: false, canFinish: true, updatedAt: '2026-11-26T05:00:00.000Z' },
        ],
      },
    });
    renderPage('work-permits');
    expect(await screen.findByText('Shubham Engineering, dispenser repair')).toBeInTheDocument();
    expect(screen.getByText('Valid till Sat 28 Nov')).toBeInTheDocument();
    expect(screen.getByText(/Permit number WP-12/)).toBeInTheDocument();
  });

  it('a manager gets the same page without owner-only rows from a report that carried them', async () => {
    const r = report('load_plan', { data: { ...planData({ code: 'ORDER_TODAY' }), credit: { availableRs: 1000, shortByRs: 0 } } });
    serve({ feed: feed({ role: 'manager', reports: [r] }), me: [entry('load-planner', 'ok')], pages: [{ items: [r] }] });
    renderPage('load-planner', { role: 'dealer-staff' });
    await screen.findByText('Order the tanker today');
    expect(document.body.textContent).not.toMatch(/Rs\s?\d/);
  });

  it('speaks Hindi: the state, the sections and the sentence of what it does', async () => {
    serve({ feed: feed(), me: [entry('dsr-report', 'ok')] });
    renderPage('dsr-report', { lang: 'hi' });
    expect(await screen.findByRole('heading', { level: 1, name: 'रोज़ की बिक्री रिपोर्ट' })).toBeInTheDocument();
    expect(await screen.findByText('चल रही है')).toBeInTheDocument();
    expect(screen.getByText('अभी का हाल')).toBeInTheDocument();
    expect(screen.getByText('पिछले 30 दिन')).toBeInTheDocument();
    expect(screen.getByText('आपकी दिन की बिक्री और टंकी का स्टॉक, रोज़ दो शीट में।')).toBeInTheDocument();
  });
});
