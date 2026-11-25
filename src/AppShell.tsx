import * as React from 'react';
import { Outlet, useMatch } from 'react-router-dom';

import { ChooseLanguageScreen, mustChooseLanguage } from '@/components/ChooseLanguageScreen';
import { RouteFallback } from '@/components/RouteFallback';
import { useComplaintsSocket } from '@/features/chat/useComplaintsSocket';
import { useConversationsListSocket } from '@/features/chat/useConversationsListSocket';
import { useDeclarationsSocket } from '@/features/chat/useDeclarationsSocket';
import { useDuOtpSocket } from '@/features/chat/useDuOtpSocket';
import { useMockDrillSocket } from '@/features/chat/useMockDrillSocket';
import { useWorkPermitsSocket } from '@/features/chat/useWorkPermitsSocket';
import { ReportHost } from '@/features/reports/lazy';
import { parseReportPath, useRealLocation } from '@/features/reports/reportNav';
import { useOutletSetupSocket } from '@/features/setup/useOutletSetupSocket';
import { TabBar } from '@/features/tabs/TabBar';
import { WhatsNewGate } from '@/features/whatsNew/WhatsNewGate';
import { useMe } from '@/hooks/api/useMe';
import { useMyConversations } from '@/hooks/api/useMyConversations';
import { useDeliveryAck } from '@/hooks/useDeliveryAck';
import { usePushBridge } from '@/hooks/usePushBridge';
import { useReachReport } from '@/hooks/useReachReport';
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
 * IT DRAWS NO HEADER. Every screen draws exactly one top bar of its own
 * (`AppBar`) — a back arrow where there is somewhere to go back to — and a shell
 * header above those would stack two bars on every screen.
 *
 * ITS ONLY BOTTOM BAR IS THE THREE-TAB ONE (ADR 0055, 0056): Today, Chats and
 * Reports, drawn on those three screens and nowhere else — not in a conversation,
 * Settings or any sub-page, not in the extension's panel, not while the keyboard is
 * up, not under an open report. It sits in the frame's own flow, so no screen
 * reserves room for it, and the composer's safe-area padding still governs the
 * bottom edge of a conversation.
 *
 * IT HOSTS THE REPORT OVERLAY. `/report/:conversationId/:messageId` is drawn over the
 * screen the dealer came from, which `App` keeps mounted underneath (reportNav.ts), so
 * the overlay is mounted here, once, beside the screens and not instead of one.
 */
export function AppShell() {
  useMe(); // refresh /me when authed
  useConversationsListSocket(); // keep the chat LIST + unread counts live app-wide
  useOutletSetupSocket(); // keep the setup cards + strip following MDG's team
  useDuOtpSocket(); // keep the DU OTP box in the chat following the portal and the owner's answers
  useComplaintsSocket(); // keep the complaint boxes following the filing, the portal and the engineer
  useWorkPermitsSocket(); // keep the work-permit box following the issue run and the close
  useMockDrillSocket(); // keep the Mock Drill box following the admin's check and the filing
  useDeclarationsSocket(); // keep the Declarations box following the filing of the washroom photos
  // …and loaded, wherever the app was opened. An old link can open it cold on
  // /documents or /density, and those routes now just open the member's own chat
  // (`OpenMyChat`) by reading this list — with nothing loaded they could only
  // fall back to the list itself.
  useMyConversations();
  useDeliveryAck(); // ack message delivery (✓✓) app-wide, even off the chat screen
  usePushBridge(); // learn where notifications stand, register the push token, handle deep links from native
  useReachReport(); // tell the server where notifications stand on this phone (the team's reach line)
  // It publishes `--vvh` / `--kb` on <html>, which is what keeps the composer above
  // the keyboard, and says whether the keyboard is up, so the tab bar can step aside.
  const { keyboardOpen } = useKeyboardViewport();
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
  // An open report is drawn over whatever screen is on show; `useMatch` above sees that
  // screen, so the overlay's own address is read from the app's real location.
  const reportOpen = parseReportPath(useRealLocation().pathname) !== null;

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
        {/* Seen only when there is no screen to keep showing (the app
            opening on a screen). A tap from one screen to another keeps the
            old one up while the next downloads: navigation is a transition
            (main.tsx), and NavigationProgress (App.tsx) shows it is coming. */}
        {/* Before anything else, once: which language everything comes in. */}
        {mustChooseLanguage(user) ? (
          <ChooseLanguageScreen />
        ) : (
          <React.Suspense fallback={<RouteFallback className="flex-1 py-20" />}>
            <Outlet />
          </React.Suspense>
        )}
      </main>
      {/* Not over the language choice: nothing is behind it to switch between. */}
      {mustChooseLanguage(user) ? null : <TabBar keyboardOpen={keyboardOpen} />}
      {/* A report, over everything above. Its code is its own chunk, so nothing is
          downloaded until the first report opens (and `App` preloads it). */}
      {reportOpen && !mustChooseLanguage(user) ? (
        <React.Suspense fallback={null}>
          <ReportHost />
        </React.Suspense>
      ) : null}
      {/* The one-time "what is new" video: opens itself on Today in the phone app (ADR 0056). */}
      <WhatsNewGate />
    </div>
  );
}
