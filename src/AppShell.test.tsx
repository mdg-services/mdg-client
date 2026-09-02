import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as AsksModule from '@/hooks/api/useAsks';
import { useLangStore } from '@/store/lang';
import { TODAY, YESTERDAY, makeAskList, makeAskRow } from '@/test/askFixtures';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation, DealerDocumentAskList } from '@dk/shared/types';

// The shell's app-wide side effects — /me, the two sockets, the delivery ack and
// the native push bridge — are not what this file is about, and every one of
// them reaches for a network or a native bridge jsdom does not have.
vi.mock('@/hooks/api/useMe', () => ({ useMe: () => undefined }));
vi.mock('@/features/records/useRecordsSocket', () => ({
  useRecordsSocket: () => undefined,
}));
vi.mock('@/features/chat/useConversationsListSocket', () => ({
  useConversationsListSocket: () => undefined,
}));
vi.mock('@/hooks/useDeliveryAck', () => ({ useDeliveryAck: () => undefined }));
vi.mock('@/hooks/usePushBridge', () => ({ usePushBridge: () => undefined }));

const h = vi.hoisted(() => ({
  keyboardOpen: false,
  asks: undefined as DealerDocumentAskList | undefined,
  convos: [] as Conversation[],
}));

vi.mock('@/lib/useKeyboardViewport', () => ({
  useKeyboardViewport: () => ({ keyboardOpen: h.keyboardOpen }),
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
 * The shell, and the one line under its header that says the dealer owes MDG a
 * piece of paper.
 *
 * WHAT THIS FILE IS FOR
 * ---------------------
 * `AskBar` replaced `DensityChatPin` — a card above the chat list saying "send
 * today's register page". The register page has stopped being the only paper MDG
 * asks a dealer for, so the shell mounts the bar instead, which covers the
 * register page as ONE document kind among several; two lines on one screen both
 * saying "send today's photo" is a worse screen than one.
 *
 * The pin itself never had a test, which is why the reported bug below — a
 * reminder that unmounted in the same frame it appeared, for exactly the people
 * who write the register by hand — got as far as a dealer's phone. So every rule
 * the bar's placement depends on is asserted here, including the three the pin
 * would have failed (it lived inside `ChatListPage`, so it died with the
 * redirect and never followed the dealer onto another tab). Two tests below mark
 * where the bar deliberately behaves UNLIKE the pin, each with the reason.
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

function renderShell(route: string) {
  signIn({ id: 'owner', dealerId: 'd1' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/chat/:id" element={<div>thread-page</div>} />
        <Route path="/density" element={<div>density-page</div>} />
        <Route path="/records" element={<div>records-page</div>} />
        <Route path="/asks" element={<div>asks-page</div>} />
      </Route>
    </Routes>,
    { route, withRouter: true },
  );
}

describe('AppShell — the ask bar', () => {
  afterEach(() => {
    resetStores();
    h.keyboardOpen = false;
    h.asks = undefined;
    h.convos = [];
  });

  /**
   * The reported bug, still guarded. A `dealer-staff` member (the manager) has
   * exactly ONE conversation, and so does an owner at a pump with no manager —
   * so ChatListPage redirects both of them into their thread the moment it
   * renders. While the reminder was mounted inside that page it unmounted in the
   * same frame, and the daily chore was invisible to the very person who writes
   * the register by hand. The shell survives the redirect, so the bar follows
   * them in.
   */
  it('stays on screen for a member with exactly one conversation', async () => {
    h.asks = dueToday();
    h.convos = [conv({ id: 'only' })];

    renderShell('/chat');

    // The redirect still happens — that WhatsApp-simple landing is deliberate…
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
    // …and the reminder followed them into the thread instead of dying with the list.
    expect(screen.getByRole('button', { name: BAR_EN })).toBeInTheDocument();
  });

  it('still shows above the list for a member with several conversations', async () => {
    h.asks = dueToday();
    h.convos = [conv({ id: 'support' }), conv({ id: 'mgr', kind: 'manager' })];

    renderShell('/chat');

    expect(await screen.findByText('Chats')).toBeInTheDocument();
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

  /**
   * UNLIKE THE PIN, DELIBERATELY. `DensityChatPin` was rendered inside
   * `ChatListPage`, so it existed on exactly one screen — chat, because chat is
   * where a register photograph belonged. The bar is about every paper MDG has
   * asked for, and a dealer reading their reports is exactly as able to answer
   * one, so it lives in the shell and follows them. It steps aside only for the
   * two screens that already show the same chore at full size.
   */
  it('follows the dealer onto the other tabs', async () => {
    h.asks = dueToday();

    renderShell('/records');

    expect(await screen.findByText('records-page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BAR_EN })).toBeInTheDocument();
  });

  /**
   * UNLIKE THE TAB BAR, DELIBERATELY. Everything else the shell draws around a
   * conversation gets out of the keyboard's way: the tab bar is
   * `fixed inset-x-0 bottom-0` and would otherwise sit between the composer and
   * the keyboard, so it slides off. A 44px bar at the TOP has no such conflict,
   * and hiding it would reflow the message list by 44px every time the dealer
   * tapped the composer. So the obvious-looking `!keyboardOpen` is wrong here,
   * and this test is what stops somebody adding it by analogy.
   */
  it('stays put while the keyboard is up', async () => {
    h.asks = dueToday();
    h.convos = [conv({ id: 'only' })];
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

    expect(await screen.findByText('thread-page')).toBeInTheDocument();
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

    expect(await screen.findByText('thread-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BAR_EN })).not.toBeInTheDocument();
  });
});
