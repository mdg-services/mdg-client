import * as React from 'react';
import { Outlet, useMatch } from 'react-router-dom';

import { Spinner } from '@/components/ui';
import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import { useOutletSetupSocket } from '@/features/setup/useOutletSetupSocket';
import { useMe } from '@/hooks/api/useMe';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useDeliveryAck } from '@/hooks/useDeliveryAck';
import { usePushBridge } from '@/hooks/usePushBridge';
import { cn } from '@/lib/cn';
import { useKeyboardViewport } from '@/lib/useKeyboardViewport';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';

/**
 * The authenticated app frame: the app-wide realtime hooks, and the box every
 * screen is drawn in. It is a separate route-level chunk (lazy-loaded in App.tsx
 * via a layout route) for two reasons:
 *
 *  1. The socket.io / realtime stack and these hooks never ship in the
 *     unauthenticated login chunk — a low-bandwidth dealer who only ever sees the
 *     login screen downloads none of it.
 *  2. Mounted ONCE by the layout route, so moving between screens swaps only the
 *     <Outlet/> content instead of unmounting/remounting the shell — useMe no
 *     longer refetches and the socket does not re-subscribe on every tap.
 *
 * IT DRAWS NO HEADER AND NO TAB BAR. The app is the chat: the chat list is the
 * first screen, Settings hangs off its ⋮ menu, and every screen draws exactly one
 * top bar of its own (`AppBar`) — a back arrow where there is somewhere to go
 * back to. A shell header above those would stack two bars on every screen, and a
 * tab bar would put four doors on a screen that has one. Nothing here reserves
 * room at the bottom any more either, so there is no `pb-20`: the composer's own
 * safe-area padding is what governs the bottom edge of a conversation.
 */
export function AppShell() {
  useMe(); // refresh /me when authed
  useConversationsListSocket(); // keep the chat LIST + unread counts live app-wide
  useOutletSetupSocket(); // keep the setup cards + strip following MDG's team
  // …and loaded, wherever the app was opened. An old link can open it cold on
  // /documents or /density, and those routes now just open the member's own chat
  // (`OpenMyChat`) by reading this list — with nothing loaded they could only
  // fall back to the list itself.
  useMyConversations();
  useDeliveryAck(); // ack message delivery (✓✓) app-wide, even off the chat screen
  usePushBridge(); // register push token + handle deep links from native
  // Called for its side effect. It publishes `--vvh` / `--kb` on <html>, which is
  // what keeps the composer above the keyboard; nothing in this frame reads the
  // returned flag now that there is no bottom bar to slide out of its way.
  useKeyboardViewport();
  const user = useAuthStore((s) => s.user);
  const setLangFromUser = useLangStore((s) => s.setLangFromUser);

  // An open conversation (/chat/:id) is a full-height messaging screen with its
  // own composer pinned to the bottom. On that route we bind the frame to the
  // *visible* viewport height so the composer stays above the keyboard even on
  // devices/keyboards where the native window doesn't resize (many tablets,
  // split/floating keyboards). Height resolves in order of reliability:
  //   1. --vvh   — JS-measured visual-viewport height (covers iOS Safari / any
  //                WebView that doesn't honour interactive-widget).
  //   2. 100dvh  — the dynamic viewport unit. With `interactive-widget=
  //                resizes-content` (see index.html) the keyboard shrinks the
  //                layout viewport, so dvh already excludes the keyboard even
  //                before JS runs and regardless of visualViewport quirks.
  // Every other route (the list, the media page, chat info, Settings and the
  // rest) keeps normal document flow + scrolling. The match is exact on purpose:
  // `/chat/:id/media` and `/chat/:id/info` scroll as ordinary pages.
  const inConversation = !!useMatch('/chat/:id');

  // A returning member lands in their saved language (unless they've already
  // made an explicit local pick). Guarded inside the store, so this is idempotent.
  React.useEffect(() => {
    if (user) setLangFromUser(user);
  }, [user, setLangFromUser]);

  return (
    <div
      className={cn('flex flex-col bg-bg', !inConversation && 'min-h-full')}
      style={inConversation ? { height: 'var(--vvh, 100dvh)' } : undefined}
    >
      <main
        className={cn(
          'mx-auto flex w-full max-w-md flex-col md:max-w-2xl lg:max-w-3xl',
          // In a conversation the frame is a fixed height (--vvh): clip here
          // and let the message list scroll internally, so the composer stays
          // pinned to the bottom. No bottom padding either way.
          inConversation ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1',
        )}
      >
        {/* The shell stays painted while the next page's chunk streams in. */}
        <React.Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center py-20">
              <Spinner size={22} />
            </div>
          }
        >
          <Outlet />
        </React.Suspense>
      </main>
    </div>
  );
}
