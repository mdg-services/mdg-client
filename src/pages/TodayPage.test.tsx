import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FETCHED_NOW,
  NOW,
  creditData,
  declarationData,
  kavach as kavachView,
  kavachItem,
  paperData,
  planData,
  salesData,
  stockData,
  supplyData,
  variationData,
  waterData,
} from '@/features/glance/glanceFixtures';
import type { KindAlert } from '@/features/reports/types';
import { myConversationsKey } from '@/hooks/api/useMyConversations';
import { useLangStore } from '@/store/lang';
import { usePushStore } from '@/store/push';
import { makeSetupView } from '@/test/setupFixtures';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type {
  KavachDealerView,
  OutletSetupView,
  OutletsView,
  ReportData,
  ReportKind,
  TodayFeed,
  TodayReport,
  TodayTask,
} from '@dk/shared/types';

/** The slice of the feed query TodayPage reads. */
interface FeedStub {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isError: boolean;
  isFetching: boolean;
  data: TodayFeed | undefined;
  dataUpdatedAt: number;
  refetch: () => void;
}

const h = vi.hoisted(() => ({
  feed: undefined as unknown as FeedStub,
  /** What Kavach's own answer holds: a view, or undefined while it is not there. */
  kavach: undefined as KavachDealerView | undefined,
  kavachLoading: false,
  setup: undefined as OutletSetupView | undefined,
  /** The setup hero stands in the verdict's place. */
  hero: false,
  outlets: undefined as OutletsView | undefined,
  layout: 'slider' as 'slider' | 'list',
  refetch: vi.fn(),
  emit: vi.fn(),
  send: vi.fn(),
  resend: vi.fn(),
  askPush: vi.fn(),
  /** Inside the phone app (the Android and iPhone shell). */
  native: false,
  /** What each kind says, by kind. A kind with no entry says nothing (null). */
  alerts: {} as Record<string, KindAlert | null>,
  headlines: {} as Record<string, string>,
  large: false,
  /** MDG's next open bill from the bills list, or none. */
  dueBill: null as { dueOn: string } | null,
}));

vi.mock('@/hooks/api/useTodayFeed', () => ({
  todayFeedKey: ['today-feed'],
  useTodayFeed: () => h.feed,
}));
vi.mock('@/hooks/api/useKavach', () => ({
  kavachKey: ['kavach', 'me'],
  useKavach: () => ({
    data: h.kavach,
    isPending: h.kavachLoading,
    fetchStatus: h.kavachLoading ? 'fetching' : 'idle',
  }),
}));
vi.mock('@/hooks/api/useSendMessage', () => ({
  NothingToSendError: class NothingToSendError extends Error {},
  useSendMessage: () => ({ mutateAsync: h.send }),
}));
vi.mock('@/features/setup/useOutletSetup', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/features/setup/useOutletSetup')),
  useOutletSetup: () => ({ data: h.setup }),
  useResendBill: () => ({ mutate: h.resend, isPending: false }),
}));
// The hero is tested with its own file; here it only has to stand in the verdict's place.
vi.mock('@/features/setup/SetupHero', () => ({
  SetupHero: () => <div data-testid="setup-hero" />,
  useSetupHeroActive: () => h.hero,
}));
vi.mock('@/features/today/useDueBill', () => ({ useDueBill: (enabled: boolean) => (enabled ? h.dueBill : null) }));
vi.mock('@/features/outlets/useOutlets', () => ({
  useOutlets: () => ({ data: h.outlets }),
  hasOtherOutlets: (v: OutletsView | undefined) => !!v?.current && v.outlets.length > 0,
}));
vi.mock('@/hooks/usePushBridge', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/hooks/usePushBridge')),
  requestPushPermission: () => h.askPush(),
}));
vi.mock('@/lib/nativeBridge', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/nativeBridge')),
  isNativeShell: () => h.native,
}));
vi.mock('@/features/today/todayConfig', () => ({
  get TODAY_WORK_LAYOUT() {
    return h.layout;
  },
}));
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => h.large, LARGE_TEXT_SCALE: 1.4, measureTextScale: () => 1 }));
// Each kind's own words are tested with the kind; here they are a table.
vi.mock('@/features/reports/registry', () => ({
  getKindView: (kind: string) => ({
    kind,
    Glyph: () => <svg data-testid={`glyph-${kind}`} />,
    Overlay: () => null,
    tile: () => null,
    alert: () => h.alerts[kind] ?? null,
    headline: () => h.headlines[kind] ?? '',
    share: () => '',
  }),
}));
vi.mock('@/lib/perfReport', () => ({ markFirstScreen: vi.fn() }));
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ emit: h.emit }) }));

const { TodayPage } = await import('./TodayPage');
const { markFirstScreen } = await import('@/lib/perfReport');

// ── fixtures ───────────────────────────────────────────────────────────────
// The clock is held at 27 Nov 2026, 9:40 am India time; the feed was read at that minute.
const snap = (kind: ReportKind): ReportData => ({ kind, v: 1 }) as unknown as ReportData;

/** A snapshot with the parts the glance model reads, for the kinds it reads; the bare envelope for the rest. */
function dataFor(kind: ReportKind): ReportData {
  const full: Partial<Record<ReportKind, unknown>> = {
    dsr_sales: salesData(),
    dsr_variation: variationData(),
    water_ingress: waterData(),
    credit_dod: creditData(),
    ro_supply: supplyData(),
    paper_expiry: paperData([{ daysLeft: 9, validUntil: '2026-12-06' }]),
    stock_check: stockData(),
    load_plan: planData(),
    declaration_filed: declarationData(),
  };
  return (full[kind] ?? snap(kind)) as ReportData;
}

/** A report WITH a snapshot (the new kind), unless `data` is overridden. */
function report(over: Partial<TodayReport> = {}): TodayReport {
  const kind = over.kind ?? 'dsr_sales';
  return {
    id: over.messageId ?? `m-${kind}`,
    kind,
    status: 'ok',
    day: '2026-11-26',
    sentAt: '2026-11-27T01:35:00.000Z',
    headline: 'Sales are in for today.',
    attachments: [],
    conversationId: 'c1',
    messageId: `m-${kind}`,
    data: dataFor(kind),
    ...over,
  };
}

/** A report from before snapshots existed: no data, a picture. */
function oldReport(over: Partial<TodayReport> = {}): TodayReport {
  return report({
    data: undefined,
    attachments: [
      {
        storageKey: 'chat/c1/card-1.png',
        filename: 'card-1.png',
        contentType: 'image/png',
        size: 1000,
        kind: 'image',
        url: 'https://s3.test/card-1?sig=1',
      },
    ],
    ...over,
  });
}

function task(over: Partial<TodayTask> = {}): TodayTask {
  return {
    id: 'ask:1',
    kind: 'ask',
    title: 'Send the density register photo',
    subtitle: 'MDG asked for it yesterday',
    since: '2026-11-25T06:00:00.000Z',
    conversationId: 'c1',
    messageId: 'm-ask',
    ...over,
  };
}

const photoTask = (over: Partial<TodayTask> = {}, acceptsFile = false) =>
  task({ action: { type: 'photo', askRef: 'doc:7', acceptsFile }, ...over });

function feed(over: Partial<TodayFeed> = {}): TodayFeed {
  return { day: '2026-11-27', role: 'owner', tasks: [], reports: [], done: [], ...over };
}

const loadedFeed = (data: TodayFeed, extra: Partial<FeedStub> = {}): FeedStub => ({
  status: 'success',
  fetchStatus: 'idle',
  isError: false,
  isFetching: false,
  data,
  dataUpdatedAt: FETCHED_NOW,
  refetch: h.refetch,
  ...extra,
});

const noFeed = (extra: Partial<FeedStub> = {}): FeedStub => ({
  status: 'pending',
  fetchStatus: 'fetching',
  isError: false,
  isFetching: true,
  data: undefined,
  dataUpdatedAt: 0,
  refetch: h.refetch,
  ...extra,
});

/** Shows where the app went, with the state it was sent with. */
function Where() {
  const loc = useLocation();
  return (
    <p data-testid="where">
      {loc.pathname}|{JSON.stringify(loc.state)}
    </p>
  );
}

function renderToday(
  route = '/',
  opts: { role?: 'dealer-owner' | 'dealer-staff'; lang?: 'en' | 'hi' | 'hl'; name?: string } = {},
) {
  signIn({ id: 'owner', role: opts.role ?? 'dealer-owner', name: opts.name ?? 'Ramesh Kumar' });
  useLangStore.setState({ lang: opts.lang ?? 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<><TodayPage /><Where /></>} />
      <Route path="/chat" element={<Where />} />
      <Route path="/chat/:id" element={<Where />} />
      <Route path="/report/:cid/:mid" element={<Where />} />
      <Route path="/reports" element={<Where />} />
      <Route path="/services" element={<Where />} />
      <Route path="/services/:serviceId" element={<Where />} />
      <Route path="/kavach" element={<Where />} />
      <Route path="/pump" element={<Where />} />
      <Route path="/pump/papers" element={<Where />} />
    </Routes>,
    { route, withRouter: true },
  );
}

const where = () => screen.getByTestId('where');
const rerenderToday = (rerender: (ui: React.ReactElement) => void) =>
  rerender(
    <Routes>
      <Route path="/" element={<><TodayPage /><Where /></>} />
    </Routes>,
  );
/** The verdict card, by its labelled region. */
const verdict = () => document.querySelector('[data-verdict]') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.kavach = undefined;
  h.kavachLoading = false;
  h.hero = false;
  h.layout = 'slider';
  h.large = false;
  h.native = false;
  // jsdom has no scrolling: the photo sheet locks the page scroll while it is open.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  h.feed = loadedFeed(feed());
  h.setup = undefined;
  h.dueBill = null;
  h.outlets = undefined;
  h.alerts = {};
  h.headlines = {};
  h.send.mockReset().mockResolvedValue({ id: 'sent-1' });
  usePushStore.setState({ pushState: 'unknown', canAskAgain: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  h.refetch.mockReset();
  h.emit.mockReset();
  h.resend.mockReset();
  h.askPush.mockReset();
  vi.mocked(markFirstScreen).mockClear();
  resetStores();
});

// ── the top of the page ────────────────────────────────────────────────────
describe('TodayPage: the top of the page', () => {
  it('is headed by the greeting, has a labelled "My pump" door, and no back arrow and no ⋮ menu', () => {
    renderToday();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Namaste, Ramesh ji');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /My pump/ }));
    expect(where()).toHaveTextContent(/^\/pump\|/);
  });

  it('no longer carries the three strips above the page: they are one notices row', () => {
    renderToday();
    expect(screen.queryByTestId('bill-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('push-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('battery-guide')).not.toBeInTheDocument();
  });

  it('counts the first screen as shown once the feed answers', () => {
    renderToday();
    expect(markFirstScreen).toHaveBeenCalled();
  });

  describe('the greeting', () => {
    it.each([
      ['en', 'Namaste, Ramesh ji'],
      ['hl', 'Namaste, Ramesh ji'],
      ['hi', 'नमस्ते, Ramesh जी'],
    ] as const)('greets the person by first name in %s', (lang, text) => {
      renderToday('/', { lang });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
    });

    it('greets in Devanagari for a name written in Devanagari', () => {
      renderToday('/', { lang: 'hi', name: 'रमेश कुमार' });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('नमस्ते, रमेश जी');
    });

    it('says just the greeting when the login has no real name, and never "Sir"', () => {
      for (const name of ['9876543210', 'Sir', 'Owner', '']) {
        cleanup();
        renderToday('/', { name });
        const h1 = screen.getByRole('heading', { level: 1 });
        expect(h1).toHaveTextContent(/^Namaste$/);
        expect(h1.textContent).not.toMatch(/\bSir\b/i);
      }
    });

    it('prints the date and when the phone checked under it, in the reader\'s language, from the feed\'s business day', () => {
      renderToday();
      expect(screen.getByTestId('today-date-line')).toHaveTextContent('Fri 27 Nov, checked 9:40 am');
      cleanup();
      renderToday('/', { lang: 'hi' });
      expect(screen.getByTestId('today-date-line')).toHaveTextContent('शुक्र 27 नवंबर, सुबह 9:40 पर जाँचा');
      cleanup();
      renderToday('/', { lang: 'hl' });
      expect(screen.getByTestId('today-date-line')).toHaveTextContent('Shukrawar 27 Nov, subah 9:40 par jaancha');
    });

    it('says "Manager" in the line for a manager, and shows the pump chip for a person with more than one pump', () => {
      h.outlets = {
        current: { userId: 'u1', dealerId: 'd1', code: '12E', role: 'dealer-owner' },
        outlets: [{ userId: 'u2', dealerId: 'd2', code: '14E', role: 'dealer-owner' }],
      } as OutletsView;
      renderToday('/', { role: 'dealer-staff', name: 'Sunil Rao' });
      expect(screen.getByTestId('today-date-line')).toHaveTextContent(/^Manager · Fri 27 Nov/);
      // The chip is a 44 px button that opens the pump sheet; the door names the pump too.
      expect(screen.getAllByRole('button', { name: /12E/ })).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'My pump, 12E' })).toBeInTheDocument();
    });

    it('is on screen while the feed is still on its way', () => {
      h.feed = noFeed();
      renderToday();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Namaste, Ramesh ji');
    });
  });

  it('headings come in the reader\'s language', () => {
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report()] }));
    renderToday('/', { lang: 'hi' });
    expect(screen.getByRole('heading', { name: /आपको करना है/ })).toBeInTheDocument();
    expect(screen.getByText('अभी पंप का हाल')).toBeInTheDocument();
    expect(screen.getByText('सभी रिपोर्ट देखें')).toBeInTheDocument();
  });

  it('speaks Latin-script Hindi for Hinglish readers', () => {
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report()] }));
    renderToday('/', { lang: 'hl' });
    expect(screen.getByRole('heading', { name: /Aapko karna hai/ })).toBeInTheDocument();
    expect(screen.getByText('Abhi pump ka haal')).toBeInTheDocument();
  });
});

// ── the verdict ────────────────────────────────────────────────────────────
describe('TodayPage: the verdict card', () => {
  it('says "All fine" with a tick when nothing waits, nothing needs a look and the feed is fresh', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    expect(verdict().getAttribute('data-verdict')).toBe('ok');
    expect(within(verdict()).getByRole('heading', { name: 'All fine' })).toBeInTheDocument();
    // A shape, never colour alone.
    expect(verdict().querySelector('svg')).not.toBeNull();
    expect(within(verdict()).getByText('as of 7:05 am')).toBeInTheDocument();
  });

  it('says how many things wait for you, names the first reasons, and shows the three plain counts', () => {
    h.feed = loadedFeed(
      feed({
        tasks: [task({ id: 't1', title: 'Send the register photo' }), task({ id: 't2', title: 'Fix the IndianOil login', kind: 'portal_login' })],
        reports: [report({ status: 'attention', kind: 'water_ingress' })],
        done: [report({ kind: 'declaration_filed', messageId: 'm-done' })],
      }),
    );
    h.alerts.water_ingress = { headline: '2 checks were missed', line: 'x', severity: 'attention' };
    renderToday();
    // 2 tasks + 1 alert row: the card says 3 wait for you (the bar's badge counts the same).
    expect(within(verdict()).getByRole('heading', { name: '2 things wait for you' })).toBeInTheDocument();
    expect(verdict().getAttribute('data-verdict')).toBe('waiting');
    // The alert that needs a look comes first, then the oldest waiting task.
    // Two reasons, one plain joining word and ONE stop (never two sentences glued with two stops).
    expect(within(verdict()).getByText('2 checks were missed and Send the register photo.')).toBeInTheDocument();
    expect(verdict()).toHaveTextContent('2 need you');
    expect(verdict()).toHaveTextContent('1 need a look');
    expect(verdict()).toHaveTextContent('1 done for you today');
  });

  it('says "1 thing waits for you" in the singular', () => {
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report()] }));
    renderToday();
    expect(within(verdict()).getByRole('heading', { name: '1 thing waits for you' })).toBeInTheDocument();
  });

  it('says how many problems, with the octagon, before anything else', () => {
    h.alerts.dsr_variation = { headline: 'Diesel 412 L short', line: 'x', severity: 'problem' };
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report({ kind: 'dsr_variation', status: 'attention' })] }));
    renderToday();
    expect(verdict().getAttribute('data-verdict')).toBe('problem');
    expect(within(verdict()).getByRole('heading', { name: '1 problem' })).toBeInTheDocument();
    expect(within(verdict()).getByText(/Diesel 412 L short/)).toBeInTheDocument();
  });

  it('says how many things need a look when a report needs a look and no task asks for it', () => {
    h.alerts.water_ingress = { headline: '2 checks were missed', line: 'x', severity: 'attention' };
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'water_ingress', status: 'attention' })] }));
    renderToday();
    expect(verdict().getAttribute('data-verdict')).toBe('attention');
    expect(within(verdict()).getByRole('heading', { name: '1 thing needs a look' })).toBeInTheDocument();
  });

  it('is never "All fine" with a late or sent-back Kavach point', () => {
    h.kavach = kavachView({ now: [kavachItem({ state: 'sent_back', sentBack: { at: '2026-11-26T05:00:00.000Z', reason: 'blurred' } as never })], counts: { sentBack: 1 } });
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    expect(within(verdict()).getByRole('heading', { name: '1 thing waits for you' })).toBeInTheDocument();
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
  });

  it('is never "All fine" when yesterday\'s sales report has not come after 11:00', () => {
    vi.setSystemTime(new Date('2026-11-27T06:30:00.000Z'));
    h.feed = loadedFeed(feed({ reports: [report({ day: '2026-11-25', data: salesData({ day: '2026-11-25' }) })] }), { dataUpdatedAt: Date.now() });
    renderToday();
    expect(within(verdict()).getByRole('heading', { name: '1 thing needs a look' })).toBeInTheDocument();
    expect(screen.getByText("Yesterday's sales report has not come yet")).toBeInTheDocument();
  });

  it('says "Cannot check right now", never "All fine", from a feed older than half an hour', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }), { dataUpdatedAt: FETCHED_NOW - 31 * 60_000 });
    renderToday();
    expect(verdict().getAttribute('data-verdict')).toBe('unknown');
    expect(within(verdict()).getByRole('heading', { name: 'Cannot check right now' })).toBeInTheDocument();
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
    // The card says when it last checked, not when the newest report came.
    expect(within(verdict()).getByText('Checked 9:09 am')).toBeInTheDocument();
  });

  it('keeps what it has and says "Checked 9:40 am, offline" when a refresh fails', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }), { isError: true, status: 'error' });
    renderToday();
    expect(screen.queryByText('Could not load Today')).not.toBeInTheDocument();
    expect(within(verdict()).getByText('Checked 9:40 am, offline')).toBeInTheDocument();
    expect(screen.getByText('Sold yesterday')).toBeInTheDocument();
  });

  it('says calmly that the first reports come after the next run, and never "All fine", for a pump with no report yet', () => {
    renderToday();
    expect(verdict().getAttribute('data-verdict')).toBe('info');
    expect(within(verdict()).getByRole('heading', { name: 'Your first reports come after the next run' })).toBeInTheDocument();
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
  });

  it('puts the setup hero in the verdict\'s place while the pump is being set up, with the notices under it', () => {
    h.hero = true;
    h.setup = makeSetupView();
    usePushStore.setState({ pushState: 'off', canAskAgain: true });
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'setup:1', kind: 'setup', title: 'Add your bill details', messageId: 'm-setup' })] }));
    renderToday();
    expect(screen.getByTestId('setup-hero')).toBeInTheDocument();
    expect(verdict()).toBeNull();
    expect(screen.getByRole('button', { name: /Notifications are off/ })).toBeInTheDocument();
    // The hero carries the setup step with its own button: it is not a Needs-you row as well.
    expect(document.querySelector('[data-task-kind="setup"]')).toBeNull();
  });

  it('keeps the hero in the verdict\'s place through the `watch` stage too (the first days under watch), and the verdict stays hidden', () => {
    // `isPumpLive('watch')` is true (the services run), but the strip is still drawn then (`stripVisible`), so the hero
    // shows and the page must not ALSO draw a verdict or list the setup step again.
    h.hero = true;
    h.setup = makeSetupView({ stage: 'watch' });
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'setup:1', kind: 'setup', title: 'Add your bill details', messageId: 'm-setup' })], reports: [report()] }));
    renderToday();
    expect(screen.getByTestId('setup-hero')).toBeInTheDocument();
    expect(verdict()).toBeNull();
    expect(document.querySelector('[data-task-kind="setup"]')).toBeNull();
  });

  it('counts the same numbers the bar shows, in the three languages', () => {
    h.feed = loadedFeed(feed({ tasks: [task(), task({ id: 'ask:2', title: 'Second' })], reports: [report()] }));
    renderToday('/', { lang: 'hi' });
    expect(within(verdict()).getByRole('heading', { name: 'आपके लिए 2 काम हैं' })).toBeInTheDocument();
    expect(verdict()).toHaveTextContent('2 आपके लिए');
    cleanup();
    renderToday('/', { lang: 'hl' });
    expect(within(verdict()).getByRole('heading', { name: 'Aapke liye 2 kaam hain' })).toBeInTheDocument();
  });

  it('shows the compact card (the word and one count line, no sentence) at large text', () => {
    h.large = true;
    h.feed = loadedFeed(feed({ tasks: [task({ title: 'Send the register photo' })], reports: [report()] }));
    renderToday();
    expect(within(verdict()).getByRole('heading', { name: '1 thing waits for you' })).toBeInTheDocument();
    expect(within(verdict()).queryByText(/Send the register photo\./)).not.toBeInTheDocument();
  });
});

// ── states ─────────────────────────────────────────────────────────────────
describe('TodayPage: loading, error, empty', () => {
  it('draws the shape of the page while the first answer is on its way', () => {
    h.feed = noFeed();
    renderToday();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(within(status).getByText(/Loading today/)).toBeInTheDocument();
    expect(markFirstScreen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /My pump/ })).toBeInTheDocument();
  });

  it('says it cannot check, with a retry, when the feed failed and nothing is in hand: never "fine"', () => {
    h.feed = noFeed({ status: 'error', fetchStatus: 'idle', isError: true, isFetching: false });
    renderToday();
    expect(verdict().getAttribute('data-verdict')).toBe('unknown');
    expect(within(verdict()).getByRole('heading', { name: 'Cannot check right now' })).toBeInTheDocument();
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing for today yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /My pump/ })).toBeInTheDocument();
    expect(markFirstScreen).toHaveBeenCalled();
  });

  it('still draws the Kavach score when the feed failed but Kavach answered', () => {
    h.feed = noFeed({ status: 'error', fetchStatus: 'idle', isError: true, isFetching: false });
    h.kavach = kavachView({ pct: 62 });
    renderToday();
    expect(within(verdict()).getByRole('heading', { name: 'Cannot check right now' })).toBeInTheDocument();
    const tile = document.querySelector('[data-pulse="score"]') as HTMLElement;
    expect(within(tile).getByText('Inspection score')).toBeInTheDocument();
    // "62%" is one run of text at the tile's big size, not a 62 with a tiny mark beside it.
    expect(within(tile).getByText('62%')).toBeInTheDocument();
  });

  it('treats a paused fetch (offline) with nothing in hand as a failure, not an empty page', () => {
    h.feed = noFeed({ fetchStatus: 'paused', isFetching: false });
    renderToday();
    expect(within(verdict()).getByRole('heading', { name: 'Cannot check right now' })).toBeInTheDocument();
  });

  it('settles a feed that is never asked for (an admin signed in here): the empty page, not grey rows for good', () => {
    h.feed = noFeed({ fetchStatus: 'idle', isFetching: false });
    renderToday();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing for today yet')).toBeInTheDocument();
    expect(markFirstScreen).toHaveBeenCalled();
  });

  it('waits for Kavach\'s own answer before drawing the fourth number, so it never flips from papers to score', () => {
    h.kavachLoading = true;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'paper_expiry' })] }));
    renderToday();
    expect(document.querySelector('[data-pulse="papers"]')).toBeNull();
    expect(document.querySelector('[data-pulse="score"]')).toBeNull();
  });

  it('survives a snapshot that has its envelope but not its parts: the tasks are still drawn, and it never says "All fine"', () => {
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report({ kind: 'dsr_sales', data: snap('dsr_sales') })] }));
    renderToday();
    expect(within(verdict()).getByRole('heading', { name: '1 thing waits for you' })).toBeInTheDocument();
    expect(screen.getByText('Send the density register photo')).toBeInTheDocument();
    cleanup();
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales', data: snap('dsr_sales') })] }));
    renderToday();
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
    expect(within(verdict()).getByRole('heading', { name: 'Cannot check right now' })).toBeInTheDocument();
  });
});

// ── Needs you ──────────────────────────────────────────────────────────────
describe('TodayPage: Needs you', () => {
  it('draws a card per task: its shape and word, a plain headline, one grey line, the service and age, one button', () => {
    h.feed = loadedFeed(
      feed({
        tasks: [task({ kind: 'du_otp', title: 'Enter the DU OTP', subtitle: 'Supply is stopped', messageId: 'm-du', id: 'du:1' })],
        reports: [report()],
      }),
    );
    renderToday();
    const card = document.querySelector('[data-task-id="du:1"]') as HTMLElement;
    expect(within(card).getByText('Enter the DU OTP')).toBeInTheDocument();
    expect(within(card).getByText('Supply is stopped')).toBeInTheDocument();
    // Which service, and how long it has waited (since 25 Nov, now 27 Nov).
    expect(within(card).getByText('DU OTP acknowledgement, waiting 2 days')).toBeInTheDocument();
    const pill = card.querySelector('[data-status="waiting"]') as HTMLElement;
    expect(pill).toHaveTextContent('Waiting for you');
    expect(pill.querySelector('svg')).not.toBeNull();
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  it('opens the chat at the box with the card\'s button', () => {
    h.feed = loadedFeed(feed({ tasks: [task({ conversationId: 'conv 9', messageId: 'm-box', kind: 'du_otp', action: { type: 'open_chat' } })], reports: [report()] }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: /Open in chat/ }));
    expect(where()).toHaveTextContent('/chat/conv%209|');
    expect(where()).toHaveTextContent('"jumpToMessageId":"m-box"');
  });

  it('reads a task with no action (an older server) as "open the chat"', () => {
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report()] }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: /Open in chat/ }));
    expect(where()).toHaveTextContent('/chat/c1|');
  });

  it('says what a login or an order box is, on its button', () => {
    h.feed = loadedFeed(
      feed({
        tasks: [
          task({ id: 'a', kind: 'portal_login', title: 'IndianOil login' }),
          task({ id: 'b', kind: 'fuel_confirm', title: 'Place this order?' }),
        ],
        reports: [report()],
      }),
    );
    renderToday();
    expect(screen.getByRole('button', { name: /Fix login/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /See the order/ })).toBeInTheDocument();
  });

  it('says a task has been waiting a while, with a shape and a word', () => {
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'late:1', late: true }), task({ id: 'new:1' })], reports: [report()] }));
    renderToday();
    const late = document.querySelector('[data-task-id="late:1"]') as HTMLElement;
    // Posted 25 Nov, now 27 Nov: the pill itself says how long, and the small print does not say it again.
    expect(within(late).getByText('Waiting 2 days')).toBeInTheDocument();
    expect(within(late).queryByText(/waiting 2 days/i, { selector: 'p' })).not.toBeInTheDocument();
    expect(late.querySelector('svg')).not.toBeNull();
    const fresh = document.querySelector('[data-task-id="new:1"]') as HTMLElement;
    expect(within(fresh).queryByText(/^Waiting \d+ days?$/)).not.toBeInTheDocument();
  });

  it('says "Waiting a while" only when a late task has not yet waited a whole day, and the days in Hindi', () => {
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'late:0', late: true, since: '2026-11-27T02:00:00.000Z' })], reports: [report()] }));
    renderToday();
    expect(within(document.querySelector('[data-task-id="late:0"]') as HTMLElement).getByText('Waiting a while')).toBeInTheDocument();
    cleanup();
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'late:2', late: true })], reports: [report()] }));
    renderToday('/', { lang: 'hi' });
    expect(within(document.querySelector('[data-task-id="late:2"]') as HTMLElement).getByText('2 दिन से बाकी')).toBeInTheDocument();
    cleanup();
    renderToday('/', { lang: 'hl' });
    expect(within(document.querySelector('[data-task-id="late:2"]') as HTMLElement).getByText('2 din se baaki')).toBeInTheDocument();
  });

  it('puts late work first, then problems, then what needs a look, then the newest', () => {
    h.alerts.dsr_variation = { headline: 'Diesel 412 L short', line: 'x', severity: 'problem' };
    h.alerts.water_ingress = { headline: '2 checks were missed', line: 'x', severity: 'attention' };
    h.feed = loadedFeed(
      feed({
        tasks: [task({ id: 'new:1', title: 'Newer task', since: '2026-11-27T01:00:00.000Z' }), task({ id: 'late:1', title: 'Late task', late: true })],
        reports: [report({ kind: 'water_ingress', status: 'attention' }), report({ kind: 'dsr_variation', status: 'attention' })],
      }),
    );
    renderToday();
    const order = Array.from(document.querySelectorAll('[data-testid="today-work-slide"] p.text-subheading')).map((p) => p.textContent);
    expect(order).toEqual(['Late task', 'Diesel 412 L short', '2 checks were missed', 'Newer task']);
  });

  it('shows the work one card at a time: every card is there, ‹ "1 of 5" › moves between them', () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => task({ id: `t${n}`, title: `Task ${n}`, since: `2026-11-2${n}T06:00:00.000Z` }));
    h.feed = loadedFeed(feed({ tasks, reports: [report()] }));
    renderToday();
    const slider = screen.getByTestId('today-work-slider');
    expect(slider).toHaveAttribute('aria-roledescription', 'slider');
    // Every card is a real, reachable slide (no "N more" to tap).
    expect(within(slider).getAllByTestId('today-work-slide')).toHaveLength(5);
    expect(within(slider).getByRole('group', { name: '1 of 5' })).toHaveTextContent('Task 5');
    expect(screen.queryByRole('button', { name: /^\d+ more$/ })).not.toBeInTheDocument();
    const position = screen.getByTestId('today-work-position');
    expect(position).toHaveTextContent('1 of 5');
    expect(position).toHaveAttribute('aria-live', 'polite');
    const prev = screen.getByRole('button', { name: 'Previous task' });
    const next = screen.getByRole('button', { name: 'Next task' });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    expect(position).toHaveTextContent('2 of 5');
    expect(prev).toBeEnabled();
    for (let i = 0; i < 3; i++) fireEvent.click(next);
    expect(position).toHaveTextContent('5 of 5');
    expect(next).toBeDisabled();
    fireEvent.click(prev);
    expect(position).toHaveTextContent('4 of 5');
  });

  it('draws one card with no ‹ › row, and keeps the count in range when a card leaves', () => {
    const two = [1, 2].map((n) => task({ id: `t${n}`, title: `Task ${n}` }));
    h.feed = loadedFeed(feed({ tasks: two, reports: [report()] }));
    const { rerender } = renderToday();
    fireEvent.click(screen.getByRole('button', { name: 'Next task' }));
    expect(screen.getByTestId('today-work-position')).toHaveTextContent('2 of 2');
    h.feed = loadedFeed(feed({ tasks: [two[0]!], reports: [report()] }));
    rerenderToday(rerender);
    expect(screen.getAllByTestId('today-work-slide')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Next task' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-work-position')).not.toBeInTheDocument();
  });

  it('says plainly that nothing needs you, with a tick, when the pump is fine and nothing waits', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const section = screen.getByTestId('today-needs');
    expect(within(section).getByRole('heading', { name: 'Needs you' })).toBeInTheDocument();
    expect(within(section).getByText('Nothing needs you right now')).toBeInTheDocument();
    expect(section.querySelector('svg')).not.toBeNull();
    expect(screen.queryByTestId('today-work-slider')).not.toBeInTheDocument();
  });

  it('does not say "nothing needs you" when it cannot check', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }), { dataUpdatedAt: FETCHED_NOW - 60 * 60_000 });
    renderToday();
    expect(screen.queryByText('Nothing needs you right now')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-needs')).not.toBeInTheDocument();
  });

  it('does not repeat the setup step as a row while the setup hero carries it', () => {
    h.hero = true;
    h.setup = makeSetupView();
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'setup:1', kind: 'setup', title: 'Add your bill details', messageId: 'm-setup' })], reports: [report()] }));
    renderToday();
    expect(screen.getByTestId('setup-hero')).toBeInTheDocument();
    expect(document.querySelector('[data-task-kind="setup"]')).toBeNull();
    // No "nothing needs you" under an open setup step.
    expect(screen.queryByText('Nothing needs you right now')).not.toBeInTheDocument();
  });

  it('lists the setup task as a row once the pump is live', () => {
    h.setup = makeSetupView({ stage: 'live' });
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'setup:1', kind: 'setup', title: 'Add your bill details' })], reports: [report()] }));
    renderToday();
    expect(document.querySelector('[data-task-kind="setup"]')).not.toBeNull();
  });

  it('opens Kavach from a Kavach row, with a button that says so', () => {
    h.kavach = kavachView({ now: [kavachItem({ code: 'kv1', late: true, state: 'todo', titleEn: 'Fire extinguisher photo' })], counts: { late: 1 } });
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const row = document.querySelector('[data-needs-source="kavach"]') as HTMLElement;
    expect(within(row).getByText('Kavach point is late: Fire extinguisher photo')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: /Open Kavach/ }));
    expect(where()).toHaveTextContent(/^\/kavach\|/);
  });

  describe('one home for the Kavach numbers: Today reads the list the Kavach page draws, for the signed-in role', () => {
    // The rich local data: a manager's daily job is late, the owner's own work is not.
    const managersLate = () =>
      kavachView({
        pct: 6,
        now: [kavachItem({ code: 'first-aid-box', titleEn: 'Keep first-aid box stocked', uploader: 'manager', late: true, everyDays: 365 })],
        counts: { late: 1, todo: 35 },
      });

    it('does not tell the owner that his manager\'s late job is late (the Kavach page lists it under the manager\'s jobs)', () => {
      h.kavach = managersLate();
      h.feed = loadedFeed(feed({ reports: [report()] }));
      renderToday('/', { role: 'dealer-owner' });
      expect(document.querySelector('[data-needs-source="kavach"]')).toBeNull();
      expect(verdict().textContent).not.toMatch(/first-aid/i);
      const tile = document.querySelector('[data-pulse="score"]') as HTMLElement;
      expect(tile.textContent).not.toMatch(/late/);
      expect(within(tile).getByText('Nothing to do today')).toBeInTheDocument();
    });

    it('tells the manager, whose job it is, on the row, in the sentence and on the tile', () => {
      h.kavach = managersLate();
      h.feed = loadedFeed(feed({ role: 'manager', reports: [report()] }));
      renderToday('/', { role: 'dealer-staff' });
      const row = document.querySelector('[data-needs-source="kavach"]') as HTMLElement;
      expect(within(row).getByText('Kavach point is late: Keep first-aid box stocked')).toBeInTheDocument();
      const tile = document.querySelector('[data-pulse="score"]') as HTMLElement;
      expect(tile.textContent).toMatch(/1 late/);
    });
  });

  describe('large text', () => {
    it('stacks the Needs-you cards instead of the slider, so no card is stretched to the tallest one', () => {
      h.large = true;
      h.feed = loadedFeed(feed({ tasks: [task({ id: 't1', title: 'Task 1' }), task({ id: 't2', title: 'Task 2' })], reports: [report()] }));
      renderToday();
      expect(screen.queryByTestId('today-work-slider')).not.toBeInTheDocument();
      expect(screen.getByTestId('today-work-list')).toBeInTheDocument();
    });

    it('keeps the slider at normal text (owner decision Q1)', () => {
      h.feed = loadedFeed(feed({ tasks: [task({ id: 't1', title: 'Task 1' }), task({ id: 't2', title: 'Task 2' })], reports: [report()] }));
      renderToday();
      expect(screen.getByTestId('today-work-slider')).toBeInTheDocument();
    });
  });

  describe('the list layout (owner decision Q1, behind one switch)', () => {
    beforeEach(() => {
      h.layout = 'list';
    });

    it('draws up to four rows and "N more" for the rest, with no slider', () => {
      const tasks = [1, 2, 3, 4, 5, 6].map((n) => task({ id: `t${n}`, title: `Task ${n}`, since: `2026-11-2${n}T06:00:00.000Z` }));
      h.feed = loadedFeed(feed({ tasks, reports: [report()] }));
      renderToday();
      expect(screen.queryByTestId('today-work-slider')).not.toBeInTheDocument();
      const list = screen.getByRole('list', { name: /Needs you/ });
      expect(within(list).getAllByRole('listitem')).toHaveLength(4);
      fireEvent.click(screen.getByRole('button', { name: '2 more' }));
      expect(within(list).getAllByRole('listitem')).toHaveLength(6);
      fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
      expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    });

    it('answers a photo ask inside its row, exactly as the slider does', async () => {
      h.feed = loadedFeed(feed({ tasks: [photoTask()], reports: [report()] }));
      renderToday();
      fireEvent.change(screen.getByTestId('today-photo-input-ask:1'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
      fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
      const row = document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(row).findByText('Sent. We are checking.')).toBeInTheDocument();
      expect(h.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('a photo ask answered from Today', () => {
    const photoFile = () => new File(['x'], 'forecourt.jpg', { type: 'image/jpeg' });
    const pickPhoto = (id = 'ask:1', file: File = photoFile()) => {
      fireEvent.change(screen.getByTestId(`today-photo-input-${id}`), { target: { files: [file] } });
      return file;
    };
    /** Pick, then press "Send" on the sheet that holds the photo. */
    const pickAndSend = (id = 'ask:1', file: File = photoFile()) => {
      pickPhoto(id, file);
      fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
      return file;
    };

    beforeEach(() => {
      h.feed = loadedFeed(feed({ tasks: [photoTask()], reports: [report()] }));
    });

    it('labels the button "Send photo" and has the one picker that offers camera and gallery', () => {
      renderToday();
      const card = document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(within(card).getByRole('button', { name: /Send photo/ })).toBeInTheDocument();
      const input = screen.getByTestId('today-photo-input-ask:1') as HTMLInputElement;
      expect(input.type).toBe('file');
      // `capture` would force the camera and shut out a photo already taken.
      expect(input).not.toHaveAttribute('capture');
      expect(input.accept).toBe('image/*');
    });

    it('opens the picker from the button, in the same tap', () => {
      renderToday();
      const input = screen.getByTestId('today-photo-input-ask:1') as HTMLInputElement;
      const click = vi.spyOn(input, 'click');
      fireEvent.click(screen.getByRole('button', { name: /Send photo/ }));
      expect(click).toHaveBeenCalledTimes(1);
    });

    it('sends the photo into the ask\'s chat as the answer, without leaving Today', async () => {
      renderToday();
      const file = pickAndSend();
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      const vars = h.send.mock.calls[0]![0];
      expect(vars.conversationId).toBe('c1');
      expect(vars.answersAsk).toBe('doc:7');
      expect(vars.files).toHaveLength(1);
      expect(vars.files[0]).toMatchObject({ kind: 'image', contentType: 'image/jpeg' });
      expect(vars.files[0].file).toBe(file);
      // Still on Today.
      expect(where()).toHaveTextContent(/^\/\|/);
    });

    it('turns the card into "Sent. We are checking." on success', async () => {
      renderToday();
      pickAndSend();
      const card = document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card).findByText('Sent. We are checking.')).toBeInTheDocument();
      expect(card.querySelector('[data-photo-state="sent"]')).not.toBeNull();
      // The picture button is gone: a second photo cannot be sent by accident.
      expect(within(card).queryByRole('button', { name: /Send photo/ })).not.toBeInTheDocument();
      // A way to see it in the chat stays.
      fireEvent.click(within(card).getByRole('button', { name: 'See in chat' }));
      expect(where()).toHaveTextContent('/chat/c1|');
    });

    it('shows it is sending while the upload runs', async () => {
      let finish: (v: unknown) => void = () => {};
      h.send.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      renderToday();
      pickAndSend();
      const card = document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card).findByText('Sending the photo…')).toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: /Send photo/ })).not.toBeInTheDocument();
      await act(async () => finish({ id: 'sent-1' }));
      expect(await within(card).findByText('Sent. We are checking.')).toBeInTheDocument();
    });

    it('says the photo did not go, and "Try again" sends the same photo again', async () => {
      h.send.mockRejectedValueOnce(new Error('upload failed'));
      renderToday();
      const file = pickAndSend();
      const card = document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card).findByText('The photo did not go.')).toBeInTheDocument();
      expect(card.querySelector('[data-photo-state="failed"]')).not.toBeNull();

      fireEvent.click(within(card).getByRole('button', { name: 'Try again' }));
      expect(await within(card).findByText('Sent. We are checking.')).toBeInTheDocument();
      expect(h.send).toHaveBeenCalledTimes(2);
      // The same file, not a new pick.
      expect(h.send.mock.calls[1]![0].files[0].file).toBe(file);
      expect(h.send.mock.calls[1]![0].answersAsk).toBe('doc:7');
    });

    it('sends nothing when the picker is cancelled', () => {
      renderToday();
      fireEvent.change(screen.getByTestId('today-photo-input-ask:1'), { target: { files: [] } });
      expect(h.send).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Send photo/ })).toBeInTheDocument();
    });

    it('does not send twice while the first is still going', async () => {
      h.send.mockReturnValue(new Promise(() => {}));
      renderToday();
      pickAndSend();
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      pickAndSend();
      expect(h.send).toHaveBeenCalledTimes(1);
    });

    it('keeps saying "Sent" if the feed refreshes and still lists the ask for a moment', async () => {
      const { rerender } = renderToday();
      pickAndSend();
      const card = () => document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card()).findByText('Sent. We are checking.')).toBeInTheDocument();
      h.feed = loadedFeed(feed({ tasks: [photoTask()], reports: [report()] }));
      rerender(
        <Routes>
          <Route path="/" element={<><TodayPage /><Where /></>} />
        </Routes>,
      );
      expect(within(card()).getByText('Sent. We are checking.')).toBeInTheDocument();
    });

    it('holds the picked photo on a sheet and sends nothing until "Send"', async () => {
      renderToday();
      const file = pickPhoto();
      const sheet = screen.getByTestId('today-photo-confirm');
      expect(sheet).toHaveAttribute('role', 'dialog');
      expect(within(sheet).getByText('Send this photo?')).toBeInTheDocument();
      expect(within(sheet).getByRole('button', { name: 'Send' })).toBeInTheDocument();
      expect(h.send).not.toHaveBeenCalled();
      // The card still offers the button: nothing was filed.
      expect(screen.getByRole('button', { name: /Send photo/ })).toBeInTheDocument();
      fireEvent.click(within(sheet).getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(h.send.mock.calls[0]![0].files[0].file).toBe(file);
      expect(screen.queryByTestId('today-photo-confirm')).not.toBeInTheDocument();
    });

    it('"Choose another" swaps the held photo, and closing the sheet sends nothing', async () => {
      renderToday();
      pickPhoto();
      const other = new File(['y'], 'second.jpg', { type: 'image/jpeg' });
      const input = screen.getByTestId('today-photo-confirm-input') as HTMLInputElement;
      const click = vi.spyOn(input, 'click');
      fireEvent.click(screen.getByRole('button', { name: 'Choose another' }));
      expect(click).toHaveBeenCalledTimes(1);
      fireEvent.change(input, { target: { files: [other] } });
      fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(h.send.mock.calls[0]![0].files[0].file).toBe(other);

      cleanup();
      h.send.mockClear();
      renderToday();
      pickPhoto();
      fireEvent.keyDown(screen.getByTestId('today-photo-confirm'), { key: 'Escape' });
      expect(screen.queryByTestId('today-photo-confirm')).not.toBeInTheDocument();
      expect(h.send).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /Send photo/ })).toBeInTheDocument();
    });

    it('shows the ask again with its button when MDG sends the photo back (same ask, a newer message and a reason)', async () => {
      const { rerender } = renderToday();
      pickAndSend();
      const card = () => document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card()).findByText('Sent. We are checking.')).toBeInTheDocument();
      h.feed = loadedFeed(
        feed({
          tasks: [photoTask({ messageId: 'm-ask-2', subtitle: 'The photo is blurred' })],
          reports: [report()],
        }),
      );
      rerender(
        <Routes>
          <Route path="/" element={<><TodayPage /><Where /></>} />
        </Routes>,
      );
      expect(within(card()).queryByText('Sent. We are checking.')).not.toBeInTheDocument();
      expect(within(card()).getByText('The photo is blurred')).toBeInTheDocument();
      expect(within(card()).getByRole('button', { name: /Send photo/ })).toBeInTheDocument();
    });

    it('forgets a "sent" mark once the ask leaves the feed, so the same ask coming back starts clean', async () => {
      const { rerender } = renderToday();
      pickAndSend();
      const card = () => document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card()).findByText('Sent. We are checking.')).toBeInTheDocument();
      const routes = () => (
        <Routes>
          <Route path="/" element={<><TodayPage /><Where /></>} />
        </Routes>
      );
      // The ask leaves (answered) ...
      h.feed = loadedFeed(feed({ tasks: [], reports: [report()] }));
      rerender(routes());
      expect(document.querySelector('[data-task-id="ask:1"]')).toBeNull();
      // ... and comes back as the very same message and words (a nudge, say): it is a fresh ask.
      h.feed = loadedFeed(feed({ tasks: [photoTask()], reports: [report()] }));
      rerender(routes());
      expect(within(card()).getByRole('button', { name: /Send photo/ })).toBeInTheDocument();
      expect(within(card()).queryByText('Sent. We are checking.')).not.toBeInTheDocument();
    });

    it('refuses something that is not a picture, and offers the picker again', async () => {
      renderToday();
      pickPhoto('ask:1', new File(['x'], 'sheet.xlsx', { type: 'application/vnd.ms-excel' }));
      const card = document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card).findByText('The photo did not go.')).toBeInTheDocument();
      expect(h.send).not.toHaveBeenCalled();
      const input = screen.getByTestId('today-photo-input-ask:1') as HTMLInputElement;
      const click = vi.spyOn(input, 'click');
      fireEvent.click(within(card).getByRole('button', { name: 'Try again' }));
      expect(click).toHaveBeenCalledTimes(1);
    });

    it('lets a PDF through for an ask that takes a paper, and says so on the button', async () => {
      h.feed = loadedFeed(feed({ tasks: [photoTask({}, true)], reports: [report()] }));
      renderToday();
      expect(screen.getByRole('button', { name: /Send photo or PDF/ })).toBeInTheDocument();
      expect((screen.getByTestId('today-photo-input-ask:1') as HTMLInputElement).accept).toContain('application/pdf');
      pickAndSend('ask:1', new File(['x'], 'noc.pdf', { type: 'application/pdf' }));
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(h.send.mock.calls[0]![0].files[0]).toMatchObject({ kind: 'file', contentType: 'application/pdf' });
    });

    it('an ask that takes only a photo refuses a PDF', async () => {
      renderToday();
      pickPhoto('ask:1', new File(['x'], 'noc.pdf', { type: 'application/pdf' }));
      const card = document.querySelector('[data-task-id="ask:1"]') as HTMLElement;
      expect(await within(card).findByText('The photo did not go.')).toBeInTheDocument();
      expect(h.send).not.toHaveBeenCalled();
    });

    it('has no picker on a box that is not a photo ask', () => {
      h.feed = loadedFeed(feed({ tasks: [task({ action: { type: 'open_chat' } })], reports: [report()] }));
      renderToday();
      expect(screen.queryByTestId('today-photo-input-ask:1')).not.toBeInTheDocument();
    });

    it('speaks Hindi on the card and on the sheet', async () => {
      renderToday('/', { lang: 'hi' });
      expect(screen.getByRole('button', { name: /फ़ोटो भेजें/ })).toBeInTheDocument();
      pickPhoto();
      expect(within(screen.getByTestId('today-photo-confirm')).getByText('यह फ़ोटो भेजें?')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
      expect(await screen.findByText('भेज दिया। हम जाँच रहे हैं।')).toBeInTheDocument();
    });
  });
});

// ── a report that needs a look is a row of Needs you ───────────────────────
describe('TodayPage: what needs a look is a row of Needs you', () => {
  const water: KindAlert = { headline: '2 checks were missed', line: 'They cannot be recorded now.', severity: 'attention' };
  const variation: KindAlert = { headline: 'Diesel 412 L short', line: 'Your stock is below the limit.', severity: 'problem' };

  it('draws a row per alert: the shape and word, the kind\'s headline and line, its service, and one button', () => {
    h.alerts.dsr_variation = variation;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', status: 'attention' })] }));
    renderToday();
    const card = document.querySelector('[data-needs-id="alert:m-dsr_variation"]') as HTMLElement;
    expect(within(card).getByText('Diesel 412 L short')).toBeInTheDocument();
    expect(within(card).getByText('Your stock is below the limit.')).toBeInTheDocument();
    expect(within(card).getByText('Daily Sales Report')).toBeInTheDocument();
    // Shape and word, never colour alone.
    const badge = card.querySelector('[data-status="problem"]') as HTMLElement;
    expect(badge).toHaveTextContent('Problem');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  describe('a thing is shown once', () => {
    const duTask = () =>
      task({ id: 'du-box', kind: 'du_otp', title: 'Do the DU OTP', action: { type: 'open_chat' }, messageId: 'm-du-box' });

    it('drops the DU OTP alert while the DU OTP steps are a row', () => {
      h.alerts.du_otp = { headline: 'A dispenser paper is due', line: 'x', severity: 'attention' };
      h.alerts.dsr_variation = variation;
      h.feed = loadedFeed(feed({ tasks: [duTask()], reports: [report({ kind: 'du_otp', status: 'attention' }), report({ kind: 'dsr_variation', status: 'attention' })] }));
      renderToday();
      expect(screen.getByText('Do the DU OTP')).toBeInTheDocument();
      expect(screen.queryByText('A dispenser paper is due')).not.toBeInTheDocument();
      // The other alert is still there.
      expect(screen.getByText('Diesel 412 L short')).toBeInTheDocument();
      expect(document.querySelector('[data-needs-id="alert:m-du_otp"]')).toBeNull();
    });

    it('keeps the alert when the box is not open', () => {
      h.alerts.du_otp = { headline: 'A dispenser paper is due', line: 'x', severity: 'attention' };
      h.feed = loadedFeed(feed({ reports: [report({ kind: 'du_otp', status: 'attention' })] }));
      renderToday();
      expect(screen.getByText('A dispenser paper is due')).toBeInTheDocument();
    });

    it('does not list the covered words-only warning again, in the new reports either', () => {
      h.feed = loadedFeed(
        feed({
          tasks: [duTask()],
          reports: [oldReport({ kind: 'du_otp', status: 'attention', headline: 'A paper is due.' })],
        }),
      );
      renderToday();
      expect(screen.getByText('Do the DU OTP')).toBeInTheDocument();
      expect(screen.queryByText('A paper is due.')).not.toBeInTheDocument();
      expect(document.querySelector('[data-report-kind="du_otp"]')).toBeNull();
    });

    it('does not list a report again under New reports when a Needs-you row already opens it', () => {
      h.alerts.dsr_variation = variation;
      h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', status: 'attention' }), report({ kind: 'dsr_sales' })] }));
      renderToday();
      // Nothing is done yet, so the card is the new reports and nothing else.
      const newReports = screen.getByRole('region', { name: 'New reports' });
      expect(within(newReports).getAllByRole('button', { name: /Daily sales|Sales are in/ })).toHaveLength(1);
      expect(newReports.querySelector('[data-report-kind="dsr_variation"]')).toBeNull();
    });
  });

  it('"See details" opens the report screen for that exact message', () => {
    h.alerts.dsr_variation = variation;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', status: 'attention', conversationId: 'conv 9', messageId: 'm-var' })] }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: /See details/ }));
    expect(where()).toHaveTextContent('/report/conv%209/m-var|');
  });

  it('does not mark the report read while the page is hidden', () => {
    h.alerts.dsr_variation = variation;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', status: 'attention', messageId: 'm-var' })] }));
    renderToday();
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      fireEvent.click(screen.getByRole('button', { name: /See details/ }));
      expect(h.emit).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('emits "read" for the message when the page is on screen', () => {
    h.alerts.dsr_variation = variation;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', status: 'attention', messageId: 'm-var' })] }));
    renderToday();
    expect(h.emit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /See details/ }));
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledWith('read', { conversationId: 'c1', messageIds: ['m-var'] });
  });

  it('shows an old report that was marked "needs a look" in the team\'s words, once', () => {
    h.feed = loadedFeed(
      feed({ reports: [oldReport({ kind: 'credit_dod', messageId: 'm-credit', status: 'attention', headline: 'Credit is over the limit.' })] }),
    );
    renderToday();
    const cards = document.querySelectorAll('[data-needs-id="alert:m-credit"]');
    expect(cards).toHaveLength(1);
    expect(within(cards[0] as HTMLElement).getByText('Credit & DOD')).toBeInTheDocument();
    expect(within(cards[0] as HTMLElement).getByText('Credit is over the limit.')).toBeInTheDocument();
  });

  it('keeps an owner\'s alert from a manager', () => {
    h.alerts.credit_dod = { headline: 'Rs 2,30,000 overdue', line: 'x', severity: 'problem' };
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report({ kind: 'credit_dod', status: 'attention' })] }));
    renderToday('/', { role: 'dealer-staff' });
    expect(screen.queryByText('Rs 2,30,000 overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('Deposit to the oil company')).not.toBeInTheDocument();
  });

  it('draws the alert in Hindi when the kind says it in Hindi', () => {
    h.alerts.water_ingress = { headline: '2 जाँच छूट गईं', line: 'अब रिकॉर्ड नहीं हो सकतीं।', severity: 'attention' };
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'water_ingress', status: 'attention' })] }));
    renderToday('/', { lang: 'hi' });
    const card = document.querySelector('[data-needs-id="alert:m-water_ingress"]') as HTMLElement;
    expect(within(card).getByText('2 जाँच छूट गईं')).toBeInTheDocument();
    expect(card.querySelector('[data-status="attention"]')).toHaveTextContent('ध्यान दें');
    expect(screen.getByRole('button', { name: /विवरण देखें/ })).toBeInTheDocument();
  });

  it('draws nothing to flag while setup has not started', () => {
    h.hero = true;
    h.setup = makeSetupView();
    h.feed = loadedFeed(feed({ tasks: [task()] }));
    renderToday();
    expect(screen.queryByText('Needs a look')).not.toBeInTheDocument();
  });

  it('lets the water alert and the same facts in a tile be said once: the tile\'s warning is left out', () => {
    h.alerts.water_ingress = water;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'water_ingress', status: 'attention', data: waterData({ recorded: 10, total: 12, missed: 2 }) })] }));
    renderToday();
    // Manager-style fourth slot is the water tile: no "Needs a look" pill inside it.
    const tile = document.querySelector('[data-pulse="water"]') as HTMLElement;
    expect(tile.querySelector('[data-status]')).toBeNull();
  });
});

// ── the four numbers ───────────────────────────────────────────────────────
describe('TodayPage: the four numbers', () => {
  const kinds = (): TodayReport[] => [
    report({ kind: 'dsr_sales', messageId: 'm-sales' }),
    report({ kind: 'dsr_variation', messageId: 'm-var', data: variationData({ offL: 98 }) }),
    report({ kind: 'credit_dod', messageId: 'm-credit' }),
    report({ kind: 'water_ingress', messageId: 'm-water' }),
    report({ kind: 'paper_expiry', messageId: 'm-paper' }),
  ];
  const order = () => Array.from(document.querySelectorAll('[data-pulse]')).map((el) => el.getAttribute('data-pulse'));

  it('lays the tiles out in the one fixed order for an owner: sales, variation, deposit, score', () => {
    h.kavach = kavachView();
    h.feed = loadedFeed(feed({ reports: kinds() }));
    renderToday();
    expect(order()).toEqual(['sales', 'variation', 'deposit', 'score']);
  });

  it('puts the papers in the fourth place while Kavach is off, and the water checks in the third for a manager', () => {
    h.feed = loadedFeed(feed({ reports: kinds() }));
    renderToday();
    expect(order()).toEqual(['sales', 'variation', 'deposit', 'papers']);
    cleanup();
    h.feed = loadedFeed(feed({ role: 'manager', reports: kinds().filter((r) => r.kind !== 'credit_dod') }));
    renderToday('/', { role: 'dealer-staff' });
    expect(order()).toEqual(['sales', 'variation', 'water', 'papers']);
  });

  it('closes the grid up over a slot with no source, and keeps the order when the statuses change', () => {
    h.kavach = kavachView({ now: [kavachItem({ late: true })], counts: { late: 1 } });
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', data: variationData({ offL: 98 }) }), report({ kind: 'dsr_sales' })] }));
    renderToday();
    expect(order()).toEqual(['sales', 'variation', 'score']);
  });

  it('draws the sales tile: litres, the change on the same weekday last week, seven bars, as-of in words', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' })] }));
    renderToday();
    const tile = document.querySelector('[data-pulse="sales"]') as HTMLElement;
    expect(within(tile).getByText('Sales')).toBeInTheDocument();
    // (The same figure is in the chart's hidden table for a screen reader.)
    expect(within(tile).getAllByText('24,000').length).toBeGreaterThan(0);
    expect(within(tile).getByText('Sold yesterday')).toBeInTheDocument();
    // 24,000 against 22,000 the Thursday before: 9% more, an arrow shape and the words.
    expect(within(tile).getByText('9% more than last Thursday')).toBeInTheDocument();
    expect(within(tile).getByRole('img', { name: 'Last 7 days, highest 24,000 L on Thu 26 Nov' })).toBeInTheDocument();
    expect(within(tile).getByText('today 7:05 am')).toBeInTheDocument();
  });

  it('says "from yesterday" on a figure that was sent yesterday', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales', sentAt: '2026-11-26T01:35:00.000Z' })] }));
    renderToday();
    expect(within(document.querySelector('[data-pulse="sales"]') as HTMLElement).getByText('from yesterday')).toBeInTheDocument();
  });

  it('draws the variation tile with one line per fuel, a warning only on the fuel beyond its limit', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', data: variationData({ offL: 98 }) })] }));
    renderToday();
    const tile = document.querySelector('[data-pulse="variation"]') as HTMLElement;
    expect(within(tile).getByText('Variation')).toBeInTheDocument();
    expect(within(tile).getByText('98 L beyond the limit')).toBeInTheDocument();
    const warn = tile.querySelector('[data-status="attention"]') as HTMLElement;
    expect(warn).toHaveTextContent('Needs a look');
    expect(warn.querySelector('svg')).not.toBeNull();
    cleanup();
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', data: variationData({ offL: 0 }) })] }));
    renderToday();
    const fine = document.querySelector('[data-pulse="variation"]') as HTMLElement;
    expect(within(fine).getByText('Inside the limit')).toBeInTheDocument();
    expect(fine.querySelector('[data-status]')).toBeNull();
  });

  it('speaks Hindi and Hinglish on the tiles and the cards, with no English in the Hindi', () => {
    h.kavach = kavachView({ pct: 62, now: [kavachItem(), kavachItem({ state: 'sent_back', sentBack: { at: '2026-11-26T05:00:00.000Z', reason: 'blurred' } as never }), kavachItem({ state: 'sent_back', sentBack: { at: '2026-11-26T05:00:00.000Z', reason: 'blurred' } as never })], counts: { todo: 9, sentBack: 2 } });
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' }), report({ kind: 'dsr_variation', data: variationData({ offL: 98 }) }), report({ kind: 'water_ingress' })] }));
    renderToday('/', { lang: 'hi' });
    const tiles = screen.getByTestId('today-tiles');
    expect(within(tiles).getByText('बिक्री')).toBeInTheDocument();
    expect(within(tiles).getByText('98 लीटर सीमा से बाहर')).toBeInTheDocument();
    expect(within(tiles).getAllByText('आज सुबह 7:05').length).toBeGreaterThan(0);
    // The reader's own count from the list (3 jobs for today, 2 of them sent back), never the open total (9):
    // the very numbers the Kavach page's score card shows.
    expect(within(tiles).getByText('आज के 3 काम बाकी, 2 वापस आए')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'अभी पंप का हाल' })).toBeInTheDocument();
    cleanup();
    renderToday('/', { lang: 'hl' });
    expect(within(screen.getByTestId('today-tiles')).getByText('98 L seema se bahar')).toBeInTheDocument();
    expect(within(screen.getByTestId('today-tiles')).getAllByText('Aaj subah 7:05').length).toBeGreaterThan(0);
  });

  it('draws the deposit tile for the owner only: the amount, the date, days left counted now, the limit bar', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'credit_dod', data: creditData({ date: '2026-11-30', amount: 118_000, usedPct: 71 }) })] }));
    renderToday();
    const tile = document.querySelector('[data-pulse="deposit"]') as HTMLElement;
    expect(within(tile).getByText('Deposit to the oil company')).toBeInTheDocument();
    expect(within(tile).getByText('Rs 1,18,000')).toBeInTheDocument();
    expect(within(tile).getByText('by Mon 30 Nov')).toBeInTheDocument();
    expect(within(tile).getByText('3 days left')).toBeInTheDocument();
    expect(within(tile).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '71');
    expect(within(tile).getByText('71% of the limit used')).toBeInTheDocument();
  });

  it('recounts the days left from the date, never from the frozen count in the snapshot', () => {
    // The snapshot froze "3 days left" on 26 Nov; today is 27 Nov and the date is 30 Nov.
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'credit_dod', data: creditData({ date: '2026-11-30', daysLeft: 3 }) })] }));
    renderToday();
    expect(within(document.querySelector('[data-pulse="deposit"]') as HTMLElement).getByText('3 days left')).toBeInTheDocument();
    cleanup();
    vi.setSystemTime(new Date('2026-11-29T04:10:00.000Z'));
    h.feed = loadedFeed(feed({ day: '2026-11-29', reports: [report({ kind: 'credit_dod', data: creditData({ date: '2026-11-30', daysLeft: 3 }) })] }), { dataUpdatedAt: Date.now() });
    renderToday();
    expect(within(document.querySelector('[data-pulse="deposit"]') as HTMLElement).getByText('1 day left')).toBeInTheDocument();
  });

  it('draws the water tile with the checks done and missed, and the score tile with the percent', () => {
    h.kavach = kavachView({ pct: 62, now: [kavachItem(), kavachItem({ state: 'sent_back', sentBack: { at: '2026-11-26T05:00:00.000Z', reason: 'blurred' } as never }), kavachItem({ state: 'sent_back', sentBack: { at: '2026-11-26T05:00:00.000Z', reason: 'blurred' } as never })], counts: { todo: 35, sentBack: 2 } });
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report({ kind: 'water_ingress', data: waterData({ recorded: 10, total: 12, missed: 2 }) })] }));
    renderToday('/', { role: 'dealer-staff' });
    const water = document.querySelector('[data-pulse="water"]') as HTMLElement;
    expect(within(water).getByText('Water checks')).toBeInTheDocument();
    expect(within(water).getByText('of 12 done')).toBeInTheDocument();
    expect(within(water).getByText('2 missed')).toBeInTheDocument();
    const score = document.querySelector('[data-pulse="score"]') as HTMLElement;
    expect(within(score).getByText('Inspection score')).toBeInTheDocument();
    // 35 jobs are open in all, 3 are for today: the tile says 3 (the Kavach page counts the same), never "35 to do today".
    expect(within(score).getByText('3 to do today, 2 sent back')).toBeInTheDocument();
    expect(within(score).getByText('62%')).toBeInTheDocument();
    expect(score.textContent).not.toMatch(/35/);
  });

  it('draws the papers tile with the soonest paper, counted again from its date', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'paper_expiry', data: paperData([{ daysLeft: 20, validUntil: '2026-12-06' }]) })] }));
    renderToday();
    const tile = document.querySelector('[data-pulse="papers"]') as HTMLElement;
    expect(within(tile).getByText('9')).toBeInTheDocument();
    expect(within(tile).getAllByText(/Fire NOC: 9 days left/).length).toBeGreaterThan(0);
  });

  it('keeps an aged alarm\'s figure but takes the warning off its tile', () => {
    // The server turns an old water alarm to plain information; the frozen snapshot still has 2 missed.
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report({ kind: 'water_ingress', status: 'info', day: '2026-11-20', data: waterData({ recorded: 10, total: 12, missed: 2 }) })] }));
    renderToday('/', { role: 'dealer-staff' });
    const tile = document.querySelector('[data-pulse="water"]') as HTMLElement;
    expect(within(tile).getByText('2 missed')).toBeInTheDocument();
    expect(tile.querySelector('[data-status]')).toBeNull();
  });

  it('names the status in the tile\'s spoken label, not only in colour', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', data: variationData({ offL: 98 }) })] }));
    renderToday();
    const tile = document.querySelector('[data-pulse="variation"] [aria-label]') as HTMLElement;
    expect(tile.getAttribute('aria-label')).toMatch(/Needs a look/);
    expect(tile.getAttribute('aria-label')).toMatch(/98 L/);
  });

  it('opens the page that holds the story from the whole tile', () => {
    h.kavach = kavachView();
    h.feed = loadedFeed(feed({ reports: kinds() }));
    renderToday();
    const tap = (pulse: string) => fireEvent.click(document.querySelector(`[data-pulse="${pulse}"] button`) as HTMLElement);
    tap('sales');
    expect(where()).toHaveTextContent(/^\/services\/dsr-report\|/);
  });

  it.each([
    ['variation', '/services/dsr-report'],
    ['deposit', '/services/credit-dod-monitoring'],
    ['score', '/kavach'],
  ])('opens %s at %s', (pulse, path) => {
    h.kavach = kavachView();
    h.feed = loadedFeed(feed({ reports: kinds() }));
    renderToday();
    fireEvent.click(document.querySelector(`[data-pulse="${pulse}"] button`) as HTMLElement);
    expect(where().textContent).toMatch(new RegExp(`^${path}\\|`));
  });

  it('opens the papers page from the papers tile', () => {
    h.feed = loadedFeed(feed({ reports: kinds() }));
    renderToday();
    fireEvent.click(document.querySelector('[data-pulse="papers"] button') as HTMLElement);
    expect(where()).toHaveTextContent(/^\/pump\/papers\|/);
  });

  it('draws a manager\'s numbers without the deposit, whatever the server sent', () => {
    h.feed = loadedFeed(feed({ role: 'manager', reports: kinds() }));
    renderToday('/', { role: 'dealer-staff' });
    expect(document.querySelector('[data-pulse="deposit"]')).toBeNull();
  });

  it('draws no tile at all when there is no source, and no empty grid', () => {
    h.feed = loadedFeed(feed({ tasks: [task()] }));
    renderToday();
    expect(screen.queryByTestId('today-tiles')).not.toBeInTheDocument();
  });

  it('reads the sales tile from a message that holds both DSR sheets', () => {
    const both = {
      ...variationData({ offL: 0 }),
      sheets: ['sales', 'variation'],
      products: [{ ...salesData().products[0]!, variation: variationData().products[0]!.variation }],
    };
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', data: both as unknown as ReportData })] }));
    renderToday();
    expect(order()).toEqual(['sales', 'variation']);
    expect(within(document.querySelector('[data-pulse="sales"]') as HTMLElement).getAllByText('24,000').length).toBeGreaterThan(0);
  });

  it('is one column at large text: the grid\'s column width is in rem', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' })] }));
    renderToday();
    expect(screen.getByTestId('today-tiles').className).toContain('minmax(8.5rem,1fr)');
  });
});

// ── Pump now, Coming up ────────────────────────────────────────────────────
describe('TodayPage: Pump now and Coming up', () => {
  const rowOf = (id: string) => document.querySelector(`[data-pump-row="${id}"]`) as HTMLElement | null;

  it('draws a row only for data that exists, each with a shape and a word', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' }), report({ kind: 'water_ingress', data: waterData({ recorded: 10, total: 12, missed: 2 }) })] }));
    renderToday();
    const card = screen.getByRole('region', { name: 'Pump now' });
    expect(within(card).getByText('10 of 12 checks done, 2 missed')).toBeInTheDocument();
    expect(rowOf('water')!.querySelector('[data-status="attention"] svg')).not.toBeNull();
    expect(rowOf('supply')).toBeNull();
    expect(rowOf('papers')).toBeNull();
    expect(rowOf('declaration')).toBeNull();
    expect(rowOf('tanker')).toBeNull();
  });

  it('says "No stock reading yet" with a button that types the question and sends nothing', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' })] }));
    renderToday();
    expect(within(rowOf('stock')!).getByText('No stock reading yet')).toBeInTheDocument();
    fireEvent.click(within(rowOf('stock')!).getByRole('button', { name: 'Ask for a stock check' }));
    expect(where()).toHaveTextContent(/^\/chat\|/);
  });

  it('types the stock question in the dealer\'s own chat when it is known, and sends nothing', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' })] }));
    const { queryClient } = renderToday();
    queryClient.setQueryData(myConversationsKey, [{ id: 'c-own', userId: 'owner' }]);
    fireEvent.click(within(rowOf('stock')!).getByRole('button', { name: 'Ask for a stock check' }));
    expect(where().textContent).toMatch(/^\/chat\/c-own\|/);
    expect(where().textContent).toContain('"draftText":"Please check my stock and tell me how many days it will last"');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('shows the stock cover per fuel when a reading exists, and never feeds it to the verdict', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'stock_check' })] }));
    renderToday();
    expect(within(rowOf('stock')!).getByText(/Diesel lasts 4 days, runs out Tue 1 Dec/)).toBeInTheDocument();
    expect(within(verdict()).getByRole('heading', { name: 'All fine' })).toBeInTheDocument();
  });

  it('says the supply is stopped with its pending conditions, as a problem, and the verdict follows', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'ro_supply', status: 'attention', data: supplyData({ blocked: true, failing: 2 }) })] }));
    renderToday();
    expect(within(rowOf('supply')!).getByText('Supply is stopped, 2 conditions pending')).toBeInTheDocument();
    expect(rowOf('supply')!.querySelector('[data-status="problem"]')).not.toBeNull();
    expect(within(verdict()).getByRole('heading', { name: '1 problem' })).toBeInTheDocument();
  });

  it('says the next tanker, with a button that opens the chat with the order typed and NOT sent', () => {
    const plan = planData({ code: 'ORDER_TODAY', severity: 'order_today', arriveOn: '2026-11-29', arriveTime: '2:00 pm' });
    plan.order!.trucks = [{ chambers: [{ product: 'HSD', litres: 12_000 }] }] as never;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'load_plan', conversationId: 'conv 9', data: plan as unknown as ReportData })] }));
    renderToday();
    const row = rowOf('tanker')!;
    expect(within(row).getByText('Order the tanker today')).toBeInTheDocument();
    expect(within(row).getByText(/Tomorrow's cover: Diesel 2\.1 days/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Plan the order' }));
    expect(where().textContent).toMatch(/^\/chat\/conv%209\|/);
    expect(where().textContent).toMatch(/"draftText":"Please place an order for/);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('opens a row\'s own page, or the report when the service has no page', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'water_ingress' }), report({ kind: 'ro_supply' }), report({ kind: 'paper_expiry' })] }));
    renderToday();
    fireEvent.click(within(rowOf('water')!).getByRole('button', { name: /checks done/ }));
    expect(where()).toHaveTextContent(/^\/services\/water-ingress-testing\|/);
    cleanup();
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'paper_expiry' })] }));
    renderToday();
    fireEvent.click(within(rowOf('papers')!).getByRole('button', { name: /Fire NOC/ }));
    expect(where()).toHaveTextContent(/^\/pump\/papers\|/);
  });

  it('says the safety declaration streak, and the missing-report row calmly, never "you missed"', () => {
    vi.setSystemTime(new Date('2026-11-27T06:30:00.000Z'));
    h.feed = loadedFeed(
      feed({ reports: [report({ kind: 'dsr_sales', day: '2026-11-25', data: salesData({ day: '2026-11-25' }) }), report({ kind: 'declaration_filed' })] }),
      { dataUpdatedAt: Date.now() },
    );
    renderToday();
    expect(within(rowOf('declaration')!).getByText('Safety declaration: 23 days in a row')).toBeInTheDocument();
    const missing = rowOf('missing')!;
    expect(missing).toHaveTextContent("Yesterday's sales report has not come yet");
    expect(missing.textContent).not.toMatch(/missed/i);
  });

  it('holds no Pump now card for a pump with no report at all', () => {
    h.feed = loadedFeed(feed({ tasks: [task()] }));
    renderToday();
    expect(screen.queryByRole('region', { name: 'Pump now' })).not.toBeInTheDocument();
  });

  it('lists the next three dated things, soonest first, with the date in words, and none that is past', () => {
    h.feed = loadedFeed(
      feed({
        reports: [
          report({ kind: 'credit_dod', data: creditData({ date: '2026-11-30' }) }),
          report({ kind: 'load_plan', data: planData({ arriveOn: '2026-11-29' }) }),
          report({ kind: 'declaration_filed', data: declarationData({ nextDueDay: '2026-11-28' }) }),
          report({ kind: 'paper_expiry', data: paperData([{ daysLeft: 9, validUntil: '2026-12-06' }, { docType: 'old', docLabel: 'Old paper', daysLeft: -2, validUntil: '2026-11-25' }]) }),
        ],
      }),
    );
    renderToday();
    const card = screen.getByRole('region', { name: 'Coming up' });
    const rows = Array.from(card.querySelectorAll('[data-coming-up]')).map((el) => el.textContent);
    expect(rows).toEqual(['Declaration due Sat 28 Nov', 'Tanker arrives Sun 29 Nov', 'Deposit due Mon 30 Nov']);
  });

  it('draws no Coming up card when nothing is dated', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' })] }));
    renderToday();
    expect(screen.queryByRole('region', { name: 'Coming up' })).not.toBeInTheDocument();
  });

  it('opens the page a dated thing belongs to', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'credit_dod', data: creditData({ date: '2026-11-30' }) })] }));
    renderToday();
    fireEvent.click(within(screen.getByRole('region', { name: 'Coming up' })).getByRole('button', { name: /Deposit due/ }));
    expect(where()).toHaveTextContent(/^\/services\/credit-dod-monitoring\|/);
  });
});

// ── Done for you ───────────────────────────────────────────────────────────
describe('TodayPage: Done for you', () => {
  const doneOf = (n: number) =>
    Array.from({ length: n }, (_, i) => report({ kind: 'declaration_filed', messageId: `m-done-${i}`, sentAt: `2026-11-27T0${i}:12:00.000Z` }));

  it('says how many things MDG did, lists the first three receipts with the kind\'s own line and the time, and opens the report', () => {
    h.headlines.declaration_filed = 'Safety declaration filed';
    h.feed = loadedFeed(feed({ reports: [report()], done: doneOf(2) }));
    renderToday();
    const card = screen.getByRole('region', { name: 'MDG did 2 things today' });
    const rows = card.querySelectorAll('[data-report-kind="declaration_filed"]');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('Safety declaration filed')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('6:42 am')).toBeInTheDocument();
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button'));
    expect(where()).toHaveTextContent('/report/c1/m-done-');
  });

  it('says "MDG did 1 thing today" in the singular and in Hindi', () => {
    h.feed = loadedFeed(feed({ reports: [report()], done: doneOf(1) }));
    renderToday();
    expect(screen.getByRole('region', { name: 'MDG did 1 thing today' })).toBeInTheDocument();
    cleanup();
    h.feed = loadedFeed(feed({ reports: [report()], done: doneOf(3) }));
    renderToday('/', { lang: 'hi' });
    expect(screen.getByRole('region', { name: 'आज MDG ने आपके 3 काम किए' })).toBeInTheDocument();
  });

  it('shows three receipts and "N more"', () => {
    h.feed = loadedFeed(feed({ reports: [report()], done: doneOf(5) }));
    renderToday();
    const card = screen.getByRole('region', { name: 'MDG did 5 things today' });
    expect(card.querySelectorAll('[data-report-kind="declaration_filed"]')).toHaveLength(3);
    fireEvent.click(within(card).getByRole('button', { name: '2 more' }));
    expect(card.querySelectorAll('[data-report-kind="declaration_filed"]')).toHaveLength(5);
  });

  it('falls back to the team\'s words for a receipt with no snapshot', () => {
    h.feed = loadedFeed(feed({ reports: [report()], done: [oldReport({ kind: 'declaration_filed', headline: 'Declaration done by the team.', messageId: 'm-old-done' })] }));
    renderToday();
    expect(screen.getByText('Declaration done by the team.')).toBeInTheDocument();
  });

  it('says calmly that nothing is done yet, instead of "did 0 things", when there is nothing new to read either', () => {
    // An owner's report is not for a manager: the feed holds one, the card has nothing to show.
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report({ kind: 'credit_dod' })] }));
    renderToday('/', { role: 'dealer-staff' });
    expect(screen.getByRole('region', { name: 'Done for you' })).toBeInTheDocument();
    expect(screen.getByTestId('today-done-clear')).toHaveTextContent('Nothing done for you yet today.');
    expect(screen.queryByText(/did 0/)).not.toBeInTheDocument();
  });

  it('is only the new reports, with no empty sentence above them, when nothing is done yet', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const card = screen.getByRole('region', { name: 'New reports' });
    expect(within(card).queryByTestId('today-done-clear')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Done for you' })).not.toBeInTheDocument();
    expect(card.querySelectorAll('[data-report-id]')).toHaveLength(1);
  });

  it('keeps the "New reports" heading under the receipts when some are done', () => {
    h.feed = loadedFeed(feed({ reports: [report()], done: doneOf(2) }));
    renderToday();
    const card = screen.getByRole('region', { name: 'MDG did 2 things today' });
    expect(within(card).getByRole('heading', { name: 'New reports' })).toBeInTheDocument();
  });

  it('gives each new report its own line and a shape only when it needs a look, not just a name and a day', () => {
    h.headlines.dsr_sales = 'Sold 24,100 L yesterday';
    h.headlines.water_ingress = '2 checks were missed';
    h.feed = loadedFeed(
      feed({
        reports: [
          report({ kind: 'dsr_sales', messageId: 'm-sales', sentAt: '2026-11-27T01:00:00.000Z' }),
          report({ kind: 'ro_supply', messageId: 'm-supply', status: 'attention', sentAt: '2026-11-27T03:00:00.000Z' }),
        ],
      }),
    );
    renderToday();
    const sales = document.querySelector('[data-report-id="m-sales"]') as HTMLElement;
    expect(within(sales).getByText('Sold 24,100 L yesterday')).toBeInTheDocument();
    expect(within(sales).getByText(/Daily sales \(DSR\), yesterday|Daily sales \(DSR\), today/)).toBeInTheDocument();
    expect(sales.querySelector('[data-status]')).toBeNull();
    // A report that says "have a look" wears the triangle and its word.
    const supply = document.querySelector('[data-report-id="m-supply"]') as HTMLElement;
    expect(supply.querySelector('[data-status="attention"]')).toHaveTextContent('Needs a look');
  });

  it('lists the three newest reports under "New reports", each opening the report screen, and marks it read', () => {
    h.feed = loadedFeed(
      feed({
        reports: [
          report({ kind: 'dsr_sales', messageId: 'm-sales', sentAt: '2026-11-27T01:00:00.000Z' }),
          report({ kind: 'water_ingress', messageId: 'm-water', sentAt: '2026-11-27T02:00:00.000Z' }),
          report({ kind: 'ro_supply', messageId: 'm-supply', sentAt: '2026-11-27T03:00:00.000Z' }),
          report({ kind: 'stock_check', messageId: 'm-stock', sentAt: '2026-11-27T00:30:00.000Z' }),
        ],
      }),
    );
    renderToday();
    const group = screen.getByRole('region', { name: 'New reports' });
    const ids = Array.from(group.querySelectorAll('[data-report-id]')).map((el) => el.getAttribute('data-report-id'));
    expect(ids).toEqual(['m-supply', 'm-water', 'm-sales']);
    fireEvent.click(within(group.querySelector('[data-report-id="m-water"]') as HTMLElement).getByRole('button'));
    expect(where()).toHaveTextContent('/report/c1/m-water|');
    expect(h.emit).toHaveBeenCalledWith('read', { conversationId: 'c1', messageIds: ['m-water'] });
  });

  it('has the two text buttons: all reports and all services', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: 'See all reports' }));
    expect(where()).toHaveTextContent(/^\/reports\|/);
    cleanup();
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: 'See all services' }));
    expect(where()).toHaveTextContent(/^\/services\|/);
  });

  it('keeps an owner\'s report from a manager', () => {
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report({ kind: 'credit_dod' }), report({ kind: 'dsr_sales' })] }));
    renderToday('/', { role: 'dealer-staff' });
    const group = screen.getByRole('region', { name: 'New reports' });
    expect(group.querySelector('[data-report-kind="credit_dod"]')).toBeNull();
  });

  it('does not say "this week" on Today (that line lives on the Services door)', () => {
    h.feed = loadedFeed(feed({ reports: [report()], done: doneOf(2) }));
    renderToday();
    expect(screen.queryByText(/this week/i)).not.toBeInTheDocument();
  });
});

// ── notices ────────────────────────────────────────────────────────────────
describe('TodayPage: the notices row', () => {
  const billView = (over: Partial<OutletSetupView['payment']> = {}): OutletSetupView =>
    makeSetupView({
      stage: 'live',
      payment: { state: 'sent', amountPaise: 590_000, dueOn: '2026-12-02', paidOn: null, paymentId: 'p1', resend: { nextAt: null, inApp: false }, ...over } as OutletSetupView['payment'],
    });

  it('is not drawn when there is nothing to say', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    expect(screen.queryByRole('button', { name: /notice/i })).not.toBeInTheDocument();
  });

  it('folds the bill into one line that says only the days: no amount, no way to pay', () => {
    h.setup = billView();
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const line = within(verdict()).getByRole('button', { name: /Bill/ });
    expect(line).toHaveTextContent('Bill · any time in 5 days');
    expect(verdict().textContent).not.toMatch(/5,900|5900|Rs/);
    fireEvent.click(line);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByRole('link')).not.toBeInTheDocument();
    expect(sheet.textContent).not.toMatch(/\bpay\b|5,900/i);
  });

  it('in the phone app the bill is plain text: no "Send again", no link, no pay hint, unless the server\'s switch allows it', () => {
    h.native = true;
    h.setup = billView({ resend: { nextAt: null, inApp: false } } as never);
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    fireEvent.click(within(verdict()).getByRole('button', { name: /Bill/ }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByRole('button', { name: /Send again/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('link')).not.toBeInTheDocument();
    cleanup();
    h.setup = billView({ resend: { nextAt: null, inApp: true } } as never);
    renderToday();
    fireEvent.click(within(verdict()).getByRole('button', { name: /Bill/ }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send again' })).toBeInTheDocument();
  });

  it('offers "Send again" in a browser, and sends the bill again outside the app', () => {
    h.setup = billView({ resend: { nextAt: null, inApp: false } } as never);
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    fireEvent.click(within(verdict()).getByRole('button', { name: /Bill/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send again' }));
    expect(h.resend).toHaveBeenCalledTimes(1);
  });

  it('keeps notifications-off with its button, and counts several notices as "2 notices"', () => {
    usePushStore.setState({ pushState: 'off', canAskAgain: true });
    h.setup = billView();
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const row = within(verdict()).getByRole('button', { name: '2 notices' });
    fireEvent.click(row);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Notifications are off')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /Turn on/i }));
    expect(h.askPush).toHaveBeenCalledTimes(1);
  });

  it('draws the notices for a manager without the bill (only an owner has one)', () => {
    h.setup = billView({}) && { ...billView(), canEdit: false };
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report()] }));
    renderToday('/', { role: 'dealer-staff' });
    expect(screen.queryByText(/^Bill/)).not.toBeInTheDocument();
  });
});

// ── the order of the page ──────────────────────────────────────────────────
describe('TodayPage: the order of the page', () => {
  it('goes verdict, Needs you, the four numbers, Pump now, Coming up, Done for you', () => {
    h.alerts.water_ingress = { headline: '2 checks were missed', line: 'x', severity: 'attention' };
    h.kavach = kavachView();
    h.feed = loadedFeed(
      feed({
        tasks: [task()],
        reports: [
          report({ kind: 'dsr_sales' }),
          report({ kind: 'credit_dod', data: creditData({ date: '2026-11-30' }) }),
          report({ kind: 'water_ingress', status: 'attention' }),
        ],
        done: [report({ kind: 'declaration_filed', messageId: 'm-done' })],
      }),
    );
    renderToday();
    const marks = [
      screen.getByRole('heading', { name: /wait.* for you/ }),
      screen.getByTestId('today-needs'),
      screen.getByTestId('today-tiles'),
      screen.getByRole('region', { name: 'Pump now' }),
      screen.getByRole('region', { name: 'Coming up' }),
      screen.getByRole('region', { name: /MDG did/ }),
    ];
    for (let i = 1; i < marks.length; i += 1) {
      expect(marks[i - 1]!.compareDocumentPosition(marks[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `block ${i}`).toBeTruthy();
    }
  });

  it('draws at most three cards: Pump now, Coming up, Done for you', () => {
    h.feed = loadedFeed(feed({ reports: [report(), report({ kind: 'water_ingress' })], done: [report({ kind: 'declaration_filed', messageId: 'm-done' })] }));
    renderToday();
    const cards = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? r.getAttribute('aria-labelledby'));
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(screen.getAllByRole('region', { name: /Pump now|Coming up|MDG did|Done for you/ }).length).toBeLessThanOrEqual(3);
  });

  it('draws the page for a manager from the same feed, without the owner\'s setup block or deposit', () => {
    h.feed = loadedFeed(feed({ role: 'manager', tasks: [task()], reports: [report({ kind: 'dsr_sales' })] }));
    renderToday('/', { role: 'dealer-staff' });
    expect(within(verdict()).getByRole('heading', { name: '1 thing waits for you' })).toBeInTheDocument();
    expect(screen.queryByTestId('setup-hero')).not.toBeInTheDocument();
    expect(screen.queryByText('Deposit to the oil company')).not.toBeInTheDocument();
  });
});

describe('TodayPage: at large text', () => {
  it('hides the "Needs you" heading from the eye (kept for a screen reader) so the first row is visible at once', () => {
    h.large = true;
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report()] }));
    renderToday();
    expect(screen.getByRole('heading', { name: /Needs you/ }).className).toContain('sr-only');
    expect(screen.getByRole('button', { name: /Open in chat/ })).toBeInTheDocument();
  });
});

// ── the defects the real screens showed (27 Nov) ───────────────────────────
describe('TodayPage: one list, one count', () => {
  const alertKinds = ['water_ingress', 'ro_supply', 'stock_check'] as const;
  const seeded = () => {
    for (const k of alertKinds) h.alerts[k] = { headline: `${k} needs a look`, line: 'x', severity: 'attention' };
    return loadedFeed(
      feed({
        tasks: [1, 2, 3, 4, 5].map((n) => task({ id: `t${n}`, title: `Task ${n}`, since: `2026-11-2${n}T06:00:00.000Z` })),
        reports: [
          ...alertKinds.map((k) => report({ kind: k, status: 'attention' })),
          // Two more reports that say "have a look" but raise no card: they must not be counted.
          report({ kind: 'declaration_filed', status: 'attention' }),
          report({ kind: 'paper_expiry', status: 'attention' }),
          report({ kind: 'load_plan', status: 'attention' }),
        ],
      }),
    );
  };

  it('says the same number in the verdict word, the chips and the Needs-you heading: the length of the list drawn', () => {
    h.feed = seeded();
    renderToday();
    const heading = screen.getByRole('heading', { name: /Needs you/ });
    expect(heading).toHaveTextContent('8');
    expect(screen.getAllByTestId('today-work-slide')).toHaveLength(8);
    expect(within(verdict()).getByRole('heading', { name: '5 things wait for you' })).toBeInTheDocument();
    // 5 + 3 = 8 = the list: never "5 and 6" (11) over a list of 8.
    expect(verdict()).toHaveTextContent('5 need you');
    expect(verdict()).toHaveTextContent('3 need a look');
    expect(verdict().textContent).not.toMatch(/6 need a look/);
  });

  it('does the same in Hindi, with the Hindi stop', () => {
    h.feed = seeded();
    renderToday('/', { lang: 'hi' });
    expect(verdict()).toHaveTextContent('5 आपके लिए');
    expect(verdict()).toHaveTextContent('3 देखने के लिए');
  });
});

describe('TodayPage: the verdict sentence', () => {
  it('joins the top two reasons with one plain word and one stop, in the reader\'s language', () => {
    h.alerts.water_ingress = { headline: '2 checks were missed.', line: 'x', severity: 'attention' };
    h.feed = loadedFeed(feed({ tasks: [task({ title: 'Keep first-aid box stocked.' })], reports: [report({ kind: 'water_ingress', status: 'attention' })] }));
    renderToday();
    expect(within(verdict()).getByText('2 checks were missed and Keep first-aid box stocked.')).toBeInTheDocument();
    cleanup();
    renderToday('/', { lang: 'hl' });
    expect(within(verdict()).getByText('2 checks were missed aur Keep first-aid box stocked.')).toBeInTheDocument();
    cleanup();
    h.alerts.water_ingress = { headline: '2 जाँच छूट गईं.', line: 'x', severity: 'attention' };
    h.feed = loadedFeed(feed({ tasks: [task({ title: 'फ़र्स्ट-एड बॉक्स भरें।' })], reports: [report({ kind: 'water_ingress', status: 'attention' })] }));
    renderToday('/', { lang: 'hi' });
    // The danda, never an English full stop in Hindi text, and never "।" glued to ".".
    expect(within(verdict()).getByText('2 जाँच छूट गईं और फ़र्स्ट-एड बॉक्स भरें।')).toBeInTheDocument();
    expect(verdict().textContent).not.toMatch(/\.\s/);
  });

  it('says the limit fact once, in the one sentence: "Diesel is 98 L beyond the limit (170 L short)"', () => {
    h.alerts.dsr_variation = { headline: 'Diesel 170 L short', line: 'x', severity: 'problem' };
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', status: 'attention', data: variationData({ offL: 98 }) })] }));
    renderToday();
    expect(within(verdict()).getByText(/Diesel is 98 L beyond the limit \(170 L short\)\./)).toBeInTheDocument();
    // The Needs-you card says the same words, and the tile says the same 98 L.
    expect(document.querySelector('[data-needs-id="alert:m-dsr_variation"]')).toHaveTextContent('Diesel is 98 L beyond the limit (170 L short)');
    expect(within(document.querySelector('[data-pulse="variation"]') as HTMLElement).getByText('98 L beyond the limit')).toBeInTheDocument();
  });
});

describe('TodayPage: no sideways scroll', () => {
  it('keeps whatever a tile hides for a screen reader from widening the page', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' })] }));
    renderToday();
    // jsdom has no layout: what is pinned is the rule that holds the width. The page does NOT hide
    // overflow (that would only cut text off at 200%); a tile is its own box, and what is hidden for a
    // screen reader sits in a wrapper that takes no room.
    expect(screen.getByTestId('today-page').className).not.toMatch(/overflow-(x-)?(clip|hidden)/);
    for (const li of Array.from(document.querySelectorAll('[data-testid="today-tiles"] > li'))) {
      expect(li.className).toMatch(/\brelative\b/);
    }
  });

  it.each(['en', 'hi', 'hl'] as const)('hides nothing and clips nothing in %s too, with the seven bars on screen', (lang) => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales' })] }));
    renderToday('/', { lang });
    const page = screen.getByTestId('today-page');
    expect(page.className).not.toMatch(/overflow-(x-)?(clip|hidden)/);
    // The hidden table sits inside a hidden wrapper (a bare `table.sr-only` keeps its layout and stretches the page).
    expect(page.querySelector('.sr-only table')).not.toBeNull();
    expect(page.querySelector('table.sr-only')).toBeNull();
  });
});

describe('TodayPage: the inspection tile', () => {
  it('says the day\'s count, not the open total, and draws the percent in one run', () => {
    h.kavach = kavachView({ pct: 6, now: [kavachItem(), kavachItem(), kavachItem({ state: 'sent_back', sentBack: { at: '2026-11-26T05:00:00.000Z', reason: 'blurred' } as never })], counts: { todo: 35, sentBack: 1 } });
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const tile = document.querySelector('[data-pulse="score"]') as HTMLElement;
    expect(within(tile).getByText('6%')).toBeInTheDocument();
    expect(within(tile).getByText('3 to do today, 1 sent back')).toBeInTheDocument();
    expect(tile.textContent).not.toMatch(/35/);
  });

  it('says "points open" when only the total is known, never "to do today"', () => {
    const view = kavachView({ pct: 6, counts: { todo: 35, sentBack: 0 } });
    h.kavach = { ...view, now: undefined } as unknown as KavachDealerView;
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const tile = document.querySelector('[data-pulse="score"]') as HTMLElement;
    expect(within(tile).getByText('35 points open')).toBeInTheDocument();
    expect(tile.textContent).not.toMatch(/to do today/);
  });
});

describe('TodayPage: whole sentences', () => {
  it('says "from yesterday" as a whole phrase in the three languages, never "कल की" alone', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'credit_dod', sentAt: '2026-11-26T01:35:00.000Z', data: creditData({ date: '2026-11-30' }) })] }));
    renderToday('/', { lang: 'hi' });
    const tile = document.querySelector('[data-pulse="deposit"]') as HTMLElement;
    expect(within(tile).getByText('कल की जानकारी')).toBeInTheDocument();
    cleanup();
    renderToday('/', { lang: 'hl' });
    expect(within(document.querySelector('[data-pulse="deposit"]') as HTMLElement).getByText('Kal ki jaankari')).toBeInTheDocument();
    cleanup();
    renderToday();
    expect(within(document.querySelector('[data-pulse="deposit"]') as HTMLElement).getByText('from yesterday')).toBeInTheDocument();
  });
});

describe('TodayPage: one rule for a paper that ends soon', () => {
  const papers = (docType = 'fire_noc', docLabel = 'Fire NOC') =>
    loadedFeed(feed({ reports: [report({ kind: 'paper_expiry', data: paperData([{ docType, docLabel, daysLeft: 9, validUntil: '2026-12-06' }]) })] }));

  it('shows 9 days left as "have a look" (a triangle and a word), on the row and on the tile', () => {
    h.feed = papers();
    renderToday();
    const row = document.querySelector('[data-pump-row="papers"]') as HTMLElement;
    expect(row.getAttribute('data-row-status')).toBe('attention');
    expect(row.querySelector('[data-status="attention"]')).toHaveTextContent('Needs a look');
    const tile = document.querySelector('[data-pulse="papers"]') as HTMLElement;
    expect(tile.querySelector('[data-status="attention"]')).not.toBeNull();
  });

  it('keeps a paper with 40 days left calm, and a lapsed one a problem', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'paper_expiry', data: paperData([{ daysLeft: 40, validUntil: '2027-01-06' }]) })] }));
    renderToday();
    expect((document.querySelector('[data-pump-row="papers"]') as HTMLElement).getAttribute('data-row-status')).toBe('ok');
    cleanup();
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'paper_expiry', data: paperData([{ daysLeft: -2, validUntil: '2026-11-25' }]) })] }));
    renderToday();
    expect((document.querySelector('[data-pump-row="papers"]') as HTMLElement).getAttribute('data-row-status')).toBe('problem');
  });

  it('names the paper in the reader\'s language even when the server sent only its English label', () => {
    h.feed = papers();
    renderToday('/', { lang: 'hi' });
    const row = document.querySelector('[data-pump-row="papers"]') as HTMLElement;
    expect(row.textContent).toContain('फ़ायर एनओसी');
    expect(row.textContent).not.toContain('Fire NOC');
  });
});

describe('TodayPage: the notices row carries the bill', () => {
  it('shows a live pump\'s monthly bill as days only, from the bills list, for the owner', () => {
    h.dueBill = { dueOn: '2026-11-30' };
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    const line = within(verdict()).getByRole('button', { name: /Bill due in 3 days/ });
    expect(line).toBeInTheDocument();
    expect(verdict().textContent).not.toMatch(/Rs|1,18,000|pay/i);
    fireEvent.click(line);
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Send again/ })).not.toBeInTheDocument();
    cleanup();
    renderToday('/', { lang: 'hi' });
    expect(within(verdict()).getByRole('button', { name: /बिल की आख़िरी तारीख़ 3 दिन में/ })).toBeInTheDocument();
  });

  it('says tomorrow, today and a passed date, and counts the bill with the other notices', () => {
    usePushStore.setState({ pushState: 'off', canAskAgain: true });
    h.dueBill = { dueOn: '2026-11-28' };
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    fireEvent.click(within(verdict()).getByRole('button', { name: '2 notices' }));
    expect(within(screen.getByRole('dialog')).getByText('Bill due tomorrow')).toBeInTheDocument();
    cleanup();
    h.dueBill = { dueOn: '2026-11-27' };
    renderToday();
    fireEvent.click(within(verdict()).getByRole('button', { name: '2 notices' }));
    expect(within(screen.getByRole('dialog')).getByText('Bill due today')).toBeInTheDocument();
  });

  it('never shows the monthly bill to a manager', () => {
    h.dueBill = { dueOn: '2026-11-30' };
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report()] }));
    renderToday('/', { role: 'dealer-staff' });
    // The page asks for the bill for an owner only, so a manager has no bill line, whatever the list holds.
    expect(screen.queryByRole('button', { name: /Bill/ })).not.toBeInTheDocument();
  });
});

describe('TodayPage: the work slider opens on the first card', () => {
  it('shows card 1 after a re-render in another language, and keeps the card being read when an earlier one leaves', () => {
    const tasks = [1, 2, 3].map((n) => task({ id: `t${n}`, title: `Task ${n}`, since: `2026-11-2${n}T06:00:00.000Z` }));
    h.feed = loadedFeed(feed({ tasks, reports: [report()] }));
    const { rerender } = renderToday();
    fireEvent.click(screen.getByRole('button', { name: 'Next task' }));
    expect(screen.getByTestId('today-work-position')).toHaveTextContent('2 of 3');
    act(() => useLangStore.setState({ lang: 'hi', explicit: true }));
    rerenderToday(rerender);
    expect(screen.getByTestId('today-work-position')).toHaveTextContent('3 में से 1');
    // The cards are Task 3, Task 2, Task 1 (newest first). The dealer reads Task 2, then Task 3 (the
    // first card) leaves: the dealer stays on Task 2, which is now the first of two.
    fireEvent.click(screen.getByRole('button', { name: 'अगला काम' }));
    expect(screen.getByTestId('today-work-position')).toHaveTextContent('3 में से 2');
    h.feed = loadedFeed(feed({ tasks: [tasks[0]!, tasks[1]!], reports: [report()] }));
    rerenderToday(rerender);
    expect(screen.getByTestId('today-work-position')).toHaveTextContent('2 में से 1');
    expect(screen.getAllByTestId('today-work-slide')[0]).toHaveTextContent('Task 2');
  });
});
