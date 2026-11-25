import * as React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { afterOverlayCloses } from '@/lib/afterOverlayCloses';
import { useBackToClose } from '@/lib/useBackToClose';
import type { TodayReport } from '@dk/shared/types';

import type { ChatTarget } from './reportActions';
import type { ReportTarget } from './reportNav';
import { ReportOverlay } from './ReportOverlay';

/**
 * The report overlay INSIDE the thread, for the extension's side panel (ADR 0056 §4): the panel
 * has no Today and no tab bar, so a report cannot open as a route over another screen. The chat
 * bubble's button opens this instead, on top of the thread, and the thread stays where it was.
 *
 * It owns one history entry (`useBackToClose`), like every other sheet, so the phone's Back and
 * Close do the same thing. "See newer" swaps the content in place. "See in chat" closes the
 * overlay and jumps to the message in this thread (or opens the other chat, if the newer report
 * lives in one).
 */
export function ReportModal({
  conversationId,
  messageId,
  placeholder,
  onClose,
  onJumpTo,
}: {
  conversationId: string;
  messageId: string;
  placeholder?: TodayReport | undefined;
  onClose: () => void;
  /** Scroll the thread to a message of its own. */
  onJumpTo?: ((messageId: string) => void) | undefined;
}) {
  const navigate = useNavigate();
  useBackToClose(onClose);
  const [target, setTarget] = React.useState<ReportTarget>({ conversationId, messageId });

  const seeInChat = (to: ReportTarget) => {
    onClose();
    afterOverlayCloses(() => {
      if (to.conversationId === conversationId && onJumpTo) onJumpTo(to.messageId);
      else navigate(`/chat/${encodeURIComponent(to.conversationId)}`, { state: { jumpToMessageId: to.messageId } });
    });
  };

  // A report's own button that names a box in the chat, or a sentence to type unsent.
  const openChat = (to: ChatTarget) => {
    onClose();
    afterOverlayCloses(() => {
      const chat = `/chat/${encodeURIComponent(to.conversationId)}`;
      if (to.draft) navigate(chat, { state: { draftText: to.draft } });
      else if (to.conversationId === conversationId && onJumpTo && to.messageId) onJumpTo(to.messageId);
      else navigate(chat, { state: { jumpToMessageId: to.messageId } });
    });
  };

  return createPortal(
    <ReportOverlay
      key={target.messageId}
      conversationId={target.conversationId}
      messageId={target.messageId}
      placeholder={placeholder && placeholder.messageId === target.messageId ? placeholder : undefined}
      onClose={onClose}
      onOpenNewer={setTarget}
      onSeeInChat={seeInChat}
      onOpenChat={openChat}
      onNavigate={(to) => {
        onClose();
        afterOverlayCloses(() => navigate(to));
      }}
      onGoToday={onClose}
    />,
    document.body,
  );
}
