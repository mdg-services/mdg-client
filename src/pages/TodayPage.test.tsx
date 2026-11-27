import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kItem, kView } from '@/features/kavach/kavachFixtures';
import type { KindAlert, KindTile } from '@/features/reports/types';
import { useLangStore } from '@/store/lang';
import { makeSetupView, makeStrip } from '@/test/setupFixtures';
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
  refetch: () => void;
}

const h = vi.hoisted(() => ({
  feed: undefined as unknown as FeedStub,
  kavach: undefined as KavachDealerView | undefined,
  setup: undefined as OutletSetupView | undefined,
  outlets: undefined as OutletsView | undefined,
  refetch: vi.fn(),
  emit: vi.fn(),
  send: vi.fn(),
  /** What each kind says, by kind. A kind with no entry says nothing (null). */
  tiles: {} as Record<string, KindTile | null>,
  alerts: {} as Record<string, KindAlert | null>,
  headlines: {} as Record<string, string>,
}));

vi.mock('@/hooks/api/useTodayFeed', () => ({
  todayFeedKey: ['today-feed'],
  useTodayFeed: () => h.feed,
}));
vi.mock('@/hooks/api/useKavach', () => ({
  kavachKey: ['kavach', 'me'],
  useKavach: () => ({ data: h.kavach }),
}));
vi.mock('@/hooks/api/useSendMessage', () => ({
  NothingToSendError: class NothingToSendError extends Error {},
  useSendMessage: () => ({ mutateAsync: h.send }),
}));
vi.mock('@/features/setup/useOutletSetup', () => ({
  useOutletSetup: () => ({ data: h.setup }),
}));
vi.mock('@/features/outlets/useOutlets', () => ({
  useOutlets: () => ({ data: h.outlets }),
  hasOtherOutlets: (v: OutletsView | undefined) => !!v?.current && v.outlets.length > 0,
}));
// The three strips are tested on their own; here they only have to be on the page.
vi.mock('@/features/setup/BillDueBanner', () => ({
  BillDueBanner: () => <div data-testid="bill-banner" />,
}));
vi.mock('@/features/push/PushNotice', () => ({ PushNotice: () => <div data-testid="push-notice" /> }));
vi.mock('@/features/push/BatteryGuide', () => ({
  BatteryGuideCard: () => <div data-testid="battery-guide" />,
}));
// Each kind's own drawing and words are tested with the kind; here they are a table.
vi.mock('@/features/reports/registry', () => ({
  getKindView: (kind: string) => ({
    kind,
    Glyph: () => <svg data-testid={`glyph-${kind}`} />,
    Overlay: () => null,
    tile: () => h.tiles[kind] ?? null,
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
const snap = (kind: ReportKind): ReportData => ({ kind, v: 1 }) as unknown as ReportData;

/** A report WITH a snapshot (the new kind), unless `data` is overridden. */
function report(over: Partial<TodayReport> = {}): TodayReport {
  const kind = over.kind ?? 'dsr_sales';
  return {
    id: over.messageId ?? `m-${kind}`,
    kind,
    status: 'ok',
    day: '2026-11-24',
    sentAt: '2026-11-24T06:00:00.000Z',
    headline: 'Sales are in for today.',
    attachments: [],
    conversationId: 'c1',
    messageId: `m-${kind}`,
    data: snap(kind),
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
    since: '2026-11-23T06:00:00.000Z',
    conversationId: 'c1',
    messageId: 'm-ask',
    ...over,
  };
}

const photoTask = (over: Partial<TodayTask> = {}, acceptsFile = false) =>
  task({ action: { type: 'photo', askRef: 'doc:7', acceptsFile }, ...over });

function feed(over: Partial<TodayFeed> = {}): TodayFeed {
  return { day: '2026-11-24', role: 'owner', tasks: [], reports: [], done: [], ...over };
}

const loadedFeed = (data: TodayFeed, extra: Partial<FeedStub> = {}): FeedStub => ({
  status: 'success',
  fetchStatus: 'idle',
  isError: false,
  isFetching: false,
  data,
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
      <Route path="/settings" element={<div>settings-page</div>} />
    </Routes>,
    { route, withRouter: true },
  );
}

const where = () => screen.getByTestId('where');

beforeEach(() => {
  h.kavach = undefined;
  // jsdom has no scrolling: the photo sheet locks the page scroll while it is open.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  h.feed = loadedFeed(feed());
  h.setup = undefined;
  h.outlets = undefined;
  h.tiles = {};
  h.alerts = {};
  h.headlines = {};
  h.send.mockReset().mockResolvedValue({ id: 'sent-1' });
});
afterEach(() => {
  cleanup();
  h.refetch.mockReset();
  h.emit.mockReset();
  vi.mocked(markFirstScreen).mockClear();
  resetStores();
});

// ── the top of the page ────────────────────────────────────────────────────
describe('TodayPage — the top of the page', () => {
  it('is headed Today and has the ⋮ menu to Settings but no back arrow', async () => {
    renderToday();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }));
    expect(await screen.findByText('settings-page')).toBeInTheDocument();
  });

  it('carries the bill, notification and battery strips the chat list used to carry first', () => {
    renderToday();
    expect(screen.getByTestId('bill-banner')).toBeInTheDocument();
    expect(screen.getByTestId('push-notice')).toBeInTheDocument();
    expect(screen.getByTestId('battery-guide')).toBeInTheDocument();
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

    it('prints the date under it, in the reader\'s language, from the feed\'s business day', () => {
      renderToday();
      expect(screen.getByTestId('today-date-line')).toHaveTextContent(/Tuesday,? 24 November/);
      cleanup();
      renderToday('/', { lang: 'hi' });
      expect(screen.getByTestId('today-date-line')).toHaveTextContent(/24/);
      expect(screen.getByTestId('today-date-line')).toHaveTextContent(/नवंबर|नवम्बर/);
    });

    it('names the pump when the person runs more than one, and says "Manager" for a manager', () => {
      h.outlets = {
        current: { userId: 'u1', dealerId: 'd1', code: '12E', role: 'dealer-owner' },
        outlets: [{ userId: 'u2', dealerId: 'd2', code: '14E', role: 'dealer-owner' }],
      } as OutletsView;
      renderToday('/', { role: 'dealer-staff', name: 'Sunil Rao' });
      expect(screen.getByTestId('today-date-line')).toHaveTextContent(/12E · Manager · Tuesday/);
    });

    it('is on screen while the feed is still on its way', () => {
      h.feed = { status: 'pending', fetchStatus: 'fetching', isError: false, isFetching: true, data: undefined, refetch: h.refetch };
      renderToday();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Namaste, Ramesh ji');
    });
  });

  it('headings come in the reader\'s language', () => {
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report()] }));
    renderToday('/', { lang: 'hi' });
    expect(screen.getByText('आपका काम')).toBeInTheDocument();
    expect(screen.getByText('आपके पंप का हाल')).toBeInTheDocument();
    expect(screen.getByText('सभी रिपोर्ट देखें')).toBeInTheDocument();
  });

  it('speaks Latin-script Hindi for Hinglish readers', () => {
    h.feed = loadedFeed(feed({ tasks: [task()], reports: [report()] }));
    renderToday('/', { lang: 'hl' });
    expect(screen.getByText('Aapka kaam')).toBeInTheDocument();
    expect(screen.getByText('Aapke pump ka haal')).toBeInTheDocument();
  });
});

// ── states ─────────────────────────────────────────────────────────────────
describe('TodayPage — grey text on the wallpaper', () => {
  it('sets the page\'s grey darker than the chat\'s, so the date line and headings pass 4.5:1', () => {
    renderToday();
    expect(screen.getByTestId('today-page').className).toContain('[--wa-meta:#546570]');
  });
});

describe('TodayPage — loading, error, empty', () => {
  it('draws the shape of the page while the first answer is on its way', () => {
    h.feed = { status: 'pending', fetchStatus: 'fetching', isError: false, isFetching: true, data: undefined, refetch: h.refetch };
    renderToday();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(within(status).getByText(/Loading today/)).toBeInTheDocument();
    expect(markFirstScreen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('says it could not load — not that nothing happened — and offers a retry', () => {
    h.feed = { status: 'error', fetchStatus: 'idle', isError: true, isFetching: false, data: undefined, refetch: h.refetch };
    renderToday();
    expect(screen.getByText('Could not load Today')).toBeInTheDocument();
    expect(screen.queryByText('Nothing for today yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('treats a paused fetch (offline) with nothing in hand as a failure, not an empty page', () => {
    h.feed = { status: 'pending', fetchStatus: 'paused', isError: false, isFetching: false, data: undefined, refetch: h.refetch };
    renderToday();
    expect(screen.getByText('Could not load Today')).toBeInTheDocument();
  });

  it('settles a feed that is never asked for (an admin signed in here): the empty page, not grey rows for good', () => {
    h.feed = { status: 'pending', fetchStatus: 'idle', isError: false, isFetching: false, data: undefined, refetch: h.refetch };
    renderToday();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Nothing for today yet')).toBeInTheDocument();
    expect(markFirstScreen).toHaveBeenCalled();
  });

  it('keeps showing what it has when a background refresh fails', () => {
    h.tiles.dsr_sales = { value: '10,430 L' };
    h.feed = loadedFeed(feed({ reports: [report()] }), { isError: true, status: 'error' });
    renderToday();
    expect(screen.queryByText('Could not load Today')).not.toBeInTheDocument();
    expect(screen.getByText('10,430 L')).toBeInTheDocument();
  });

  it('has a clean empty state for a new outlet: no headings, no ghost tiles', () => {
    renderToday();
    expect(screen.getByText('Nothing for today yet')).toBeInTheDocument();
    expect(screen.getByText(/Messages from the team stay in Chats/)).toBeInTheDocument();
    for (const heading of ['Your work', 'Needs a look', 'Your pump today', 'Done for you']) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId('today-ghost-tiles')).not.toBeInTheDocument();
  });

  it('shows the Kavach tile, not "nothing for today", when no report is in yet but Kavach is on', () => {
    h.kavach = kView({ now: [kItem({ late: true })] });
    renderToday();
    expect(screen.queryByText('Nothing for today yet')).not.toBeInTheDocument();
    expect(screen.getByText('Your pump today')).toBeInTheDocument();
    expect(document.querySelector('[data-tile="kavach"]')).not.toBeNull();
  });

  it('shows setup progress and dashed stand-in tiles, not a second "nothing yet", while a pump is being set up', () => {
    h.setup = makeSetupView({ strip: makeStrip(['done', 'current', 'todo', 'todo', 'todo']) });
    renderToday();
    expect(screen.getByTestId('today-setup')).toBeInTheDocument();
    expect(screen.queryByText('Nothing for today yet')).not.toBeInTheDocument();
    const ghosts = screen.getByTestId('today-ghost-tiles');
    // An owner: sales, stock, dues, water.
    expect(within(ghosts).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Your reports will appear here after setup.')).toBeInTheDocument();
    // No numbers, no warnings, no buttons in the ghosts.
    expect(within(ghosts).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText('Needs a look')).not.toBeInTheDocument();
  });
});

// ── Your work ──────────────────────────────────────────────────────────────
describe('TodayPage — Your work', () => {
  it('draws a card per task: a plain headline, one grey line and one button', () => {
    h.feed = loadedFeed(feed({ tasks: [task({ kind: 'du_otp', title: 'Enter the DU OTP', subtitle: 'Supply is stopped', messageId: 'm-du', id: 'du:1' })], reports: [report()] }));
    renderToday();
    const card = document.querySelector('[data-task-id="du:1"]') as HTMLElement;
    expect(within(card).getByText('Enter the DU OTP')).toBeInTheDocument();
    expect(within(card).getByText('Supply is stopped')).toBeInTheDocument();
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
    expect(within(late).getByText('Waiting a while')).toBeInTheDocument();
    expect(late.querySelector('svg')).not.toBeNull();
    const fresh = document.querySelector('[data-task-id="new:1"]') as HTMLElement;
    expect(within(fresh).queryByText('Waiting a while')).not.toBeInTheDocument();
  });

  it('shows the work one card at a time: every card is there, ‹ "1 of 5" › moves between them', () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => task({ id: `t${n}`, title: `Task ${n}` }));
    h.feed = loadedFeed(feed({ tasks, reports: [report()] }));
    renderToday();
    const slider = screen.getByTestId('today-work-slider');
    expect(slider).toHaveAttribute('aria-roledescription', 'slider');
    // Every card is a real, reachable slide (no "N more" to tap).
    expect(within(slider).getAllByTestId('today-work-slide')).toHaveLength(5);
    expect(within(slider).getByRole('group', { name: '1 of 5' })).toHaveTextContent('Task 1');
    expect(screen.queryByRole('button', { name: /more: Your work/ })).not.toBeInTheDocument();
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
    rerender(
      <Routes>
        <Route path="/" element={<><TodayPage /><Where /></>} />
      </Routes>,
    );
    expect(screen.getAllByTestId('today-work-slide')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Next task' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-work-position')).not.toBeInTheDocument();
  });

  it('says plainly that nothing is needed when there are reports but no tasks', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    expect(screen.getByText('Your work')).toBeInTheDocument();
    expect(screen.getByTestId('today-work-clear')).toHaveTextContent('Nothing needed from you today.');
  });

  it('does not repeat the setup step as a card while the setup block above carries it', () => {
    h.setup = makeSetupView();
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'setup:1', kind: 'setup', title: 'Add your bill details', messageId: 'm-setup' })], reports: [report()] }));
    renderToday();
    expect(screen.getByTestId('today-setup')).toBeInTheDocument();
    expect(document.querySelector('[data-task-kind="setup"]')).toBeNull();
    // No "nothing needed from you" under an open setup step.
    expect(screen.queryByTestId('today-work-clear')).not.toBeInTheDocument();
  });

  it('lists the setup task as a card once the pump is live', () => {
    h.setup = makeSetupView({ stage: 'live' });
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'setup:1', kind: 'setup', title: 'Add your bill details' })], reports: [report()] }));
    renderToday();
    expect(document.querySelector('[data-task-kind="setup"]')).not.toBeNull();
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

// ── Needs a look ───────────────────────────────────────────────────────────
describe('TodayPage — Needs a look', () => {
  const water: KindAlert = { headline: '2 checks were missed', line: 'They cannot be recorded now.', severity: 'attention' };
  const variation: KindAlert = { headline: 'Diesel 412 L short', line: 'Your stock is below the limit.', severity: 'problem' };

  it('draws a card per alert: the kind\'s icon, a status badge, a big headline, one line and one button', () => {
    h.alerts.dsr_variation = variation;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation' })] }));
    renderToday();
    const card = document.querySelector('[data-report-id="m-dsr_variation"]') as HTMLElement;
    expect(within(card).getByText('Diesel 412 L short')).toBeInTheDocument();
    expect(within(card).getByText('Your stock is below the limit.')).toBeInTheDocument();
    // Shape and word, never colour alone.
    const badge = card.querySelector('[data-status="problem"]') as HTMLElement;
    expect(badge).toHaveTextContent('Problem');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(within(card).getAllByRole('button')).toHaveLength(1);
    expect(card.getAttribute('data-severity')).toBe('problem');
  });

  describe('a thing is shown once', () => {
    const duTask = () =>
      task({ id: 'du-box', kind: 'du_otp', title: 'Do the DU OTP', action: { type: 'open_chat' }, messageId: 'm-du-box' });

    it('drops the DU OTP alert while the DU OTP steps are a card under Your work', () => {
      h.alerts.du_otp = { headline: 'A dispenser paper is due', line: 'x', severity: 'attention' };
      h.feed = loadedFeed(feed({ tasks: [duTask()], reports: [report({ kind: 'du_otp' }), report({ kind: 'dsr_variation' })] }));
      h.alerts.dsr_variation = variation;
      renderToday();
      expect(screen.getByText('Do the DU OTP')).toBeInTheDocument();
      expect(screen.queryByText('A dispenser paper is due')).not.toBeInTheDocument();
      // The other alert is still there.
      expect(screen.getByText('Diesel 412 L short')).toBeInTheDocument();
      expect(document.querySelector('[data-report-id="m-du_otp"]')).toBeNull();
    });

    it('keeps the alert when the box is not open', () => {
      h.alerts.du_otp = { headline: 'A dispenser paper is due', line: 'x', severity: 'attention' };
      h.feed = loadedFeed(feed({ reports: [report({ kind: 'du_otp' })] }));
      renderToday();
      expect(screen.getByText('A dispenser paper is due')).toBeInTheDocument();
    });

    it('does not list the covered words-only warning again as an earlier report', () => {
      h.feed = loadedFeed(
        feed({
          tasks: [duTask()],
          reports: [oldReport({ kind: 'du_otp', status: 'attention', headline: 'A paper is due.' })],
        }),
      );
      renderToday();
      expect(screen.getByText('Do the DU OTP')).toBeInTheDocument();
      expect(document.querySelector('[data-report-id="m-du_otp"]')).toBeNull();
      expect(screen.queryByText('A paper is due.')).not.toBeInTheDocument();
    });

  });

  it('"See details" opens the report screen for that exact message', () => {
    h.alerts.dsr_variation = variation;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', conversationId: 'conv 9', messageId: 'm-var' })] }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: /See details/ }));
    expect(where()).toHaveTextContent('/report/conv%209/m-var|');
  });

  it('marks the report read the first time it is opened here, and only once, and not while hidden', () => {
    h.alerts.dsr_variation = variation;
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', messageId: 'm-var' })] }));
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
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', messageId: 'm-var' })] }));
    renderToday();
    expect(h.emit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /See details/ }));
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledWith('read', { conversationId: 'c1', messageIds: ['m-var'] });
  });

  it('puts a problem before a card that needs a look, whatever order the reports came in', () => {
    h.alerts.dsr_variation = variation;
    h.alerts.water_ingress = water;
    h.feed = loadedFeed(
      feed({
        reports: [
          report({ kind: 'water_ingress', sentAt: '2026-11-24T09:00:00.000Z' }),
          report({ kind: 'dsr_variation', sentAt: '2026-11-24T01:00:00.000Z' }),
        ],
      }),
    );
    renderToday();
    const list = screen.getByRole('list', { name: /^Needs a look/ });
    const heads = within(list).getAllByText(/short|missed/).map((el) => el.textContent);
    expect(heads).toEqual(['Diesel 412 L short', '2 checks were missed']);
  });

  it('shows three alerts and "N more" for the rest', () => {
    const kinds: ReportKind[] = ['dsr_variation', 'water_ingress', 'stock_check', 'load_plan', 'ro_supply'];
    for (const k of kinds) h.alerts[k] = { headline: `Alert ${k}`, line: 'line', severity: 'attention' };
    h.feed = loadedFeed(feed({ reports: kinds.map((kind, i) => report({ kind, sentAt: `2026-11-24T0${i}:00:00.000Z` })) }));
    renderToday();
    expect(screen.getAllByRole('button', { name: /See details/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '2 more: Needs a look' }));
    expect(screen.getAllByRole('button', { name: /See details/ })).toHaveLength(5);
  });

  it('says calmly that nothing needs a look when no kind flags anything', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    expect(screen.getByText('Needs a look')).toBeInTheDocument();
    expect(screen.getByTestId('today-attention-clear')).toHaveTextContent('Nothing needs a look right now.');
  });

  it('shows an old report that was marked "needs a look" in the team\'s words, once', () => {
    h.feed = loadedFeed(
      feed({ reports: [oldReport({ kind: 'credit_dod', messageId: 'm-credit', status: 'attention', headline: 'Credit is over the limit.' })] }),
    );
    renderToday();
    const cards = document.querySelectorAll('[data-report-id="m-credit"]');
    expect(cards).toHaveLength(1);
    expect(within(cards[0] as HTMLElement).getByText('Credit is over the limit.')).toBeInTheDocument();
    expect(within(cards[0] as HTMLElement).getByText('Credit & DOD')).toBeInTheDocument();
  });

  it('keeps an owner\'s alert from a manager', () => {
    h.alerts.credit_dod = { headline: 'Rs 2,30,000 overdue', line: 'x', severity: 'problem' };
    h.feed = loadedFeed(feed({ role: 'manager', reports: [report({ kind: 'credit_dod' })] }));
    renderToday('/', { role: 'dealer-staff' });
    expect(screen.queryByText('Rs 2,30,000 overdue')).not.toBeInTheDocument();
  });

  it('draws the alert in Hindi when the kind says it in Hindi', () => {
    h.alerts.water_ingress = { headline: '2 जाँच छूट गईं', line: 'अब रिकॉर्ड नहीं हो सकतीं।', severity: 'attention' };
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'water_ingress' })] }));
    renderToday('/', { lang: 'hi' });
    expect(screen.getByText('2 जाँच छूट गईं')).toBeInTheDocument();
    const card = document.querySelector('[data-report-id="m-water_ingress"]') as HTMLElement;
    expect(card.querySelector('[data-status="attention"]')).toHaveTextContent('ध्यान दें');
    expect(screen.getByRole('button', { name: /विवरण देखें/ })).toBeInTheDocument();
  });

  it('is not drawn while setup has not started, and has nothing to flag', () => {
    h.setup = makeSetupView();
    h.feed = loadedFeed(feed({ tasks: [task()] }));
    renderToday();
    expect(screen.queryByText('Needs a look')).not.toBeInTheDocument();
  });
});

// ── Your pump today ────────────────────────────────────────────────────────
describe('TodayPage — Your pump today', () => {
  const allKinds = (): TodayReport[] =>
    (['water_ingress', 'credit_dod', 'dsr_variation', 'stock_check', 'dsr_sales', 'load_plan'] as ReportKind[]).map(
      (kind) => report({ kind }),
    );

  beforeEach(() => {
    h.tiles = {
      dsr_sales: { value: '10,430 L', sub: 'Diesel and petrol' },
      stock_check: { value: '24,330 L', sub: 'lasts 4 days' },
      dsr_variation: { value: 'All fine', status: 'ok' },
      credit_dod: { value: 'Rs 1,24,000', sub: 'by 27 Nov', status: 'attention' },
      water_ingress: { value: '10 / 12', sub: '2 missed', status: 'attention' },
      load_plan: { value: 'Order today', status: 'problem' },
    };
  });

  const tileOrder = () => Array.from(document.querySelectorAll('[data-tile]')).map((el) => el.getAttribute('data-tile'));

  it('lays the tiles out in the one fixed order for an owner, Kavach last', () => {
    h.kavach = kView();
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    expect(tileOrder()).toEqual(['sales', 'stock', 'variation', 'dues', 'water', 'tanker', 'kavach']);
  });

  it('keeps that order when the statuses change', () => {
    h.kavach = kView({ now: [kItem({ late: true })] });
    h.tiles.dsr_sales = { value: '0 L', status: 'attention' };
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    expect(tileOrder()).toEqual(['sales', 'stock', 'variation', 'dues', 'water', 'tanker', 'kavach']);
  });

  it('draws each tile with the kind\'s name, its big value and its small line', () => {
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    const stock = document.querySelector('[data-tile="stock"]') as HTMLElement;
    expect(within(stock).getByText('Tank stock')).toBeInTheDocument();
    expect(within(stock).getByText('24,330 L')).toBeInTheDocument();
    expect(within(stock).getByText('lasts 4 days')).toBeInTheDocument();
  });

  it('draws the kind\'s own mini signature in the tile', () => {
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    const stock = document.querySelector('[data-tile="stock"]') as HTMLElement;
    expect(within(stock).getByTestId('glyph-stock_check')).toBeInTheDocument();
  });

  it('shows a badge, a shape and a word, only when the report is not fine', () => {
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    const fine = document.querySelector('[data-tile="variation"]') as HTMLElement;
    expect(fine.querySelector('[data-status]')).toBeNull();
    const water = document.querySelector('[data-tile="water"]') as HTMLElement;
    const badge = water.querySelector('[data-status="attention"]') as HTMLElement;
    expect(badge).toHaveTextContent('Needs a look');
    expect(badge.querySelector('svg')).not.toBeNull();
    const tanker = document.querySelector('[data-tile="tanker"]') as HTMLElement;
    expect(tanker.querySelector('[data-status="problem"]')).toHaveTextContent('Problem');
  });

  it('only the sales tile is full width', () => {
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    expect((document.querySelector('[data-tile="sales"]') as HTMLElement).className).toContain('col-span-full');
    expect((document.querySelector('[data-tile="stock"]') as HTMLElement).className).not.toContain('col-span-full');
  });

  it('grows to one column when the text is large: the column width is in rem', () => {
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    const grid = document.querySelector('[data-tile]')!.parentElement as HTMLElement;
    expect(grid.className).toContain('minmax(8.5rem');
  });

  it('opens the report screen from the whole tile, and marks it read', () => {
    h.feed = loadedFeed(feed({ reports: allKinds().map((r) => (r.kind === 'stock_check' ? { ...r, messageId: 'm-stock', conversationId: 'c4' } : r)) }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: /Tank stock: 24,330 L/ }));
    expect(where()).toHaveTextContent('/report/c4/m-stock|');
    expect(h.emit).toHaveBeenCalledWith('read', { conversationId: 'c4', messageIds: ['m-stock'] });
  });

  it('opens a tile with the row the tile holds, so the report screen needs no network to draw', () => {
    h.feed = loadedFeed(feed({ reports: allKinds().map((r) => (r.kind === 'stock_check' ? { ...r, messageId: 'm-stock' } : r)) }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: /Tank stock: 24,330 L/ }));
    expect(JSON.parse(where().textContent!.split('|')[1]!)).toMatchObject({ report: { messageId: 'm-stock' } });
  });

  it('says the day on a tile whose figures are not from today, in the spoken label too', () => {
    h.feed = loadedFeed(
      feed({ reports: [report({ kind: 'dsr_variation', day: '2026-11-21', sentAt: '2026-11-21T06:00:00.000Z' }), report({ kind: 'water_ingress' })] }),
    );
    renderToday();
    const old = document.querySelector('[data-tile="variation"]') as HTMLElement;
    expect(old.querySelector('[data-tile-day]')).toHaveTextContent('21 November');
    expect(within(old).getByRole('button')).toHaveAccessibleName(/21 November/);
    // Today's own figures carry no extra line.
    expect((document.querySelector('[data-tile="water"]') as HTMLElement).querySelector('[data-tile-day]')).toBeNull();
  });

  it('keeps a figure of 10 lakh or more on one line, in a smaller size, whatever the tile width', () => {
    h.kavach = kView();
    h.tiles.credit_dod = { value: '₹11,79,215', status: 'attention' };
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    const value = document.querySelector('[data-tile="dues"] [data-tile-value]') as HTMLElement;
    expect(value).toHaveTextContent('₹11,79,215');
    expect(value.className).toContain('whitespace-nowrap');
    expect(value.className).not.toContain('break-words');
    expect(value.className).not.toContain('text-[1.75rem]');
    // A short figure keeps the big size.
    expect((document.querySelector('[data-tile="kavach"] [data-tile-value]') as HTMLElement).className).toContain('text-[1.75rem]');
  });

  it('names the status in the tile\'s spoken label, not only in colour', () => {
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    expect(screen.getByRole('button', { name: /10 \/ 12\. 2 missed\. Needs a look/ })).toBeInTheDocument();
  });

  it('shows a tile only for a kind that has a report with a snapshot', () => {
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'stock_check' }), oldReport({ kind: 'water_ingress' })] }));
    renderToday();
    expect(tileOrder()).toEqual(['stock']);
  });

  it('has no dues tile for a manager', () => {
    h.feed = loadedFeed(feed({ role: 'manager', reports: allKinds() }));
    renderToday('/', { role: 'dealer-staff' });
    expect(tileOrder()).not.toContain('dues');
    expect(tileOrder()).toContain('stock');
  });

  it('reads the sales tile from a message that holds both DSR sheets', () => {
    h.tiles.dsr_variation = { value: 'Diesel -310 L', status: 'problem' };
    const both = report({
      kind: 'dsr_variation',
      messageId: 'm-both',
      data: {
        kind: 'dsr_variation',
        v: 1,
        sheets: ['variation', 'sales'],
        capturedAt: '2026-11-24T05:00:00.000Z',
        outletCode: '12E',
        businessDate: '2026-11-24',
        shiftTime: null,
        revised: false,
        products: [{ key: 'diesel', tankNos: [1], variation: {}, sales: {} }],
      } as unknown as ReportData,
    });
    h.feed = loadedFeed(feed({ reports: [both] }));
    renderToday();
    expect(tileOrder()).toEqual(['sales', 'variation']);
    fireEvent.click(screen.getByRole('button', { name: /Daily sales/ }));
    expect(where()).toHaveTextContent('/report/c1/m-both|');
  });

  it('says calmly that numbers are coming when there is no tile yet', () => {
    h.feed = loadedFeed(feed({ reports: [oldReport()] }));
    renderToday();
    expect(screen.getByTestId('today-pump-empty')).toHaveTextContent(/numbers will show here/);
  });

  it('"See all reports" opens the history', () => {
    h.feed = loadedFeed(feed({ reports: allKinds() }));
    renderToday();
    fireEvent.click(screen.getByRole('button', { name: 'See all reports' }));
    expect(where()).toHaveTextContent('/reports|');
  });

  it('has no "See all reports" when there is no report at all', () => {
    h.feed = loadedFeed(feed({ tasks: [task()] }));
    renderToday();
    expect(screen.queryByRole('button', { name: 'See all reports' })).not.toBeInTheDocument();
  });

  it('lets a tile that throws cost only itself', () => {
    h.tiles.dsr_sales = { value: '10,430 L' };
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_sales', data: { kind: 'dsr_sales', v: 1 } as unknown as ReportData }), report({ kind: 'stock_check' })] }));
    renderToday();
    expect(tileOrder()).toEqual(['sales', 'stock']);
  });
});

// ── earlier reports ────────────────────────────────────────────────────────
describe('TodayPage — earlier reports (no snapshot)', () => {
  it('keeps an older report reachable in a calm row, which opens the report screen', () => {
    h.feed = loadedFeed(feed({ reports: [oldReport({ messageId: 'm-old', headline: 'Sales are in for today.' })] }));
    renderToday();
    expect(screen.getByText('Earlier reports')).toBeInTheDocument();
    // The spoken name holds what is written on the row (the name, the day, the words), then "Open".
    fireEvent.click(
      screen.getByRole('button', { name: /^Daily sales \(DSR\) · Today\. Sales are in for today\.\. Open Daily sales \(DSR\)$/ }),
    );
    expect(where()).toHaveTextContent('/report/c1/m-old|');
    // It hands the report screen the row it holds, so the screen draws at once.
    expect(JSON.parse(where().textContent!.split('|')[1]!)).toMatchObject({
      report: { messageId: 'm-old', kind: 'dsr_sales' },
      openedFromMessageId: 'm-old',
      backgroundLocation: { pathname: '/' },
    });
    expect(h.emit).toHaveBeenCalledWith('read', { conversationId: 'c1', messageIds: ['m-old'] });
  });

  it('draws the day the report is about', () => {
    h.feed = loadedFeed(feed({ reports: [oldReport({ day: '2026-11-22' })] }));
    renderToday();
    expect(screen.getByText(/22 November/)).toBeInTheDocument();
  });

  it('shows at most four, newest first', () => {
    const kinds: ReportKind[] = ['dsr_sales', 'stock_check', 'water_ingress', 'credit_dod', 'ro_supply', 'announcement'];
    h.feed = loadedFeed(feed({ reports: kinds.map((kind, i) => oldReport({ kind, sentAt: `2026-11-24T0${i}:00:00.000Z` })) }));
    renderToday();
    const rows = within(screen.getByRole('list', { name: 'Earlier reports' })).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute('data-report-kind', 'announcement');
  });

  it('draws a tanker card with no snapshot as the card it is, and goes to its chat message', () => {
    h.feed = loadedFeed(
      feed({
        reports: [
          oldReport({
            messageId: 'm-fuel',
            kind: 'fuel_order',
            attachments: [],
            headline: 'Tanker is on its way.',
            fuelCard: {
              kind: 'tanker_on_way',
              title: { en: 'Tanker on its way', hi: 'टैंकर रास्ते में है', hl: 'Tanker raaste mein hai' },
              heroLabel: { en: 'Tanker number', hi: 'टैंकर नंबर', hl: 'Tanker number' },
              hero: 'HR38AB1234',
              rows: [],
            } as unknown as TodayReport['fuelCard'],
          }),
        ],
      }),
    );
    renderToday();
    expect(screen.getByTestId('fuel-order-card-hero')).toHaveTextContent('HR38AB1234');
    fireEvent.click(screen.getByRole('button', { name: 'See in chat' }));
    expect(where()).toHaveTextContent('"jumpToMessageId":"m-fuel"');
  });

  it('does not list a report that already has a card above', () => {
    h.alerts.dsr_variation = { headline: 'Diesel short', line: 'x', severity: 'problem' };
    h.feed = loadedFeed(feed({ reports: [report({ kind: 'dsr_variation', messageId: 'm-var' })] }));
    renderToday();
    expect(document.querySelectorAll('[data-report-id="m-var"]')).toHaveLength(1);
  });

  it('keeps an owner\'s older report from a manager', () => {
    h.feed = loadedFeed(feed({ role: 'manager', reports: [oldReport({ kind: 'credit_dod', messageId: 'm-c' }), report({ kind: 'stock_check' })] }));
    h.tiles.stock_check = { value: '1 L' };
    renderToday('/', { role: 'dealer-staff' });
    expect(document.querySelector('[data-report-id="m-c"]')).toBeNull();
  });
});

// ── Done for you ───────────────────────────────────────────────────────────
describe('TodayPage — Done for you', () => {
  it('lists the receipts at the bottom, with the kind\'s own line, and opens the report screen', () => {
    h.headlines.declaration_filed = 'Safety declaration filed';
    h.feed = loadedFeed(feed({ reports: [report()], done: [report({ kind: 'declaration_filed', messageId: 'm-decl', headline: 'Declaration filed (words)' })] }));
    renderToday();
    const sections = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent?.replace(/\d+$/, ''));
    expect(sections[sections.length - 1]).toBe('Done for you');
    const row = document.querySelector('[data-report-id="m-decl"]') as HTMLElement;
    expect(within(row).getByText('Safety declaration filed')).toBeInTheDocument();
    expect(within(row).getByText('Today')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button'));
    expect(where()).toHaveTextContent('/report/c1/m-decl|');
  });

  it('speaks the line and the day, not only "Open <name>" (the visible words are in the name)', () => {
    h.headlines.declaration_filed = 'Diesel 826.7, petrol 756.2';
    h.feed = loadedFeed(feed({ done: [report({ kind: 'declaration_filed', messageId: 'm-decl', day: '2026-11-23', sentAt: '2026-11-24T05:00:00.000Z' })] }));
    renderToday();
    const row = document.querySelector('[data-report-id="m-decl"]') as HTMLElement;
    expect(within(row).getByRole('button')).toHaveAccessibleName(/^Diesel 826\.7, petrol 756\.2\. Yesterday\. Open /);
  });

  it('falls back to the team\'s words for a receipt with no snapshot', () => {
    h.feed = loadedFeed(feed({ done: [oldReport({ kind: 'tt_ack', messageId: 'm-tt', headline: 'Tanker receipt filed.' })] }));
    renderToday();
    const row = document.querySelector('[data-report-id="m-tt"]') as HTMLElement;
    expect(within(row).getByText('Tanker receipt filed.')).toBeInTheDocument();
  });

  it('shows three and "N more"', () => {
    const done = ['declaration_filed', 'mock_drill', 'tt_ack', 'du_otp', 'tanker_density'].map((kind, i) =>
      report({ kind: kind as ReportKind, messageId: `d${i}`, sentAt: `2026-11-24T0${i}:00:00.000Z` }),
    );
    h.feed = loadedFeed(feed({ done }));
    renderToday();
    expect(document.querySelectorAll('[data-report-id^="d"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '2 more: Done for you' }));
    expect(document.querySelectorAll('[data-report-id^="d"]')).toHaveLength(5);
  });

  it('says calmly that nothing is done yet', () => {
    h.feed = loadedFeed(feed({ reports: [report()] }));
    renderToday();
    expect(screen.getByTestId('today-done-clear')).toBeInTheDocument();
  });
});

// ── the order of the whole page ────────────────────────────────────────────
describe('TodayPage — the order of the page', () => {
  it('goes greeting, setup, Your work, Needs a look, Your pump today, Done for you', () => {
    h.setup = makeSetupView();
    h.alerts.water_ingress = { headline: 'Missed', line: 'x', severity: 'attention' };
    h.tiles.stock_check = { value: '24,330 L' };
    h.feed = loadedFeed(
      feed({
        tasks: [task()],
        reports: [report({ kind: 'water_ingress' }), report({ kind: 'stock_check' })],
        done: [report({ kind: 'declaration_filed' })],
      }),
    );
    renderToday();
    const order = Array.from(document.querySelectorAll('h1, [data-testid="today-setup"], h2[id]')).map((el) =>
      el.tagName === 'H1' ? 'greeting' : el.tagName === 'H2' ? el.id : 'setup',
    );
    expect(order).toEqual(['greeting', 'setup', 'today-work', 'today-attention', 'today-pump', 'today-done']);
  });

  it('draws the page for a manager from the same feed, without the owner\'s setup block', () => {
    h.setup = makeSetupView();
    h.feed = loadedFeed(feed({ role: 'manager', tasks: [task()], reports: [report({ kind: 'stock_check' })] }));
    h.tiles.stock_check = { value: 'Stock is in' };
    renderToday('/', { role: 'dealer-staff' });
    expect(screen.getByText('Stock is in')).toBeInTheDocument();
    expect(screen.getByText('Send the density register photo')).toBeInTheDocument();
    expect(screen.queryByTestId('today-setup')).not.toBeInTheDocument();
  });
});

// ── setup ──────────────────────────────────────────────────────────────────
describe('TodayPage — setup summary', () => {
  it('shows the steps read-only, and a way into the chat box, while the pump is not started', () => {
    h.setup = makeSetupView();
    h.feed = loadedFeed(feed({ tasks: [task({ id: 'setup:1', kind: 'setup', title: 'Add your bill details', messageId: 'm-setup' })] }));
    renderToday();
    const card = screen.getByTestId('today-setup');
    expect(within(card).getAllByRole('listitem')).toHaveLength(5);
    expect(card.querySelector('[data-step="company"]')).toHaveAttribute('data-state', 'done');
    expect(card.querySelector('[data-step="billing"]')).toHaveAttribute('data-state', 'current');
    fireEvent.click(within(card).getByRole('button', { name: 'Continue in chat' }));
    expect(where()).toHaveTextContent('/chat/c1');
    expect(where()).toHaveTextContent('"jumpToMessageId":"m-setup"');
  });

  it('goes to the Chats tab by REPLACING the entry when the feed has no setup task, so Back still leaves in one press', async () => {
    h.setup = makeSetupView();
    h.feed = loadedFeed(feed());
    signIn({ id: 'owner', role: 'dealer-owner' });
    useLangStore.setState({ lang: 'en', explicit: true });
    function Back() {
      const go = useNavigate();
      return <button onClick={() => go(-1)}>history-back</button>;
    }
    renderWithProviders(
      <Routes>
        <Route path="/" element={<><TodayPage /><Where /></>} />
        <Route path="/chat" element={<><Where /><Back /></>} />
      </Routes>,
      { route: '/', withRouter: true },
    );
    fireEvent.click(within(screen.getByTestId('today-setup')).getByRole('button', { name: 'Continue in chat' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/chat|');
    fireEvent.click(screen.getByRole('button', { name: 'history-back' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/chat|');
  });

  it('is not drawn for a pump that is live', () => {
    h.setup = makeSetupView({ stage: 'live' });
    renderToday();
    expect(screen.queryByTestId('today-setup')).not.toBeInTheDocument();
  });

  it('is not drawn for a manager', () => {
    h.setup = makeSetupView();
    renderToday('/', { role: 'dealer-staff' });
    expect(screen.queryByTestId('today-setup')).not.toBeInTheDocument();
  });
});
