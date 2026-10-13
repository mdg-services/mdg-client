import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppBar } from '@/components/AppBar';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

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

const { AppShell } = await import('./AppShell');
const { ChatListPage } = await import('./pages/ChatListPage');

/**
 * The shell: the frame every screen is drawn in.
 *
 * The shell draws NO header and NO tab bar — each screen draws one `AppBar` of
 * its own — so this file pins the frame: nothing stacked above a screen's own
 * bar, nothing reserved at the bottom, and a fixed-height frame for an open
 * conversation only.
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

/**
 * A stand-in for a screen: nothing but its own top bar. A route stub WITHOUT one
 * would prove nothing about what hangs under a bar. The bar's title is the
 * stub's only text.
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
        <Route path="/settings" element={<Screen name="settings-page" />} />
        <Route path="/services" element={<Screen name="services-page" />} />
      </Route>
    </Routes>,
    { route, withRouter: true },
  );
}

afterEach(() => {
  resetStores();
  h.keyboardOpen = false;
  h.keyboardHookCalls = 0;
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
    await screen.findByText('Dealer Kavach');

    expect(screen.queryByRole('button', { name: /to send|Send /i })).not.toBeInTheDocument();
  });
});
