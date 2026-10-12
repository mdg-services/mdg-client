import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppBar } from '@/components/AppBar';
import type * as AsksModule from '@/hooks/api/useAsks';
import { useLangStore } from '@/store/lang';
import { TODAY, YESTERDAY, makeAskList, makeAskRow } from '@/test/askFixtures';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation, DealerDocumentAskList } from '@dk/shared/types';

// The shell's app-wide side effects — /me, the list socket, the delivery ack and
// the native push bridge — are not what this file is about, and every one of
// them reaches for a network or a native bridge jsdom does not have.
vi.mock('@/hooks/api/useMe', () => ({ useMe: () => undefined }));
vi.mock('@/features/chat/useConversationsListSocket', () => ({
  useConversationsListSocket: () => undefined,
}));
vi.mock('@/hooks/useDeliveryAck', () => ({ useDeliveryAck: () => undefined }));
vi.mock('@/hooks/usePushBridge', () => ({ usePushBridge: () => undefined }));

const h = vi.hoisted(() => ({
  keyboardOpen: false,
  keyboardHookCalls: 0,
  asks: undefined as DealerDocumentAskList | undefined,
  convos: [] as Conversation[],
}));

vi.mock('@/lib/useKeyboardViewport', () => ({
  useKeyboardViewport: () => {
    h.keyboardHookCalls += 1;
    return { keyboardOpen: h.keyboardOpen };
  },
}));
// Only the query and the socket are stubbed; the RULES the bar is made of
// (`askBarFace`, `outstandingRows`) are the real thing, so a fixture that says
// "today's page is not sent" produces the same bar a dealer would actually see.
vi.mock('@/hooks/api/useAsks', async (orig) => {
  const actual = await orig<typeof AsksModule>();
  return {
    ...actual,
    useMyAsks: () => ({ data: h.asks }),
    useAskListSocket: () => undefined,
  };
});
vi.mock('@/hooks/useAskQueueSync', () => ({
  useAskQueueSync: () => ({ sending: false }),
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

const { AppShell } = await import('./AppShell');
const { ChatListPage } = await import('./pages/ChatListPage');

/**
 * The shell: the frame every screen is drawn in, and the one line under each
 * screen's top bar that says the dealer owes MDG a piece of paper.
 *
 * WHAT THIS FILE IS FOR
 * ---------------------
 * The shell draws NO header and NO tab bar — each screen draws one `AppBar` of
 * its own — so the first half of this file pins the frame: nothing stacked above
 * a screen's own bar, nothing reserved at the bottom, and a fixed-height frame
 * for an open conversation only.
 *
 * The second half is the ask bar. `AskBar` replaced `DensityChatPin` — a card
 * above the chat list saying "send today's register page". The register page has
 * stopped being the only paper MDG asks a dealer for, so the shell mounts the
 * bar's engine once, and every top bar hangs the strip under itself; two lines on
 * one screen both saying "send today's photo" is a worse screen than one.
 *
 * The pin itself never had a test, which is why the reported bug below — a
 * reminder that unmounted in the same frame it appeared, for exactly the people
 * who write the register by hand — got as far as a dealer's phone. So every rule
 * the bar's placement depends on is asserted here, including the ones the pin
 * would have failed (it lived inside `ChatListPage`, so it died with the
 * redirect and never followed the dealer onto another screen). Two tests below
 * mark where the bar deliberately behaves UNLIKE the pin, each with the reason.
 *
 * These are placement tests. What the bar SAYS, and when it decides to say it,
 * is `askRules.test.ts` and `AskBar.test.tsx`.
 */

/** The English the bar shows when exactly one page is owed. */
const BAR_EN = "Send Today's register page";

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

/** Today's register page has not been sent, and nothing else is outstanding. */
function dueToday(): DealerDocumentAskList {
  return makeAskList({ rows: [makeAskRow({ periodKey: TODAY })] });
}

/**
 * A stand-in for a screen: nothing but its own top bar, which is where the shell
 * hangs the ask strip. A route stub WITHOUT one would prove nothing about where
 * the strip goes. The bar's title is the stub's only text.
 */
function Screen({ name }: { name: string }) {
  return <AppBar title={name} />;
}

function renderShell(route: string) {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/chat/:id" element={<Screen name="thread-page" />} />
        <Route path="/chat/:id/info" element={<Screen name="info-page" />} />
        <Route path="/density" element={<Screen name="density-page" />} />
        <Route path="/settings" element={<Screen name="settings-page" />} />
        <Route path="/asks" element={<Screen name="asks-page" />} />
      </Route>
    </Routes>,
    { route, withRouter: true },
  );
}

afterEach(() => {
  resetStores();
  h.keyboardOpen = false;
  h.keyboardHookCalls = 0;
  h.asks = undefined;
  h.convos = [];
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

  it('draws no tab bar', async () => {
    renderShell('/settings');
    await screen.findByText('settings-page');

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    for (const gone of ['Chat', 'Reports', 'Kavach', 'Profile']) {
      expect(screen.queryByRole('link', { name: gone })).not.toBeInTheDocument();
    }
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
    ['/density', 'density-page'],
  ])('leaves %s as an ordinary scrolling page', async (route, title) => {
    const { container } = renderShell(route);
    await screen.findByText(title);

    expect((container.firstElementChild as HTMLElement).style.height).toBe('');
    expect(container.querySelector('main')!.className).not.toMatch(/overflow-hidden/);
  });

  it('leaves the chat list as an ordinary scrolling page', async () => {
    h.convos = [conv({ id: 'support' })];
    const { container } = renderShell('/chat');
    await screen.findByText('Dealer Kavach');

    expect((container.firstElementChild as HTMLElement).style.height).toBe('');
    expect(container.querySelector('main')!.className).not.toMatch(/overflow-hidden/);
  });

  /**
   * The keyboard hook is not for the frame's own sake any more (nothing slides
   * out of the keyboard's way), but it is what publishes `--vvh` / `--kb`, and
   * the composer needs those to stay above the keyboard.
   */
  it('keeps the keyboard hook mounted', async () => {
    renderShell('/settings');
    await screen.findByText('settings-page');
    expect(h.keyboardHookCalls).toBeGreaterThan(0);
  });
});

describe('AppShell — the ask bar', () => {
  /**
   * The reported bug, still guarded. A `dealer-staff` member (the manager) has
   * exactly ONE conversation, and so does an owner at a pump with no manager. The
   * reminder used to be mounted inside the chat list, so it unmounted in the same
   * frame the list redirected them into their thread, and the daily chore was
   * invisible to the very person who writes the register by hand. The engine now
   * lives in the shell, so the strip is there on the list AND follows them into
   * the thread.
   */
  it('is on the chat list for a member with exactly one conversation — and follows them into the thread', async () => {
    h.asks = dueToday();
    h.convos = [conv({ id: 'only' })];

    renderShell('/chat');

    // No auto-forward: the list is shown, with its one row, and the strip under its bar.
    expect(await screen.findByText('Dealer Kavach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BAR_EN })).toBeInTheDocument();
  });

  it('is under the bar of an open conversation', async () => {
    h.asks = dueToday();

    renderShell('/chat/only');

    expect(await screen.findByText('thread-page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BAR_EN })).toBeInTheDocument();
  });

  it('still shows above the list for a member with several conversations', async () => {
    h.asks = dueToday();
    h.convos = [conv({ id: 'support' }), conv({ id: 'mgr', kind: 'manager' })];

    renderShell('/chat');

    expect(await screen.findByText('Manager chat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BAR_EN })).toBeInTheDocument();
  });

  /**
   * /density renders the full register card itself. A bar saying the same thing
   * above it would put two versions of one chore on one screen — which is the
   * whole reason the bar replaced the pin rather than joining it.
   */
  it('is not repeated on the density screen', async () => {
    h.asks = dueToday();

    renderShell('/density');

    expect(await screen.findByText('density-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BAR_EN })).not.toBeInTheDocument();
  });

  it('is not repeated on the ask list either', async () => {
    h.asks = dueToday();

    renderShell('/asks');

    expect(await screen.findByText('asks-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BAR_EN })).not.toBeInTheDocument();
  });

  /**
   * UNLIKE THE PIN, DELIBERATELY. `DensityChatPin` was rendered inside
   * `ChatListPage`, so it existed on exactly one screen — chat, because chat is
   * where a register photograph belonged. The bar is about every paper MDG has
   * asked for, and a dealer reading Settings is exactly as able to answer one,
   * so it follows them from screen to screen. It steps aside only for the two
   * screens that already show the same chore at full size.
   */
  it('follows the dealer onto the other screens', async () => {
    h.asks = dueToday();

    renderShell('/settings');

    expect(await screen.findByText('settings-page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BAR_EN })).toBeInTheDocument();
  });

  /**
   * UNLIKE A BOTTOM BAR, DELIBERATELY. Anything pinned to the bottom edge has to
   * get out of the keyboard's way. A 44px strip at the TOP has no such conflict,
   * and hiding it would reflow the message list by 44px every time the dealer
   * tapped the composer. So the obvious-looking `!keyboardOpen` is wrong here,
   * and this test is what stops somebody adding it by analogy.
   */
  it('stays put while the keyboard is up', async () => {
    h.asks = dueToday();
    h.keyboardOpen = true;

    renderShell('/chat/only');

    expect(await screen.findByText('thread-page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BAR_EN })).toBeInTheDocument();
  });

  it('renders nothing at all once everything has been sent', async () => {
    h.asks = makeAskList({
      rows: [
        makeAskRow({ periodKey: YESTERDAY, state: 'ACCEPTED', waitingOn: 'none' }),
      ],
    });
    h.convos = [conv({ id: 'only' })];

    renderShell('/chat');

    expect(await screen.findByText('Dealer Kavach')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BAR_EN })).not.toBeInTheDocument();
  });

  /**
   * A paper sitting in MDG's review queue is OUR backlog. A bar about it would
   * be telling the dealer off for something they have already done.
   */
  it('says nothing while a paper is waiting on MDG', async () => {
    h.asks = makeAskList({
      rows: [makeAskRow({ periodKey: TODAY, state: 'SENT', waitingOn: 'mdg' })],
    });
    h.convos = [conv({ id: 'only' })];

    renderShell('/chat');

    expect(await screen.findByText('Dealer Kavach')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BAR_EN })).not.toBeInTheDocument();
  });
});
