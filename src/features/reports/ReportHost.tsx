import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { useHideTabBar } from '@/features/tabs/tabBarVisibility';
import { getSocket } from '@/lib/socket';
import { isPageVisible } from '@/lib/usePageVisible';

import type { ChatTarget } from './reportActions';
import {
  homePath,
  outletHintOf,
  parseReportPath,
  readReportState,
  useOpenReport,
  useCloseReport,
  useRealLocation,
  type ReportRouteState,
  type ReportTarget,
} from './reportNav';
import { ReportOverlay } from './ReportOverlay';

/**
 * The overlay for `/report/:conversationId/:messageId` (ADR 0056 §4), mounted by the app shell.
 *
 * `App` draws the screen the dealer came from underneath (see `reportNav.ts`); this draws the
 * overlay over it. It decides what the overlay's buttons do:
 *
 *  - Close and the phone's Back are the same thing: pop the entry, and the screen beneath is
 *    simply there. With nothing earlier in the app's history (a push on a cold start, a pasted
 *    link) the pop would leave the app, so Close goes to Today instead, replacing the entry.
 *  - "See newer" REPLACES this overlay, keeping the screen beneath, so Back never walks through
 *    every report the dealer touched.
 *  - "See in chat" pushes the chat at this message; Back returns here. When the chat is already
 *    the screen beneath, it just closes, and the dealer is where they were; unless "See newer"
 *    moved the overlay to a different message, and then the chat is taken to that one.
 *  - "Today's page", from a report that will not open, REPLACES the dead overlay.
 *  - A report's own button that names a box in the chat (the photo ask, the DU OTP steps) or a
 *    sentence to type opens the chat there. With the chat already beneath, the overlay closes
 *    first and the chat is then told (by replacing the entry once the pop has landed), so Back
 *    from the box still leaves the app in one press.
 *
 * The tab bar is hidden for as long as it is mounted.
 */
export function ReportHost() {
  const real = useRealLocation();
  const target = parseReportPath(real.pathname);
  if (!target) return null;
  // Keyed by the message: an overlay replaced by another one starts with a clean state.
  return (
    <RouteOverlay
      key={target.messageId}
      target={target}
      state={readReportState(real.state)}
      outletHint={outletHintOf(real.search, real.state)}
    />
  );
}

function RouteOverlay({
  target,
  state,
  outletHint,
}: {
  target: ReportTarget;
  state: ReportRouteState;
  outletHint: string | undefined;
}) {
  const navigate = useNavigate();
  const close = useCloseReport(homePath());
  const open = useOpenReport();
  useHideTabBar(true);

  // A report the dealer opens is read: without this the chat and the Chats tab keep counting a
  // message they have seen, and the team never gets the "seen" tick. Only while the page is on
  // screen: "seen" means a person looked.
  React.useEffect(() => {
    if (!isPageVisible()) return;
    getSocket()?.emit('read', { conversationId: target.conversationId, messageIds: [target.messageId] });
  }, [target.conversationId, target.messageId]);

  const seeInChat = React.useCallback(
    (to: ReportTarget) => {
      const chat = `/chat/${encodeURIComponent(to.conversationId)}`;
      if (state.backgroundLocation?.pathname === chat) {
        // The chat beneath is where the dealer left it: at the message this overlay was first opened
        // for. After "See newer" the message asked for is another one, so the chat is moved to it.
        if (state.openedFromMessageId && state.openedFromMessageId !== to.messageId) {
          afterPop(() => navigate(chat, { replace: true, state: { jumpToMessageId: to.messageId } }));
        }
        close();
        return;
      }
      navigate(chat, { state: { jumpToMessageId: to.messageId } });
    },
    [state.backgroundLocation, state.openedFromMessageId, close, navigate],
  );

  const openChat = React.useCallback(
    (to: ChatTarget) => {
      const chat = `/chat/${encodeURIComponent(to.conversationId)}`;
      const chatState = to.draft ? { draftText: to.draft } : to.messageId ? { jumpToMessageId: to.messageId } : null;
      if (state.backgroundLocation?.pathname === chat) {
        // The chat is already under this overlay: pop it, then tell the chat where to go.
        afterPop(() => navigate(chat, { replace: true, state: chatState }));
        close();
        return;
      }
      navigate(chat, { state: chatState });
    },
    [state.backgroundLocation, close, navigate],
  );

  return (
    <ReportOverlay
      conversationId={target.conversationId}
      messageId={target.messageId}
      placeholder={state.report}
      onClose={close}
      onOpenNewer={(to) => open(to)}
      onSeeInChat={seeInChat}
      onOpenChat={openChat}
      onNavigate={(to) => navigate(to)}
      outletHint={outletHint}
      onGoToday={() => navigate(homePath(), { replace: true })}
    />
  );
}

/**
 * Run `run` once the history pop that Close started has landed. A WebView that never sends the
 * event is covered by a short timer, so the button never does nothing.
 */
function afterPop(run: () => void): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', go);
    window.clearTimeout(timer);
    run();
  };
  window.addEventListener('popstate', go);
  const timer = window.setTimeout(go, 400);
}
