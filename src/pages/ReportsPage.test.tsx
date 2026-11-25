import { QueryClient, onlineManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { ReportHistoryPage, TodayReport } from '@dk/shared/types';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof ApiModule>();
  return { ...real, api: { ...real.api, get: apiGet } };
});
// The pump chip and its sheet reach for the outlets list; this page is not about them.
vi.mock('@/features/outlets/OutletChip', () => ({ OutletChip: () => null }));
vi.mock('@/features/outlets/OutletSheet', () => ({ OutletSheet: () => null }));
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

function Where() {
  const loc = useLocation();
  return (
    <div data-testid="where" data-path={loc.pathname}>
      {JSON.stringify(loc.state)}
    </div>
  );
}

function renderPage() {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </>,
    {
      route: '/reports',
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
  signIn({ role: 'dealer-owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  apiGet.mockReset();
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});
afterEach(() => {
  cleanup();
  resetStores();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe('the Reports tab', () => {
  it('shows six skeleton rows while the list is awaited, and a Reports bar', () => {
    apiGet.mockReturnValue(new Promise(() => undefined));
    renderPage();
    const sk = screen.getByTestId('reports-skeleton');
    expect(sk).toHaveAttribute('aria-busy', 'true');
    expect(sk.querySelectorAll('li:not(.sr-only)')).toHaveLength(6);
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('asks for the first page with no kinds, and lists reports under a heading for each day', async () => {
    apiGet.mockResolvedValue(
      page([
        row({ kind: 'dsr_sales', sentAt: new Date().toISOString() }),
        row({ kind: 'credit_dod', sentAt: new Date(Date.now() - 86_400_000).toISOString() }),
        row({ kind: 'water_ingress', sentAt: '2026-01-05T04:00:00.000Z' }),
      ]),
    );
    renderPage();
    const rows = await screen.findAllByTestId('report-history-row');
    expect(rows).toHaveLength(3);
    expect(apiGet).toHaveBeenCalledWith('/v1/me/reports', {});
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(headings[2]).toMatch(/Mon, 5 Jan|Mon, 05 Jan/);
  });

  it('draws each row with the kind\'s name, its own line, a status shape with its word, and a tile', async () => {
    apiGet.mockResolvedValue(
      page([
        row({
          kind: 'dsr_variation',
          status: 'attention',
          data: { kind: 'dsr_variation', v: 1, alert: 'problem', line: 'Diesel 310 L short' } as never,
        }),
      ]),
    );
    renderPage();
    const r = await screen.findByTestId('report-history-row');
    expect(within(r).getByText('Stock variation')).toBeInTheDocument();
    expect(within(r).getByText('Diesel 310 L short')).toBeInTheDocument();
    // The kind's own verdict is a problem: an octagon with the word, not a colour.
    expect(r.querySelector('[data-status="problem"]')).not.toBeNull();
    expect(within(r).getByText('Problem')).toBeInTheDocument();
    // The tile: the mini signature and the family's icon, both hidden from a screen reader.
    expect(within(r).getByTestId('glyph')).toBeInTheDocument();
    expect(r.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('says what an old picture-only report is, and opens it the same way', async () => {
    apiGet.mockResolvedValue(
      page([
        row({
          kind: 'dsr_variation',
          data: undefined,
          headline: 'DSR, 13 Aug — within limit',
          attachments: [{ storageKey: 'k', filename: 'a.png', contentType: 'image/png', size: 1, kind: 'image', url: '' }],
        }),
      ]),
    );
    renderPage();
    const r = await screen.findByTestId('report-history-row');
    expect(within(r).getByText('DSR, 13 Aug — within limit')).toBeInTheDocument();
    expect(within(r).getByText('Picture')).toBeInTheDocument();
  });

  it('mutes a replaced report and says so, and says a revised one was corrected', async () => {
    apiGet.mockResolvedValue(
      page([
        row({ kind: 'dsr_sales', day: '2026-11-23', data: { kind: 'dsr_sales', v: 1, revised: true } as never }),
        row({ kind: 'dsr_sales', day: '2026-11-23' }),
      ]),
    );
    renderPage();
    const rows = await screen.findAllByTestId('report-history-row');
    expect(within(rows[0]!).getByText('Corrected')).toBeInTheDocument();
    expect(rows[0]).not.toHaveAttribute('data-replaced');
    expect(within(rows[1]!).getByText('Replaced')).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('data-replaced', 'true');
    // Muted by a darker plain colour and the tag, never by fading the words (a faded grey is ~3:1).
    expect(rows[1]!.innerHTML).not.toMatch(/opacity-/);
    expect(rows[1]!.querySelector('.text-text-muted')).not.toBeNull();
  });

  it('opens a report over this list: a push to its address that leaves the list beneath', async () => {
    const tapped = row({ conversationId: 'c9', messageId: 'm-open' });
    apiGet.mockResolvedValue(page([tapped]));
    renderPage();
    fireEvent.click(await screen.findByTestId('report-history-row'));
    const where = screen.getByTestId('where');
    expect(where.getAttribute('data-path')).toBe('/report/c9/m-open');
    const state = JSON.parse(where.textContent!);
    expect(state.backgroundLocation.pathname).toBe('/reports');
    // The row is handed over, so the overlay opens at once.
    expect(state.report.messageId).toBe('m-open');
  });

  it('makes every row one big tap target, and lets the status wrap under the words at large text', async () => {
    apiGet.mockResolvedValue(page([row()]));
    renderPage();
    const r = await screen.findByTestId('report-history-row');
    expect(r.className).toMatch(/min-h-\[72px\]/);
    expect(r.className).toMatch(/flex-wrap/);
    expect(r.className).toMatch(/w-full/);
  });
});

describe('the filter chips', () => {
  it('start on All, with a chip for each family, each with an icon and a word', async () => {
    apiGet.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByTestId('report-history-row');
    const group = screen.getByRole('group', { name: 'Show reports of one kind' });
    const chips = within(group).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([
      'All',
      'Sales & stock',
      'Tanker',
      'Money',
      'Water & supply',
      'Papers & filings',
      'MDG',
    ]);
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    expect(chips[1]).toHaveAttribute('aria-pressed', 'false');
    for (const c of chips) {
      expect(c.querySelector('svg')).not.toBeNull();
      expect(c.className).toMatch(/min-h-12/);
    }
  });

  it('ask the server for only that family\'s kinds, and mark the chosen one (a tick, not just a fill)', async () => {
    apiGet.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByTestId('report-history-row');
    apiGet.mockClear();
    apiGet.mockResolvedValue(page([row({ kind: 'credit_dod' })]));
    fireEvent.click(screen.getByTestId('reports-chip-money'));
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet).toHaveBeenCalledWith('/v1/me/reports', { kinds: 'credit_dod,ledger_watch,calibration_claim' });
    expect(screen.getByTestId('reports-chip-money')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('reports-chip-all')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('reports-chip-money').querySelector('.lucide-check')).not.toBeNull();
  });

  it('say "nothing in Money yet" when a family is empty, and "See all" goes back', async () => {
    apiGet.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByTestId('report-history-row');
    apiGet.mockResolvedValue(page([]));
    fireEvent.click(screen.getByTestId('reports-chip-money'));
    expect(await screen.findByText('Nothing in Money yet')).toBeInTheDocument();
    apiGet.mockResolvedValue(page([row()]));
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(await screen.findByTestId('report-history-row')).toBeInTheDocument();
    expect(screen.getByTestId('reports-chip-all')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('older pages', () => {
  it('loads the next page by hand with "Show earlier reports", and shows each report once', async () => {
    const first = row({ messageId: 'dup' });
    apiGet.mockResolvedValueOnce(page([first, row()], 'cursor-1'));
    renderPage();
    await screen.findAllByTestId('report-history-row');
    expect(screen.queryByTestId('reports-end')).toBeNull();
    // Page two repeats a report page one already had (a send between the two reads).
    apiGet.mockResolvedValueOnce(page([{ ...first }, row({ sentAt: '2026-01-02T04:00:00.000Z' })]));
    fireEvent.click(screen.getByTestId('reports-show-earlier'));
    await waitFor(() => expect(screen.getAllByTestId('report-history-row')).toHaveLength(3));
    expect(apiGet).toHaveBeenLastCalledWith('/v1/me/reports', { cursor: 'cursor-1' });
  });

  it('loads it by itself as the dealer nears the end of the list', async () => {
    apiGet.mockResolvedValueOnce(page([row()], 'cursor-1'));
    renderPage();
    await screen.findByTestId('report-history-row');
    apiGet.mockResolvedValueOnce(page([row()]));
    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    act(() => observers.forEach((o) => o.cb([{ isIntersecting: true }])));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(apiGet).toHaveBeenLastCalledWith('/v1/me/reports', { cursor: 'cursor-1' });
  });

  it('ends with "Older reports are in your chat" and a way to the chat, replacing this tab', async () => {
    apiGet.mockResolvedValue(page([row()]));
    renderPage();
    const end = await screen.findByTestId('reports-end');
    expect(end).toHaveTextContent('Older reports are in your chat.');
    expect(screen.queryByTestId('reports-show-earlier')).toBeNull();
    fireEvent.click(within(end).getByRole('button', { name: 'Open chat' }));
    expect(screen.getByTestId('where').getAttribute('data-path')).toBe('/chat');
  });
});

describe('when there is nothing, or it will not load', () => {
  it('says the first reports will come here, with the kinds drawn quietly', async () => {
    apiGet.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText('Your reports will come here')).toBeInTheDocument();
    expect(screen.getByText(/kept here for 30 days/)).toBeInTheDocument();
  });

  it('says it could not load, and tries again', async () => {
    apiGet.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Could not load your reports')).toBeInTheDocument();
    apiGet.mockResolvedValue(page([row()]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('report-history-row')).toBeInTheDocument();
  });

  it('keeps looking when a page comes back empty with a marker, and shows the report it finds', async () => {
    apiGet.mockResolvedValueOnce(page([], 'cursor-2'));
    apiGet.mockResolvedValueOnce(page([row({ kind: 'credit_dod' })]));
    renderPage();
    expect(await screen.findByTestId('report-history-row')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Your reports will come here')).toBeNull();
  });

  it('says it could not load when the phone has no network and nothing was ever loaded (the request is parked, not failed)', async () => {
    onlineManager.setOnline(false);
    try {
      apiGet.mockReturnValue(new Promise(() => undefined));
      renderPage();
      expect(await screen.findByText('Could not load your reports')).toBeInTheDocument();
      expect(screen.queryByTestId('reports-skeleton')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    } finally {
      act(() => onlineManager.setOnline(true));
    }
  });

  it('says "No internet. Showing what we saved" over a list it already has', async () => {
    apiGet.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.queryByTestId('reports-offline')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(await screen.findByTestId('reports-offline')).toHaveTextContent('No internet. Showing what we saved.');
    expect(screen.getByTestId('report-history-row')).toBeInTheDocument();
  });
});

describe('in the reader\'s language', () => {
  it('writes the bar, the chips and the headings in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    apiGet.mockResolvedValue(page([row({ sentAt: new Date().toISOString() })]));
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.getByText('रिपोर्ट')).toBeInTheDocument();
    expect(screen.getByTestId('reports-chip-all')).toHaveTextContent('सभी');
    expect(screen.getByTestId('reports-chip-money')).toHaveTextContent('पैसा');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('आज');
    expect(within(screen.getByTestId('report-history-row')).getByText('बिक्री रिपोर्ट (DSR)')).toBeInTheDocument();
  });

  it('writes them in Hinglish in Latin letters', async () => {
    useLangStore.setState({ lang: 'hl', explicit: true });
    apiGet.mockResolvedValue(page([row({ sentAt: new Date().toISOString() })]));
    renderPage();
    await screen.findByTestId('report-history-row');
    expect(screen.getByTestId('reports-chip-money')).toHaveTextContent('Paisa');
    expect(screen.getByText('Bikri report (DSR)')).toBeInTheDocument();
  });
});
