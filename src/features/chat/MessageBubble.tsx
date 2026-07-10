import { Check, CheckCheck, Clock } from 'lucide-react';
import * as React from 'react';

import { RecordCard } from '@/features/records/RecordCard';
import { useRecord } from '@/hooks/api/useRecords';
import { cn } from '@/lib/cn';
import type { Message } from '@dk/shared/types';

import { MessageAttachment } from './AttachmentPreview';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function CardMessage({ message }: { message: Message }) {
  const card = message.card!;
  // Resolve the signed file URL so the card is tappable.
  const recordQuery = useRecord(card.recordId);
  const url = recordQuery.data?.attachment.url;

  return (
    <div className="flex w-full flex-col items-center gap-1.5 animate-in">
      {message.body ? (
        <p className="max-w-[80%] text-center text-xs text-text-muted">
          {message.body}
        </p>
      ) : null}
      <div className="w-full max-w-[88%]">
        <RecordCard
          record={{
            recordType: card.recordType,
            title: card.title,
            periodLabel: card.periodLabel,
          }}
          url={url}
          compact
        />
      </div>
      <span className="px-1 text-[11px] text-text-subtle">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

function SystemMessage({ message }: { message: Message }) {
  return (
    <div className="flex w-full justify-center animate-in">
      <p className="max-w-[85%] rounded-full bg-surface-2 px-3 py-1 text-center text-[12px] text-text-muted">
        {message.body}
      </p>
    </div>
  );
}

/** WhatsApp-style delivery state for one of the current user's own messages. */
function MessageTicks({ message }: { message: Message }) {
  // Optimistic, not yet acknowledged by the server.
  if (message.id.startsWith('temp-')) {
    return <Clock width={12} strokeWidth={2} className="opacity-70" />;
  }
  const seen = (message.readBy ?? []).some((id) => id !== message.senderId);
  if (seen) {
    return <CheckCheck width={14} strokeWidth={2} className="text-[#34b7f1]" />;
  }
  const delivered = (message.deliveredTo ?? []).some(
    (id) => id !== message.senderId,
  );
  if (delivered) {
    return <CheckCheck width={14} strokeWidth={2} />;
  }
  return <Check width={14} strokeWidth={2} />;
}

// Memoized: message objects are updated immutably in the query cache (see
// useConversationSocket applyReceipt / onNewMessage), so a typing toggle, a
// delivery/read receipt, or a new message re-renders only the changed bubble
// instead of every bubble in the thread.
export const MessageBubble = React.memo(function MessageBubble({
  message,
  mine,
  onOpenImage,
}: {
  message: Message;
  mine: boolean;
  onOpenImage?: (url: string) => void;
}) {
  if (message.card) {
    return <CardMessage message={message} />;
  }
  if (message.system) {
    return <SystemMessage message={message} />;
  }

  return (
    <div
      className={cn(
        'flex w-full animate-in',
        mine ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'flex max-w-[78%] flex-col gap-1.5',
          mine ? 'items-end' : 'items-start',
        )}
      >
        {message.attachments.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {message.attachments.map((a) => (
              <MessageAttachment
                key={a.storageKey}
                attachment={a}
                mine={mine}
                onOpenImage={onOpenImage}
              />
            ))}
          </div>
        ) : null}
        {message.body ? (
          <div
            className={cn(
              // Re-enable selection + long-press callout on the message BODY only
              // (chrome is user-select:none via #root) so copy-a-message survives.
              'select-text [-webkit-touch-callout:default] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-snug shadow-sm',
              mine
                ? 'bg-brand text-text-inverse rounded-br-md'
                : 'bg-surface text-text border border-border rounded-bl-md',
            )}
          >
            {message.body}
          </div>
        ) : null}
        <div
          className={cn(
            'flex items-center gap-1 px-1 text-[11px] text-text-subtle',
            mine ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine ? <MessageTicks message={message} /> : null}
        </div>
      </div>
    </div>
  );
});
