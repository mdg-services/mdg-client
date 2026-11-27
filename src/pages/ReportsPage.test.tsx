import { QueryClient, onlineManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lastVisitKey } from '@/components/kit';
import type * as ApiModule from '@/lib/api';
import { indiaDay } from '@/lib/fmt';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { ReportHistoryPage, ReportSummary, TodayFeed, TodayReport } from '@dk/shared/types';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof ApiModule>();
  return { ...real, api: { ...real.api, get: apiGet } };
});
// The pump button reaches for the outlets list; this page is not about it.
vi.mock('@/components/kit/MyPumpButton', () => ({ MyPumpButton: () => null }));
vi.mock('@/lib/perfReport', () => ({ markFirstScreen: vi.fn() }));
// The kinds' drawings are tested with the kinds; the list only needs a view that says its line.
vi.mock('@/features/reports/registry', () => {
  const fake = {
    Overlay: () => null,
    Glyph: () => <svg data-testid="glyph" />,
    tile: () => null,
    alert: (d: { alert?: 'problem' | 'attention' }) => (d.alert ? { headline: 'h', line: 'l', severity: d.alert } : null),
    headline: (d: { kind: string; line?: string }) => d.line ?? `line for ${d.kind}`,
    share: () => '',
  };
  return { viewOfData: () => fake, getKindView: () => fake, KIND_VIEWS: {} };
});

const { ReportsPage } = await import('./ReportsPage');

const DAY = 86_400_000;
/** The India day `n` days ago. */
const dayAgo = (n: number) => indiaDay(new Date(Date.now() - n * DAY));

let n = 0;
function row(over: Partial<TodayReport> = {}): TodayReport {
  n += 1;
  return {
    id: `m${n}`,
    kind: 'dsr_sales',
    status: 'ok',
    sentAt: new Date(Date.now() - n * 60_000).toISOString(),
    headline: `words ${n}`,
    attachments: [],
    conversationId: 'c1',
    messageId: `m${n}`,
    data: { kind: 'dsr_sales', v: 1 } as never,
    ...over,
  };
}

const page = (items: TodayReport[], nextCursor?: string): ReportHistoryPage => ({
  items,
  ...(nextCursor ? { nextCursor } : {}),
});

const emptyFeed = (reports: TodayReport[] = []): TodayFeed =>
  ({ day: dayAgo(0), role: 'owner', tasks: [], reports, done: [] }) as unknown as TodayFeed;

const summaryOf = (byKind: ReportSummary['byKind']): ReportSummary => ({
  since: new Date(Date.now() - 30 * DAY).toISOString(),
  byKind,
});

/**
 * Serve the three reads the page makes. `history` answers `GET /v1/me/reports`; the summary and the feed
 * answer or fail as the test says. An unset summary is a 404 from an older server.
 */
function serve(opts: {
  history?: (query: Record<string, string> | undefined) => ReportHistoryPage | Promise<ReportHistoryPage>;
  summary?: ReportSummary | 'fail';
  feed?: TodayFeed;
}) {
  apiGet.mockImplementation(async (path: string, query?: Record<string, string>) => {
    if (path === '/v1/me/reports') return opts.history ? opts.history(query) : page([]);
    if (path === '/v1/me/reports/summary') {
      if (!opts.summary || opts.summary === 'fail') throw new Error('404');
      return opts.summary;
    }
    if (path === '/v1/me/today-feed') return opts.feed ?? emptyFeed();
    throw new Error(`unexpected ${path}`);
  });
}
/** Calls to the list, not the summary or the feed. */
const historyCalls = () => apiGet.mock.calls.filter((c) => c[0] === '/v1/me/reports');

function Where() {
  const loc = useLocation();
  return (
    <div data-testid="where" data-path={loc.pathname}>
      {JSON.stringify(loc.state)}
    </div>
  );
}

/** The phone's Back: one step down this router's own history. */
function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="back" onClick={() => navigate(-1)}>
      back
    </button>
  );
}

function renderPage(route = '/reports') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
      <BackButton />
    </>,
    {
      route,
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
    },
  );
}

/** A stand-in for the browser's IntersectionObserver that the test can fire. */
let observers: Array<{ cb: (e: Array<{ isIntersecting: boolean }>) => void; target?: Element }> = [];
class FakeObserver {
  entry: { cb: (e: Array<{ isIntersecting: boolean }>) => void; target?: Element };
  constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) {
    this.entry = { cb };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.target = el;
  }
  disconnect() {
    observers = observers.filter((o) => o !== this.entry);
  }
  unobserve() {}
}

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'D1' });
  useLangStore.setState({ lang: 'en', explicit: true });
  apiGet.mockReset();
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  try {
    window.localStorage.clear();
  } catch {
    /* no storage here: the page must work without it */
  }
});
afterEach(() => {
  cleanup();
  resetStores();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe('the Reports pill: the header and the switch', () => {
  it('shows skeleton rows while the list is awaited, under the Services header and its switch', () => {
    apiGet.mockReturnValue(new Promise(() => undefined));
    renderPage();
    const sk = screen.getByTestId('reports-skeleton');
    expect(within(sk).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Services');
    const pills = screen.getByRole('radiogroup', { name: 'Services or reports' });
    expect(within(pills).getByRole('radio', { name: 'Reports' })).toBeChecked();
    expect(within(pills).getByRole('radio', { name: 'Services' })).not.toBeChecked();
  });

  it('carries the same "as of" line as the Services pill, from the newest report in hand', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    const header = screen.getByRole('banner');
    expect(header.textContent).toMatch(/as of \d{1,2}:\d{2}/i);
  });

  it('puts the number of reports that need a look from the feed on the Reports pill', async () => {
    serve({
      history: () => page([row()]),
      feed: emptyFeed([row({ kind: 'stock_check', status: 'attention', day: dayAgo(0) })]),
    });
    renderPage();
    expect(await screen.findByRole('radio', { name: 'Reports, 1' })).toBeChecked();
  });

  it('shows no count on the pill when nothing needs a look', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.getByRole('radio', { name: 'Reports' })).toBeInTheDocument();
  });

  it('goes to the Services pill by replacing this address', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/services');
  });

  it('replaces the entry when it goes back to Services, so Back does not land on Reports again', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    fireEvent.click(screen.getByRole('radio', { name: 'Services' }));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/services');
    // Reports was the only entry, so it was replaced: a push would leave it one step behind.
    fireEvent.click(screen.getByTestId('back'));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/services');
  });
});

describe('the list, by business day', () => {
  it('asks for the first page with no kinds, and lists reports under a heading for each business day', async () => {
    serve({
      history: () =>
        page([
          row({ kind: 'dsr_sales', day: dayAgo(0) }),
          row({ kind: 'credit_dod', day: dayAgo(1) }),
          row({ kind: 'water_ingress', day: '2026-01-05' }),
        ]),
    });
    renderPage();
    const rows = await screen.findAllByTestId('report-history-row');
    expect(rows).toHaveLength(3);
    expect(historyCalls()[0]).toEqual(['/v1/me/reports', {}]);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(headings[2]).toBe('Mon 5 Jan');
  });

  it('puts a sales report sent just after midnight for yesterday under Yesterday, not Today', async () => {
    // Sent a few minutes ago (so, today in India), but about yesterday.
    serve({ history: () => page([row({ day: dayAgo(1), sentAt: new Date().toISOString() })]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    const day = screen.getByTestId('reports-day');
    expect(day).toHaveAttribute('data-day', dayAgo(1));
    expect(within(day).getByRole('heading')).toHaveTextContent('Yesterday');
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull();
  });

  it("draws each row with the kind's name, its own line, a status shape with its word, and a tile", async () => {
    serve({
      history: () =>
        page([
          row({
            kind: 'dsr_variation',
            status: 'attention',
            day: dayAgo(1),
            data: { kind: 'dsr_variation', v: 1, alert: 'problem', line: 'Diesel 310 L short' } as never,
          }),
        ]),
    });
    renderPage();
    const r = await screen.findByTestId('report-history-row');
    expect(within(r).getByText('Stock variation')).toBeInTheDocument();
    expect(within(r).getByText('Diesel 310 L short')).toBeInTheDocument();
    // The kind's own verdict is a problem: an octagon with the word, not a colour.
    expect(r.querySelector('[data-status="problem"]')).not.toBeNull();
    expect(within(r).getByText('Problem')).toBeInTheDocument();
    expect(within(r).getByTestId('glyph')).toBeInTheDocument();
    expect(within(r).getByText(/^Sent /)).toBeInTheDocument();
  });

  it('says what an old picture-only report is, and opens it the same way', async () => {
    serve({
      history: () =>
        page([
          row({
            kind: 'dsr_variation',
            data: undefined,
            headline: 'DSR, 13 Aug — within limit',
            attachments: [{ storageKey: 'k', filename: 'a.png', contentType: 'image/png', size: 1, kind: 'image', url: '' }],
          }),
        ]),
    });
    renderPage();
    const r = await screen.findByTestId('report-history-row');
    expect(within(r).getByText('DSR, 13 Aug — within limit')).toBeInTheDocument();
    expect(within(r).getByText('Picture')).toBeInTheDocument();
  });

  it('marks a revised report Corrected', async () => {
    serve({
      history: () =>
        page([row({ kind: 'dsr_sales', day: dayAgo(1), data: { kind: 'dsr_sales', v: 1, revised: true, products: [] } as never })]),
    });
    renderPage();
    expect(within(await screen.findByTestId('report-history-row')).getByText('Corrected')).toBeInTheDocument();
  });

  it('opens a report over this list: a push to its address that leaves the list beneath', async () => {
    serve({ history: () => page([row({ conversationId: 'c9', messageId: 'm-open' })]) });
    renderPage();
    fireEvent.click(await screen.findByTestId('report-history-row'));
    const where = screen.getByTestId('where');
    expect(where.getAttribute('data-path')).toBe('/report/c9/m-open');
    const state = JSON.parse(where.textContent!);
    expect(state.backgroundLocation.pathname).toBe('/reports');
    // The row is handed over, so the overlay opens at once.
    expect(state.report.messageId).toBe('m-open');
  });

  it('does not clip a row: the day card has no overflow-hidden, the corners sit on the first and last row', async () => {
    serve({ history: () => page([row(), row({ kind: 'stock_check' })]) });
    renderPage();
    await screen.findAllByTestId('report-history-row');
    const list = screen.getAllByTestId('report-history-row')[0]!.closest('ul')!;
    expect(list.className).not.toMatch(/overflow-hidden/);
    expect(list.className).toMatch(/rounded-xl/);
    expect(list.className).toMatch(/first-child>button\]:rounded-t-xl/);
    for (const li of list.querySelectorAll(':scope > li')) expect(li.className).toMatch(/min-w-0/);
  });

  it('makes every row one big tap target that grows with its words, with no fixed height', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    const r = await screen.findByTestId('report-history-row');
    expect(r.className).toMatch(/min-h-14/);
    expect(r.className).toMatch(/w-full/);
    expect(r.className).not.toMatch(/\bh-\[/);
    expect(r.innerHTML).not.toMatch(/truncate|line-clamp/);
  });

  it('says what changed since the last one under a sales row', async () => {
    serve({
      history: () =>
        page([
          row({
            kind: 'dsr_sales',
            day: dayAgo(1),
            data: {
              kind: 'dsr_sales',
              v: 1,
              revised: false,
              products: [
                {
                  key: 'HSD',
                  tankNos: [1],
                  sales: {
                    state: 'closed',
                    closedDay: dayAgo(1),
                    soldL: 10_600,
                    sameWeekdayLastWeek: { day: dayAgo(8), soldL: 10_000 },
                    trend: [],
                    rows: [],
                  },
                },
              ],
            } as never,
          }),
        ]),
    });
    renderPage();
    const line = await screen.findByTestId('report-change');
    expect(line).toHaveAttribute('data-dir', 'up');
    expect(line.textContent).toMatch(/^Diesel: 6% more than last \w+day$/);
  });
});

describe('replaced reports are folded away', () => {
  it('hides an older copy behind "1 replaced report", and shows it, marked, when asked', async () => {
    serve({
      history: () =>
        page([
          row({ kind: 'dsr_sales', day: dayAgo(1), headline: 'newer' }),
          row({ kind: 'dsr_sales', day: dayAgo(1), headline: 'older' }),
        ]),
    });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.getAllByTestId('report-history-row')).toHaveLength(1);
    const toggle = screen.getByTestId('reports-replaced-toggle');
    expect(toggle).toHaveTextContent('1 replaced report');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const rows = screen.getAllByTestId('report-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveAttribute('data-replaced', 'true');
    expect(within(rows[1]!).getByText('Replaced')).toBeInTheDocument();
    // Muted by a plain darker grey and the word, never by fading the words.
    expect(rows[1]!.innerHTML).not.toMatch(/opacity-/);
    expect(screen.getByTestId('reports-replaced-toggle')).toHaveTextContent('Hide replaced reports');
    fireEvent.click(screen.getByTestId('reports-replaced-toggle'));
    expect(screen.getAllByTestId('report-history-row')).toHaveLength(1);
  });

  it('has no fold when nothing was replaced', async () => {
    serve({ history: () => page([row({ kind: 'tt_ack', day: dayAgo(1) }), row({ kind: 'tt_ack', day: dayAgo(1) })]) });
    renderPage();
    await screen.findAllByTestId('report-history-row');
    expect(screen.queryByTestId('reports-replaced-toggle')).toBeNull();
    expect(screen.getAllByTestId('report-history-row')).toHaveLength(2);
  });
});

describe('the "New" mark', () => {
  const storeVisit = (iso: string) => {
    window.localStorage.setItem(lastVisitKey('u1', 'reports.D1'), iso);
  };

  it('marks a report that came after the last visit with a dot and the word New', async () => {
    storeVisit(new Date(Date.now() - 3_600_000).toISOString());
    serve({
      history: () =>
        page([
          row({ kind: 'stock_check', day: dayAgo(0), sentAt: new Date(Date.now() - 60_000).toISOString() }),
          row({ kind: 'tanker_density', day: dayAgo(1), sentAt: new Date(Date.now() - 2 * 3_600_000).toISOString() }),
        ]),
    });
    renderPage();
    const rows = await screen.findAllByTestId('report-history-row');
    expect(within(rows[0]!).getByTestId('report-new-mark')).toHaveTextContent('New');
    expect(rows[0]).toHaveAttribute('data-new', 'true');
    expect(within(rows[1]!).queryByTestId('report-new-mark')).toBeNull();
  });

  it('marks nothing on a first visit, and keeps working when the browser has no storage', async () => {
    serve({ history: () => page([row({ day: dayAgo(0) })]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.queryByTestId('report-new-mark')).toBeNull();
  });

  it('remembers the visit when the page is left', async () => {
    serve({ history: () => page([row()]) });
    const view = renderPage();
    await screen.findByTestId('report-history-row');
    expect(window.localStorage.getItem(lastVisitKey('u1', 'reports.D1'))).toBeNull();
    view.unmount();
    expect(window.localStorage.getItem(lastVisitKey('u1', 'reports.D1'))).not.toBeNull();
  });
});

describe('the Last 30 days card', () => {
  it('is absent until the summary answers, and absent for good when an older server has no such route', async () => {
    serve({ history: () => page([row()]), summary: 'fail' });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.queryByTestId('reports-month')).toBeNull();
    // Nothing else is lost: the chips and the list are there, and no card of guesses.
    expect(screen.getByTestId('reports-chip-needs')).toBeInTheDocument();
    expect(screen.queryByText(/needed a look/)).toBeNull();
  });

  it('says what came, how many needed a look, water days and papers filed', async () => {
    serve({
      history: () => page([row()]),
      summary: summaryOf({
        dsr_sales: { count: 20, needLook: 0, days: [dayAgo(1), dayAgo(2)] },
        water_ingress: { count: 25, needLook: 2, days: Array.from({ length: 25 }, (_, i) => dayAgo(i + 1)) },
        declaration_filed: { count: 4, needLook: 0, days: [] },
        mock_drill: { count: 1, needLook: 0, days: [] },
      }),
    });
    renderPage();
    const card = await screen.findByTestId('reports-month');
    expect(within(card).getByRole('heading', { name: 'Last 30 days' })).toBeInTheDocument();
    expect(within(card).getByText('50 reports came')).toBeInTheDocument();
    expect(within(card).getByText('2 needed a look')).toBeInTheDocument();
    expect(within(card).getByText('Water checks recorded on 25 days')).toBeInTheDocument();
    expect(within(card).getByText('5 papers filed for you')).toBeInTheDocument();
  });

  it('says plainly when none needed a look, with a tick shape', async () => {
    serve({ history: () => page([row()]), summary: summaryOf({ dsr_sales: { count: 1, needLook: 0, days: [dayAgo(1)] } }) });
    renderPage();
    const card = await screen.findByTestId('reports-month');
    expect(within(card).getByText('1 report came')).toBeInTheDocument();
    const line = within(card).getByText('None of them needed a look');
    expect(line.closest('div')!.parentElement!.querySelector('[data-status="ok"]')).not.toBeNull();
  });

  it('draws the sales-report days as a strip and names a gap as a fact, never "missed"', async () => {
    const days = [dayAgo(1), dayAgo(2), dayAgo(3), dayAgo(5), dayAgo(6)];
    serve({
      history: () => page([row()]),
      summary: summaryOf({ dsr_sales: { count: days.length, needLook: 0, days } }),
    });
    renderPage();
    const card = await screen.findByTestId('reports-month');
    const strip = within(card).getByTestId('reports-sales-strip');
    expect(strip.querySelectorAll('li')).toHaveLength(6);
    // Five ticks and one dashed ring (the gap), each with a spoken label.
    expect(within(strip).getAllByRole('img').filter((e) => /^No sales report for/.test(e.getAttribute('aria-label')!))).toHaveLength(1);
    expect(card.textContent).toMatch(/No sales report for \w{3} \d{1,2} \w{3}/);
    expect(card.textContent!.toLowerCase()).not.toContain('missed');
    expect(card.textContent!.toLowerCase()).not.toContain('you miss');
  });

  it('names at most three gaps and counts the rest', async () => {
    // Reports on days 1, 12 and 13 ago only: gaps on days 2 to 11 (ten of them).
    const days = [dayAgo(1), dayAgo(12), dayAgo(13)];
    serve({ history: () => page([row()]), summary: summaryOf({ dsr_sales: { count: 3, needLook: 0, days } }) });
    renderPage();
    const card = await screen.findByTestId('reports-month');
    expect(card.textContent!.match(/No sales report for/g)).toHaveLength(3);
    expect(within(card).getByText('7 more days with no sales report')).toBeInTheDocument();
  });

  it('says so when a sales report came every day, and draws no strip with no sales report at all', async () => {
    serve({
      history: () => page([row()]),
      summary: summaryOf({ dsr_sales: { count: 3, needLook: 0, days: [dayAgo(1), dayAgo(2), dayAgo(3)] } }),
    });
    const first = renderPage();
    expect(await screen.findByText('A sales report came every day')).toBeInTheDocument();
    first.unmount();
    cleanup();

    serve({ history: () => page([row()]), summary: summaryOf({ water_ingress: { count: 3, needLook: 0, days: [dayAgo(1)] } }) });
    renderPage();
    await screen.findByTestId('reports-month');
    expect(screen.queryByTestId('reports-sales-strip')).toBeNull();
    expect(screen.queryByText(/No sales report for/)).toBeNull();
  });

  it('shows no card at all when nothing came in 30 days (the empty state speaks)', async () => {
    serve({ history: () => page([]), summary: summaryOf({}) });
    renderPage();
    expect(await screen.findByText('No reports in the last 30 days')).toBeInTheDocument();
    expect(screen.queryByTestId('reports-month')).toBeNull();
  });

  it('the card button names what it shows, with the count, and opens Needs a look', async () => {
    serve({
      history: () => page([row({ kind: 'stock_check', status: 'attention', day: dayAgo(0) })]),
      summary: summaryOf({ stock_check: { count: 2, needLook: 1, days: [dayAgo(0)] } }),
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'See the 1 that needs a look' }));
    expect(screen.getByTestId('reports-chip-needs')).toHaveAttribute('aria-pressed', 'true');
  });

  it('puts the count of reports that need a look on the Needs a look chip, and none when none do', async () => {
    serve({
      history: () => page([row()]),
      summary: summaryOf({ stock_check: { count: 4, needLook: 3, days: [dayAgo(0)] } }),
    });
    renderPage();
    const chip = await screen.findByTestId('reports-chip-needs');
    await waitFor(() => expect(within(chip).getByTestId('reports-chip-count')).toHaveTextContent('3'));
    expect(chip).toHaveAccessibleName('Needs a look, 3');
    cleanup();
    serve({
      history: () => page([row()]),
      summary: summaryOf({ stock_check: { count: 4, needLook: 0, days: [dayAgo(0)] } }),
    });
    renderPage();
    await screen.findByTestId('reports-month');
    expect(within(screen.getByTestId('reports-chip-needs')).queryByTestId('reports-chip-count')).toBeNull();
  });

  it('puts the card\'s look row in its own shape: the status word does not wrap, the button sits beside it', async () => {
    serve({
      history: () => page([row()]),
      summary: summaryOf({ stock_check: { count: 4, needLook: 3, days: [dayAgo(0)] } }),
    });
    renderPage();
    const look = await screen.findByTestId('reports-month-look');
    expect(look.querySelector('[data-status="attention"]')!.className).toMatch(/whitespace-nowrap/);
    expect(within(look).getByRole('button', { name: 'See the 3 that need a look' })).toBeInTheDocument();
  });

  it('says which dates the sales strip covers instead of "last N days" when the pump is new', async () => {
    const days = [dayAgo(1), dayAgo(2), dayAgo(3)];
    serve({
      history: () => page([row()]),
      summary: summaryOf({ dsr_sales: { count: 3, needLook: 0, days } }),
    });
    renderPage();
    const strip = await screen.findByTestId('reports-sales-strip');
    expect(strip.querySelector('p')!.textContent).toMatch(/^Daily sales report, \w{3} \d{1,2} \w{3} to (yesterday|\w{3} \d{1,2} \w{3})$/);
    expect(strip.textContent).not.toMatch(/last \d+ days/);
  });
});

describe('the filter chips', () => {
  it('start on All, with Needs a look first, then the families; each chip is at least 44px and says a word', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    const group = screen.getByRole('group', { name: 'Show reports' });
    const chips = within(group).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([
      'Needs a look',
      'All',
      'Sales & stock',
      'Money',
      'Papers & filings',
      'Tanker',
      'Water & supply',
    ]);
    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'false');
    for (const c of chips) {
      expect(c.className).toMatch(/min-h-11/);
    }
    // The chips wrap onto more lines; they never scroll sideways out of sight.
    expect(group.className).toMatch(/flex-wrap/);
    expect(group.className).not.toMatch(/overflow-x/);
  });

  it('gives a manager no Money chip, and never lists an owner-only report even if the server sends one', async () => {
    signIn({ role: 'dealer-staff', dealerId: 'D1' });
    serve({ history: () => page([row({ kind: 'dsr_sales', day: dayAgo(1) }), row({ kind: 'credit_dod', day: dayAgo(1) })]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.queryByTestId('reports-chip-money')).toBeNull();
    expect(screen.getAllByTestId('report-history-row')).toHaveLength(1);
    expect(screen.getByTestId('report-history-row')).toHaveAttribute('data-kind', 'dsr_sales');
  });

  it("ask the server for only that family's kinds, and mark the chosen one (a tick, not just a fill)", async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    apiGet.mockClear();
    serve({ history: () => page([row({ kind: 'credit_dod', day: dayAgo(1) })]) });
    fireEvent.click(screen.getByTestId('reports-chip-money'));
    await waitFor(() => expect(historyCalls().length).toBeGreaterThan(0));
    expect(historyCalls()[0]).toEqual(['/v1/me/reports', { kinds: 'credit_dod,ledger_watch,calibration_claim' }]);
    expect(screen.getByTestId('reports-chip-money')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('reports-chip-all')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('reports-chip-money').querySelector('.lucide-check')).not.toBeNull();
  });

  it('say there is nothing in a family when it is empty, and "See all" goes back', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    serve({ history: () => page([]) });
    fireEvent.click(screen.getByTestId('reports-chip-money'));
    expect(await screen.findByText('No Money reports in the last 30 days')).toBeInTheDocument();
    serve({ history: () => page([row()]) });
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(await screen.findByTestId('report-history-row')).toBeInTheDocument();
    expect(screen.getByTestId('reports-chip-all')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Needs a look', () => {
  const attention = (kind: 'stock_check' | 'water_ingress', over: Partial<TodayReport> = {}) =>
    row({ kind, status: 'attention', day: dayAgo(0), data: { kind, v: 1 } as never, ...over });

  it('asks only for the kinds the summary says have something, and lists only the reports that need a look', async () => {
    const summary = summaryOf({
      stock_check: { count: 3, needLook: 1, days: [dayAgo(0)] },
      water_ingress: { count: 20, needLook: 1, days: [dayAgo(0)] },
      dsr_sales: { count: 20, needLook: 0, days: [dayAgo(1)] },
    });
    serve({ history: () => page([row()]), summary });
    renderPage();
    await screen.findByTestId('report-history-row');
    apiGet.mockClear();
    serve({
      summary,
      history: () =>
        page([
          attention('stock_check'),
          // A quiet report of a kind that has something is on the page too, and is left out.
          row({ kind: 'water_ingress', status: 'ok', day: dayAgo(1), data: { kind: 'water_ingress', v: 1 } as never }),
        ]),
    });
    fireEvent.click(screen.getByTestId('reports-chip-needs'));
    await waitFor(() => expect(screen.getAllByTestId('report-history-row')).toHaveLength(1));
    expect(historyCalls()[0]).toEqual(['/v1/me/reports', { kinds: 'stock_check,water_ingress' }]);
    expect(screen.getByTestId('report-history-row')).toHaveAttribute('data-kind', 'stock_check');
    expect(screen.getByTestId('reports-chip-needs')).toHaveAttribute('aria-pressed', 'true');
  });

  it('says nothing needs a look, without asking the server for a list, when the summary says none do', async () => {
    const summary = summaryOf({ dsr_sales: { count: 20, needLook: 0, days: [dayAgo(1)] } });
    serve({ history: () => page([row()]), summary });
    renderPage();
    await screen.findByTestId('report-history-row');
    apiGet.mockClear();
    fireEvent.click(screen.getByTestId('reports-chip-needs'));
    expect(await screen.findByText('Nothing needs a look right now')).toBeInTheDocument();
    expect(historyCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(await screen.findByTestId('report-history-row')).toBeInTheDocument();
  });

  it('says nothing needs a look, not "no reports", when the card counted one but the list has only a calm or replaced copy', async () => {
    const summary = summaryOf({ stock_check: { count: 2, needLook: 1, days: [dayAgo(0)] } });
    serve({ history: () => page([row()]), summary });
    renderPage();
    await screen.findByTestId('report-history-row');
    // The server found the kind, but the page it sends holds only a quiet report of it.
    serve({
      summary,
      history: () =>
        page([row({ kind: 'stock_check', status: 'ok', day: dayAgo(0), data: { kind: 'stock_check', v: 1 } as never })]),
    });
    fireEvent.click(screen.getByRole('button', { name: /that needs a look/ }));
    expect(await screen.findByText('Nothing needs a look right now')).toBeInTheDocument();
    expect(screen.queryByText('No reports in the last 30 days')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  it('opens on it for ?filter=needs, and without a summary asks for every kind and filters on the phone', async () => {
    serve({
      summary: 'fail',
      history: () => page([row({ kind: 'dsr_sales', day: dayAgo(1) }), attention('stock_check')]),
    });
    renderPage('/reports?filter=needs');
    await waitFor(() => expect(screen.getAllByTestId('report-history-row')).toHaveLength(1));
    expect(screen.getByTestId('report-history-row')).toHaveAttribute('data-kind', 'stock_check');
    expect(historyCalls()[0]).toEqual(['/v1/me/reports', {}]);
    expect(screen.getByTestId('reports-chip-needs')).toHaveAttribute('aria-pressed', 'true');
  });

  it('waits for the summary before it asks, so it never reads every page of every kind first', async () => {
    let answer: (s: ReportSummary) => void = () => undefined;
    apiGet.mockImplementation((path: string) => {
      if (path === '/v1/me/reports/summary') return new Promise((res) => (answer = res as typeof answer));
      if (path === '/v1/me/today-feed') return Promise.resolve(emptyFeed());
      return Promise.resolve(page([attention('stock_check')]));
    });
    renderPage('/reports?filter=needs');
    await screen.findByTestId('reports-skeleton');
    expect(historyCalls()).toHaveLength(0);
    answer(summaryOf({ stock_check: { count: 1, needLook: 1, days: [dayAgo(0)] } }));
    await screen.findByTestId('report-history-row');
    expect(historyCalls()).toHaveLength(1);
    expect(historyCalls()[0]![1]).toEqual({ kinds: 'stock_check' });
  });
});

describe('one service (?service=)', () => {
  it("asks only for that service's kinds, says so in words, and lets the dealer clear it", async () => {
    serve({ history: () => page([row({ kind: 'water_ingress', day: dayAgo(1), data: { kind: 'water_ingress', v: 1 } as never })]) });
    renderPage('/reports?service=water-ingress-testing');
    await screen.findByTestId('report-history-row');
    expect(historyCalls()[0]).toEqual(['/v1/me/reports', { kinds: 'water_ingress' }]);
    const banner = screen.getByTestId('reports-service-filter');
    expect(banner).toHaveTextContent('Only Water ingress testing');
    serve({ history: () => page([row()]) });
    fireEvent.click(within(banner).getByRole('button', { name: 'Show all reports' }));
    await waitFor(() => expect(screen.queryByTestId('reports-service-filter')).toBeNull());
  });

  it('ignores an id it does not know, one with no reports of its own, and an owner-only one for a manager', async () => {
    serve({ history: () => page([row()]) });
    for (const id of ['nonsense', 'maintenance-complaints']) {
      const view = renderPage(`/reports?service=${id}`);
      await screen.findByTestId('report-history-row');
      expect(screen.queryByTestId('reports-service-filter')).toBeNull();
      expect(historyCalls().at(-1)).toEqual(['/v1/me/reports', {}]);
      view.unmount();
      cleanup();
      apiGet.mockClear();
      serve({ history: () => page([row()]) });
    }
    signIn({ role: 'dealer-staff', dealerId: 'D1' });
    renderPage('/reports?service=credit-dod-monitoring');
    await screen.findByTestId('report-history-row');
    expect(screen.queryByTestId('reports-service-filter')).toBeNull();
  });
});

describe('older pages', () => {
  it('loads the next page by hand with "Show earlier reports", and shows each report once', async () => {
    const first = row({ messageId: 'dup', kind: 'stock_check', day: dayAgo(1) });
    let call = 0;
    serve({
      history: (q) => {
        call += 1;
        if (!q?.cursor) return page([first, row({ kind: 'tanker_density', day: dayAgo(1) })], 'cursor-1');
        // Page two repeats a report page one already had (a send between the two reads).
        return page([{ ...first }, row({ kind: 'load_plan', day: dayAgo(3) })]);
      },
    });
    renderPage();
    await screen.findAllByTestId('report-history-row');
    expect(screen.queryByTestId('reports-end')).toBeNull();
    fireEvent.click(screen.getByTestId('reports-show-earlier'));
    await waitFor(() => expect(screen.getAllByTestId('report-history-row')).toHaveLength(3));
    expect(call).toBe(2);
    expect(historyCalls().at(-1)).toEqual(['/v1/me/reports', { cursor: 'cursor-1' }]);
  });

  it('loads it by itself as the dealer nears the end of the list', async () => {
    serve({ history: (q) => (q?.cursor ? page([row({ kind: 'load_plan', day: dayAgo(3) })]) : page([row()], 'cursor-1')) });
    renderPage();
    await screen.findByTestId('report-history-row');
    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    act(() => observers.forEach((o) => o.cb([{ isIntersecting: true }])));
    await waitFor(() => expect(historyCalls()).toHaveLength(2));
    expect(historyCalls()[1]).toEqual(['/v1/me/reports', { cursor: 'cursor-1' }]);
  });

  it('ends with "Reports older than 30 days are in your chat" and a way to the chat, replacing this page', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    const end = await screen.findByTestId('reports-end');
    expect(end).toHaveTextContent('Reports older than 30 days are in your chat.');
    expect(screen.queryByTestId('reports-show-earlier')).toBeNull();
    fireEvent.click(within(end).getByRole('button', { name: 'Open chat' }));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/chat');
  });
});

describe('when there is nothing, or it will not load', () => {
  it('says there is no report in the last 30 days, calmly', async () => {
    serve({ history: () => page([]) });
    renderPage();
    expect(await screen.findByText('No reports in the last 30 days')).toBeInTheDocument();
  });

  it('says it could not load, and tries again', async () => {
    let fail = true;
    serve({
      history: () => {
        if (fail) throw new Error('boom');
        return page([row()]);
      },
    });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not load your reports.');
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('report-history-row')).toBeInTheDocument();
  });

  it('keeps the loaded rows when a refresh fails, and says the rows are the earlier ones', async () => {
    let call = 0;
    serve({
      history: (q) => {
        call += 1;
        if (q?.cursor) throw new Error('boom');
        return page([row()], 'cursor-1');
      },
    });
    renderPage();
    await screen.findByTestId('report-history-row');
    fireEvent.click(screen.getByTestId('reports-show-earlier'));
    await waitFor(() => expect(call).toBe(2));
    expect(await screen.findByText('We could not refresh. These are the reports from before.')).toBeInTheDocument();
    expect(screen.getAllByTestId('report-history-row')).toHaveLength(1);
  });

  it('keeps looking when a page comes back empty with a marker, and shows the report it finds', async () => {
    serve({ history: (q) => (q?.cursor ? page([row({ kind: 'credit_dod', day: dayAgo(1) })]) : page([], 'cursor-2')) });
    renderPage();
    expect(await screen.findByTestId('report-history-row')).toBeInTheDocument();
    expect(historyCalls()).toHaveLength(2);
    expect(screen.queryByText('No reports in the last 30 days')).toBeNull();
  });

  it('says it could not load when the phone has no network and nothing was ever loaded (the request is parked, not failed)', async () => {
    onlineManager.setOnline(false);
    try {
      apiGet.mockReturnValue(new Promise(() => undefined));
      renderPage();
      expect(await screen.findByText('We could not load your reports.')).toBeInTheDocument();
      expect(screen.queryByTestId('reports-skeleton')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    } finally {
      act(() => onlineManager.setOnline(true));
    }
  });

  it('says there is no internet, in words with a shape, over a list it already has', async () => {
    serve({ history: () => page([row()]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.queryByTestId('reports-offline')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(await screen.findByTestId('reports-offline')).toHaveTextContent(
      'No internet. These are the reports from before.',
    );
    expect(screen.getByTestId('reports-offline').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('report-history-row')).toBeInTheDocument();
  });
});

describe("in the reader's language", () => {
  it('writes the header, the switch, the chips and the headings in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    serve({
      history: () => page([row({ day: dayAgo(0), sentAt: new Date().toISOString() })]),
      summary: summaryOf({ dsr_sales: { count: 3, needLook: 1, days: [dayAgo(1), dayAgo(2), dayAgo(4)] } }),
    });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('सेवाएँ');
    expect(screen.getByRole('radio', { name: 'रिपोर्ट' })).toBeChecked();
    expect(screen.getByTestId('reports-chip-all')).toHaveTextContent('सभी');
    expect(screen.getByTestId('reports-chip-needs')).toHaveTextContent('ध्यान दें');
    expect(screen.getByTestId('reports-chip-money')).toHaveTextContent('पैसा');
    expect(screen.getByTestId('reports-day').querySelector('h2')).toHaveTextContent('आज');
    expect(within(screen.getByTestId('report-history-row')).getByText('बिक्री रिपोर्ट (DSR)')).toBeInTheDocument();
    expect(await screen.findByText('पिछले 30 दिन')).toBeInTheDocument();
    expect(screen.getByText('3 रिपोर्ट आईं')).toBeInTheDocument();
    expect(screen.getByText('ध्यान देने की 1 बात थी')).toBeInTheDocument();
  });

  it('writes them in Hinglish in Latin letters', async () => {
    useLangStore.setState({ lang: 'hl', explicit: true });
    serve({ history: () => page([row({ day: dayAgo(0), sentAt: new Date().toISOString() })]) });
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.getByTestId('reports-chip-money')).toHaveTextContent('Paisa');
    expect(screen.getByTestId('reports-chip-needs')).toHaveTextContent('Dhyan dein');
    expect(screen.getByText('Bikri report (DSR)')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[ऀ-ॿ]/);
  });
});
