import type { Message } from '@dk/shared/types';
import { Check, CheckCheck } from 'lucide-react';

import { cn } from '@/lib/cn';

import { MessageAttachment } from './AttachmentPreview';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MessageBubble({
  message,
  mine,
  showReadIndicator,
  onOpenImage,
}: {
  message: Message;
  mine: boolean;
  showReadIndicator?: boolean;
  onOpenImage?: (url: string) => void;
}) {
  const readByOther = message.readBy.some((id) => id !== message.senderId);
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
                onOpenImage={onOpenImage}
              />
            ))}
          </div>
        ) : null}
        {message.body ? (
          <div
            className={cn(
              'whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-snug shadow-sm',
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
          {mine && showReadIndicator ? (
            readByOther ? (
              <CheckCheck width={13} strokeWidth={2} className="text-[#0f766e]" />
            ) : (
              <Check width={13} strokeWidth={2} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
