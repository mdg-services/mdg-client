import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppBar } from '@/components/AppBar';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

// The shell's app-wide side effects — /me, the list socket, the delivery ack and
// the native push bridge — are not what this file is about, and every one of
// them reaches for a network or a native bridge jsdom does not have.
vi.mock('@/hooks/api/useMe', () => ({ useMe: () => ({ isSuccess: false, isFetchedAfterMount: false, data: undefined }) }));
vi.mock('@/features/chat/useConversationsListSocket', () => ({
  useConversationsListSocket: () => undefined,
}));
vi.mock('@/hooks/useDeliveryAck', () => ({ useDeliveryAck: () => undefined }));
vi.mock('@/hooks/usePushBridge', () => ({ usePushBridge: () => undefined }));
// Likewise the setup cards' socket listener: it reaches for the realtime socket.
vi.mock('@/features/setup/useOutletSetupSocket', () => ({
  useOutletSetupSocket: () => {
    h.setupSocketCalls += 1;
  },
}));

// …and the DU OTP box's, for the same reason.
vi.mock('@/features/chat/useDuOtpSocket', () => ({ useDuOtpSocket: () => undefined }));
vi.mock('@/features/chat/useMockDrillSocket', () => ({ useMockDrillSocket: () => undefined }));
vi.mock('@/features/chat/useDeclarationsSocket', () => ({
  useDeclarationsSocket: () => undefined,
}));

vi.mock('@/features/kavach/useKavachSocket', () => ({ useKavachSocket: () => undefined }));
// The tab bar's Kavach door reads the Kavach view: it is a table here, not the network.
vi.mock('@/hooks/api/useKavach', () => ({
  kavachKey: ['kavach', 'me'],
  useKavach: () => ({ data: h.kavach }),
}));

// …and the tab bar's badge reads the Today feed, which would reach for the network.
vi.mock('@/hooks/api/useTodayFeed', () => ({
  useTodayFeed: () => ({ data: h.feed }),
}));

const h = vi.hoisted(() => ({
  feed: undefined as { tasks: unknown[] } | undefined,
  kavach: undefined as { on: boolean; now: unknown[] } | undefined,
  keyboardOpen: false,
  keyboardHookCalls: 0,
  setupSocketCalls: 0,
  convos: [] as Conversation[],
}));

vi.mock('@/lib/useKeyboardViewport', () => ({
  useKeyboardViewport: () => {
    h.keyboardHookCalls += 1;
    return { keyboardOpen: h.keyboardOpen };
  },
}));
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => ({
    status: 'success',
    fetchStatus: 'idle',
    isError: false,
    isFetching: false,
    data: h.convos,
    refetch: vi.fn(),
  }),
}));

// The overlay itself is tested on its own (`features/reports`); the shell only has to mount it,
// and to hide the tab bar while it is up (what the real host does through `useHideTabBar`).
vi.mock('@/features/reports/lazy', async () => {
  const { useHideTabBar } = await import('@/features/tabs/tabBarVisibility');
  return {
    ReportHost: () => {
      useHideTabBar(true);
      return <div data-testid="report-host" />;
    },
    ReportModal: () => null,
  };
});

const { AppShell } = await import('./AppShell');
const { ChatListPage } = await import('./pages/ChatListPage');

/**
 * The shell: the frame every screen is drawn in.
 *
 * The shell draws NO header — each screen draws one bar of its own — and its
 * only bottom bar is the tab one, on Today, Services, Kavach and Chat alone (ADR 0055, 0056, 0057,
 * and the redesign's four doors, spec 2.1; Reports is the Services door's second pill). So this
 * file pins the frame: nothing stacked above a screen's own bar, nothing reserved
 * at the bottom, and a fixed-height frame for an open conversation only.
 *
 * It also pins what is NOT there any more. There used to be a strip under every
 * top bar saying "N things to send", and an engine wrapped around the whole frame
 * that ran its socket and its offline photo queue. MDG asks for papers in the
 * chat itself now (a message with a "Send photo" button), so the frame is just a
 * frame: no strip under any bar, and no engine to mount.
 */

function conv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    dealerId: 'd1',
    userId: 'owner',
    kind: 'support',
    participantUserIds: ['owner'],
    status: 'OPEN',
    unreadByAdmin: false,
    unreadByDealer: false,
    unreadDealerUserIds: [],
    lastMessageAt: '2026-08-24T10:00:00.000Z',
    lastMessagePreview: 'hi',
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Conversation;
}

/** A button that presses the phone's Back, so a test can see where Back lands. */
function PhoneBack() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      phone-back
    </button>
  );
}

/**
 * A stand-in for a screen: nothing but its own top bar (and a button that presses the phone's Back). A route stub WITHOUT one
 * would prove nothing about what hangs under a bar. The bar's title is the
 * stub's only text.
 */
function Screen({ name }: { name: string }) {
  return (
    <>
      <AppBar title={name} />
      <PhoneBack />
    </>
  );
}

function renderShell(route: string) {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Screen name="today-page" />} />
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/reports" element={<Screen name="reports-page" />} />
        <Route path="/chat/:id" element={<Screen name="thread-page" />} />
        <Route path="/chat/:id/info" element={<Screen name="info-page" />} />
        <Route path="/settings" element={<Screen name="settings-page" />} />
        <Route path="/services" element={<Screen name="services-page" />} />
        <Route path="/services/:serviceId" element={<Screen name="service-page" />} />
        <Route path="/pump" element={<Screen name="pump-page" />} />
        <Route path="/kavach" element={<Screen name="kavach-page" />} />
      </Route>
    </Routes>,
    { route, withRouter: true },
  );
}

afterEach(() => {
  resetStores();
  h.keyboardOpen = false;
  h.keyboardHookCalls = 0;
  h.setupSocketCalls = 0;
  h.kavach = undefined;
  h.convos = [];
  h.feed = undefined;
});

describe('AppShell — the frame', () => {
  /**
   * One bar per screen. The shell used to print its own header (the brand, a
   * language switch, an avatar) above every screen's content, so a conversation
   * wore two stacked bars and a language switch nobody could miss.
   */
  it('draws no header of its own — the screen brings its bar', async () => {
    renderShell('/settings');

    // One title on screen: the screen's own bar.
    expect(await screen.findByText('settings-page')).toBeInTheDocument();
    expect(screen.queryByText('Dealer Kavach')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    // …and the language switch that lived in the old header is gone with it.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  // The bar has three doors (a fourth where Kavach is on), and only on the screens they open.
  it.each([
    ['/', 'today-page', 'Today'],
    ['/chat', 'Chats', 'Chat'],
    ['/services', 'services-page', 'Services'],
    // Reports is the Services door's second pill: the old address still opens, on that door.
    ['/reports', 'reports-page', 'Services'],
  ])('draws the Today / Services / Chat bar on %s, with %s\'s door %s selected', async (route, marker, selected) => {
    h.convos = [conv({ id: 'only' })];
    renderShell(route);
    await screen.findByText(marker);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.replace(/\d+$/, ''))).toEqual(['Today', 'Services', 'Chat']);
    expect(screen.getByRole('tab', { name: new RegExp(`^${selected}`) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('adds the Kavach door, with the points to do on it, where Kavach is on for the pump', async () => {
    h.convos = [conv({ id: 'only' })];
    const todo = { canSend: true, how: 'photo', everyDays: 1, state: 'todo', late: false };
    h.kavach = { on: true, now: [todo, todo] };
    renderShell('/services');
    await screen.findByText('services-page');
    const tabs = screen.getAllByRole('tab');
    // The badge's number comes before the word.
    expect(tabs.map((tab) => tab.textContent?.replace(/^\d+/, ''))).toEqual(['Today', 'Services', 'Kavach', 'Chat']);
    expect(screen.getByRole('img', { name: '2 to do' })).toHaveTextContent('2');
  });

  it.each([
    ['/settings', 'settings-page'],
    ['/services/dsr_sales', 'service-page'],
    ['/pump', 'pump-page'],
    ['/chat/c1', 'thread-page'],
    ['/chat/c1/info', 'info-page'],
  ])('draws no tab bar on %s — not in a chat, not on Settings, not on a sub-page', async (route, title) => {
    renderShell(route);
    await screen.findByText(title);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('puts the bar away while the keyboard is up', async () => {
    h.keyboardOpen = true;
    renderShell('/');
    await screen.findByText('today-page');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('counts what is waiting: open tasks on Today, chats with something unread on Chat', async () => {
    h.feed = { tasks: [{}, {}, {}] };
    h.convos = [
      conv({ id: 'a', unreadCount: 2 }),
      conv({ id: 'b', unreadCount: 0 }),
      conv({ id: 'c', unreadCount: 5 }),
    ];
    renderShell('/');
    await screen.findByText('today-page');

    expect(screen.getByRole('img', { name: '3 for you' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 unread' })).toBeInTheDocument();
  });

  it('moves between the doors, one screen replacing the other', async () => {
    h.convos = [conv({ id: 'only' })];
    const user = userEvent.setup();
    renderShell('/');
    await screen.findByText('today-page');

    await user.click(screen.getByRole('tab', { name: /^Chat/ }));
    expect(await screen.findByText('Chats')).toBeInTheDocument();
    expect(screen.queryByText('today-page')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Today/ }));
    expect(await screen.findByText('today-page')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Services/ }));
    expect(await screen.findByText('services-page')).toBeInTheDocument();
    expect(screen.queryByText('today-page')).not.toBeInTheDocument();
  });

  // The Back rule (spec 2.4): Back from another door lands on Today, and Back on Today leaves.
  it('the phone\'s Back from Services lands on Today: Today pushed one entry', async () => {
    const user = userEvent.setup();
    renderShell('/');
    await screen.findByText('today-page');
    await user.click(screen.getByRole('tab', { name: /^Services/ }));
    expect(await screen.findByText('services-page')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'phone-back' }));
    expect(await screen.findByText('today-page')).toBeInTheDocument();
  });

  it('the phone\'s Back from the next door still lands on Today: one door to another replaces', async () => {
    h.kavach = { on: true, now: [] };
    const user = userEvent.setup();
    renderShell('/');
    await screen.findByText('today-page');
    await user.click(screen.getByRole('tab', { name: /^Services/ }));
    await screen.findByText('services-page');
    await user.click(screen.getByRole('tab', { name: /^Kavach/ }));
    expect(await screen.findByText('kavach-page')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'phone-back' }));
    expect(await screen.findByText('today-page')).toBeInTheDocument();
  });

  /**
   * ADR 0056 §4: an open report is drawn OVER the screen behind it. The shell mounts the
   * overlay when the app's real address is a report's, and the bar steps aside under it.
   */
  describe('a report open over a screen', () => {
    it('mounts the overlay and puts the tab bar away, with the screen still there beneath', async () => {
      signIn({ id: 'owner', dealerId: 'd1' });
      useLangStore.setState({ lang: 'en', explicit: true });
      renderWithProviders(
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Screen name="today-page" />} />
            <Route path="/report/:conversationId/:messageId" element={<Screen name="today-page" />} />
          </Route>
        </Routes>,
        { route: '/report/c1/m1', withRouter: true },
      );
      expect(await screen.findByTestId('report-host')).toBeInTheDocument();
      expect(screen.getByText('today-page')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('mounts no overlay on any other address', async () => {
      renderShell('/');
      await screen.findByText('today-page');
      expect(screen.queryByTestId('report-host')).not.toBeInTheDocument();
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });
  });

  /**
   * `pb-20` reserved 80px for the tab bar. With the bar gone it would lift the
   * composer 80px off the bottom edge for nothing.
   */
  it.each([
    ['/settings', 'settings-page'],
    ['/chat/c1', 'thread-page'],
    ['/chat/c1/info', 'info-page'],
  ])('reserves nothing at the bottom of %s', async (route, title) => {
    const { container } = renderShell(route);
    await screen.findByText(title);

    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main!.className).not.toMatch(/\bpb-/);
  });

  /**
   * An open conversation is a fixed-height frame bound to the visible viewport
   * — that is what keeps the composer above the keyboard — and its `main` clips
   * so the message list scrolls on its own.
   */
  it('fixes the frame to the visible viewport on an open conversation', async () => {
    const { container } = renderShell('/chat/c1');
    await screen.findByText('thread-page');

    expect((container.firstElementChild as HTMLElement).style.height).toBe('var(--vvh, 100dvh)');
    expect(container.querySelector('main')!.className).toMatch(/overflow-hidden/);
  });

  // The match is exact: `/chat/:id/info` and `/chat/:id/media` scroll as pages.
  it.each([
    ['/chat/c1/info', 'info-page'],
    ['/settings', 'settings-page'],
    ['/services', 'services-page'],
  ])('leaves %s as an ordinary scrolling page', async (route, title) => {
    const { container } = renderShell(route);
    await screen.findByText(title);

    expect((container.firstElementChild as HTMLElement).style.height).toBe('');
    expect(container.querySelector('main')!.className).not.toMatch(/overflow-hidden/);
  });

  it('leaves the chat list as an ordinary scrolling page', async () => {
    h.convos = [conv({ id: 'support' })];
    const { container } = renderShell('/chat');
    await screen.findByText('Chats');

    expect((container.firstElementChild as HTMLElement).style.height).toBe('');
    expect(container.querySelector('main')!.className).not.toMatch(/overflow-hidden/);
  });

  /**
   * The keyboard hook is what publishes `--vvh` / `--kb` (the composer needs those
   * to stay above the keyboard) and what tells the tab bar to step aside.
   */
  it('keeps the keyboard hook mounted', async () => {
    renderShell('/settings');
    await screen.findByText('settings-page');
    expect(h.keyboardHookCalls).toBeGreaterThan(0);
  });
});

describe('AppShell — the setup cards stay live', () => {
  // The cards and the strip draw from the outlet's state and follow MDG's team
  // through the socket; the listener lives in the frame so it is on wherever the
  // dealer opened the app.
  it('keeps the setup listener mounted, on any screen', async () => {
    renderShell('/settings');
    await screen.findByText('settings-page');
    expect(h.setupSocketCalls).toBeGreaterThan(0);
  });
});

describe('AppShell — no ask strip', () => {
  /**
   * The strip is gone for good: on every screen, with a conversation list loaded
   * or not, nothing sits under the top bar and no button asks for a paper. What
   * MDG needs is asked in the chat, on the message that asks.
   */
  it.each([
    ['/chat/only', 'thread-page'],
    ['/settings', 'settings-page'],
    ['/services', 'services-page'],
  ])('draws nothing under the top bar of %s', async (route, title) => {
    const { container } = renderShell(route);
    await screen.findByText(title);

    // The bar is the screen's only content: its sticky wrapper holds the bar and
    // nothing else.
    const wrapper = container.querySelector('main .sticky');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.children).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /to send|Send /i })).not.toBeInTheDocument();
  });

  it('draws nothing under the chat list bar either', async () => {
    h.convos = [conv({ id: 'only' })];
    renderShell('/chat');
    await screen.findByText('Chats');

    expect(screen.queryByRole('button', { name: /to send|Send /i })).not.toBeInTheDocument();
  });
});
